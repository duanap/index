import { getEmDashCollection } from "emdash";
import { getPosts, publicContent } from "./posts";
import { language } from "../i18n";

export const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export async function sitemapUrls(site: URL, locals: object) {
  const paths = [
    "/",
    "/posts/",
    "/about/",
    "/friends/",
    "/messages/",
    ...(await getPosts(locals)).map(
      (p) => `/posts/${encodeURIComponent(p.id)}/`,
    ),
  ];
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
    for (const entry of result.entries)
      paths.push(`/pages/${encodeURIComponent(entry.data.slug || entry.id)}/`);
    cursor = result.nextCursor;
    if (cursor && seen.has(cursor))
      throw new Error("Page pagination did not advance");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return paths.map((p) => new URL(p, site).href);
}
