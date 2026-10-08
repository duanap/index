import {
  type ContentSeo,
  getEmDashCollection,
  getEmDashEntry,
  getRequestContext,
  runWithContext,
} from "emdash";
import { language } from "../i18n";
import {
  loadPosts,
  normalizePost,
  type Post,
  type PostSummary,
} from "./cms-posts";
export { summarize, getHeadings } from "./cms-posts";
export type { Post, PostSummary } from "./cms-posts";

const requests = new WeakMap<object, Promise<Post[]>>();
export function getPosts(locals: object) {
  let result = requests.get(locals);
  if (!result) {
    result = publicContent(() => loadPosts(getEmDashCollection, language));
    requests.set(locals, result);
  }
  return result;
}

export async function getPost(slug: string) {
  const { entry, error } = await getEmDashEntry("posts", slug, {
    locale: language,
  });
  if (error) throw error;
  if (!entry) return undefined;
  const data = entry.data as unknown as Record<string, unknown>;
  if (data.locale && data.locale !== language) return undefined;
  return normalizePost(entry, language);
}

export const getPostId = (post: Post) => post.id;
export const getTags = (posts: PostSummary[]) => [
  ...new Set(posts.flatMap((post) => post.tags)),
];
export const getCategories = (posts: PostSummary[]) => [
  ...new Set(posts.map((post) => post.category)),
];

/** Feeds and lists must not read draft revisions, even with a valid preview token. */
export function publicContent<T>(read: () => T): T {
  return runWithContext(
    { ...getRequestContext(), editMode: false, preview: undefined },
    read,
  );
}

export async function getPage(slug: string) {
  const { entry, error } = await getEmDashEntry("pages", slug, {
    locale: language,
  });
  if (error) throw error;
  if (!entry) return undefined;
  const data = entry.data as unknown as Record<string, unknown>;
  if ((data.locale && data.locale !== language) || data.slug !== slug)
    return undefined;
  return {
    ...entry,
    data: { ...entry.data, seo: data.seo as ContentSeo | undefined },
  };
}
