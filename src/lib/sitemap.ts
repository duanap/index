import { getEmDashCollection, type ContentSeo } from "emdash";
import { getPosts, publicContent } from "./posts";
import { language } from "../i18n";
import { getFeatureEntries } from "./features";
import { archiveEntries, featureHref } from "./feature-content";
import { getIndexExclusions } from "./index-policy";

export const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export async function sitemapUrls(site: URL, locals: object) {
  const excluded = await getIndexExclusions(locals);
  const paths = [
    "/",
    "/posts/",
    "/about/",
    "/friends/",
    "/messages/",
    "/life/",
    "/projects/",
    "/archives/",
    ...(await getPosts(locals))
      .filter(
        (post) =>
          !post.data.seo?.noIndex && !excluded.has(`posts:${post.databaseId}`),
      )
      .map((p) => `/posts/${encodeURIComponent(p.id)}/`),
  ];
  const posts = await getPosts(locals);
  const life = await getFeatureEntries("life", locals);
  const projects = await getFeatureEntries("projects", locals);
  for (const entry of [...life, ...projects])
    if (!entry.seo?.noIndex && !excluded.has(`${entry.collection}:${entry.id}`))
      paths.push(featureHref(entry));
  for (const group of archiveEntries([
    ...posts.map((post) => ({ date: post.data.date })),
    ...life,
  ]))
    paths.push(
      `/archives/${group.year}/`,
      `/archives/${group.year}/${group.month}/`,
    );
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const result = await publicContent(() =>
      getEmDashCollection("pages", {
        locale: language,
        status: "published",
        limit: 100,
        cursor,
      }),
    );
    if (result.error) throw result.error;
    for (const entry of result.entries) {
      const data = entry.data as unknown as {
        seo?: ContentSeo;
        locale?: string;
        slug?: string;
        id?: string;
      };
      if (
        !data.seo?.noIndex &&
        !excluded.has(`pages:${data.id}`) &&
        (!data.locale || data.locale === language)
      )
        paths.push(`/pages/${encodeURIComponent(data.slug || entry.id)}/`);
    }
    cursor = result.nextCursor;
    if (cursor && seen.has(cursor))
      throw new Error("Page pagination did not advance");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...new Set(paths)].map((p) => new URL(p, site).href);
}
