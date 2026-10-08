import type { PortableTextBlock, ContentSeo } from "emdash";
import { webpUrl } from "./media/urls";

export type CmsEntry = { id: string; data: unknown };
export type Post = {
  id: string;
  data: {
    title: string;
    description: string;
    date: Date;
    lang: string;
    category: string;
    tags: string[];
    cover: string;
    featured: boolean;
    content: PortableTextBlock[];
    seo?: ContentSeo;
    featured_image?: {
      src?: string;
      alt?: string;
      width?: number;
      height?: number;
      meta?: Record<string, unknown>;
    };
  };
};
export type PostSummary = {
  id: string;
  title: string;
  description: string;
  date: string;
  category: string;
  tags: string[];
  cover: string;
  featured: boolean;
  minutes: number;
  coverImage?: string;
};
export type PostQuery = (
  type: "posts",
  options: {
    locale: string;
    status: "published";
    limit: number;
    cursor?: string;
    orderBy: { date: "desc" };
  },
) => Promise<{ entries: CmsEntry[]; nextCursor?: string; error?: unknown }>;

export function normalizePost(entry: CmsEntry, locale: string): Post {
  const data = entry.data as Record<string, unknown>;
  const terms = data.terms as
    Record<string, { slug: string; label: string }[]> | undefined;
  const category = terms?.category?.[0];
  const date = new Date(
    String(data.date || data.publishedAt || data.createdAt),
  );
  if (Number.isNaN(date.valueOf()))
    throw new Error(`Invalid article date: ${entry.id}`);
  return {
    id: String(data.slug || entry.id),
    data: {
      title: String(data.title || ""),
      description: String(data.excerpt || ""),
      date,
      lang: String(data.locale || locale),
      category: category
        ? ["frontend", "notes", "life"].includes(category.slug)
          ? category.slug
          : category.label
        : "notes",
      tags: terms?.tag?.map((t) => t.label) || [],
      cover: String(data.cover || "notes"),
      featured: data.featured === true || data.featured === 1,
      seo: data.seo as ContentSeo | undefined,
      content: (data.content || []) as PortableTextBlock[],
      featured_image: data.featured_image as Post["data"]["featured_image"],
    },
  };
}

export async function loadPosts(
  query: PostQuery,
  locale: string,
): Promise<Post[]> {
  const posts: Post[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  do {
    const result = await query("posts", {
      locale,
      status: "published",
      limit: 100,
      cursor,
      orderBy: { date: "desc" },
    });
    if (result.error) throw result.error;
    for (const entry of result.entries) {
      const data = entry.data as Record<string, unknown>;
      if (
        data.status !== "published" ||
        (data.locale && data.locale !== locale)
      )
        continue;
      posts.push(normalizePost(entry, locale));
    }
    cursor = result.nextCursor;
    if (cursor && cursors.has(cursor))
      throw new Error("CMS pagination did not advance");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function plainText(content: PortableTextBlock[]): string {
  return content
    .map((b) =>
      b._type === "block" && Array.isArray(b.children)
        ? b.children.map((s: { text?: string }) => s.text || "").join("")
        : String(b.code || ""),
    )
    .join("\n");
}

export function summarize(post: Post): PostSummary {
  const body = plainText(post.data.content);
  const size =
    post.data.lang === "en"
      ? body.trim().split(/\s+/).filter(Boolean).length
      : body.length;
  const rate =
    post.data.lang === "en" ? 200 : post.data.lang === "ja" ? 500 : 400;
  return {
    id: post.id,
    title: post.data.title,
    description: post.data.description,
    date: post.data.date.toISOString().slice(0, 10),
    category: post.data.category,
    tags: post.data.tags,
    cover: post.data.cover,
    featured: post.data.featured,
    minutes: Math.max(1, Math.ceil(size / rate)),
    coverImage: webpUrl(
      post.data.featured_image?.src ||
        (post.data.featured_image?.meta?.storageKey
          ? `/_emdash/api/media/file/${post.data.featured_image.meta.storageKey}`
          : undefined),
    ),
  };
}

export function getHeadings(content: PortableTextBlock[]) {
  return content
    .filter((b) => b._type === "block" && /^h[1-6]$/.test(String(b.style)))
    .map((b) => ({
      depth: Number(String(b.style).slice(1)),
      slug: `h-${b._key}`,
      text: Array.isArray(b.children)
        ? b.children.map((s: { text?: string }) => s.text || "").join("")
        : "",
    }));
}
