import type { ContentSeo, PortableTextBlock } from "emdash";
import type { CmsEntry } from "./cms-posts";
import { webpUrl } from "./media/urls";

export type FeatureCollection = "life" | "projects" | "friends";
export type FeatureEntry = {
  id: string;
  slug: string;
  collection: FeatureCollection;
  locale: string;
  title: string;
  excerpt: string;
  date?: Date;
  content: PortableTextBlock[];
  seo?: ContentSeo;
  image?: string;
  featured: boolean;
  projectType: string;
  url?: string;
  icon: string;
  color: string;
  label: string;
  order: number;
  tags: { slug: string; label: string }[];
};
export type FeatureQuery = (
  collection: FeatureCollection,
  options: {
    locale: string;
    status: "published";
    limit: number;
    cursor?: string;
  },
) => Promise<{ entries: CmsEntry[]; nextCursor?: string; error?: unknown }>;

export function safeSiteLink(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || /[\s\\\u0000-\u001f]/.test(value))
    return undefined;
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeFeature(
  entry: CmsEntry,
  collection: FeatureCollection,
  locale: string,
): FeatureEntry | undefined {
  const data = entry.data as Record<string, unknown>;
  if (data.locale && data.locale !== locale) return undefined;
  if (typeof data.id !== "string")
    throw new Error(`Missing database ID for ${collection}/${entry.id}`);
  const rawDate = data.date || data.publishedAt || data.createdAt;
  const date =
    rawDate instanceof Date
      ? rawDate
      : rawDate
        ? new Date(String(rawDate))
        : undefined;
  if (collection !== "friends" && (!date || Number.isNaN(date.valueOf())))
    throw new Error(`Invalid ${collection} date: ${entry.id}`);
  const image = data.featured_image as
    { src?: string; meta?: { storageKey?: string } } | undefined;
  const imageUrl =
    image?.src ||
    (image?.meta?.storageKey
      ? `/_emdash/api/media/file/${encodeURIComponent(image.meta.storageKey)}`
      : undefined);
  const url = safeSiteLink(
    collection === "friends" ? data.url : data.project_url,
  );
  if (collection === "friends" && !url) return undefined;
  const terms = data.terms as
    Record<string, { slug: string; label: string }[]> | undefined;
  return {
    id: data.id,
    slug: String(data.slug || entry.id),
    collection,
    locale: String(data.locale || locale),
    title: String(data.title || ""),
    excerpt: String(data.excerpt || data.description || ""),
    date,
    content: (data.content || []) as PortableTextBlock[],
    seo: data.seo as ContentSeo | undefined,
    image: webpUrl(safeSiteLink(imageUrl)),
    featured: data.featured === true || data.featured === 1,
    projectType: String(data.project_type || "other"),
    url,
    icon: String(data.icon || "link"),
    color: ["purple", "green", "blue", "pink"].includes(String(data.color))
      ? String(data.color)
      : "purple",
    label: String(data.label || ""),
    order: Number.isFinite(Number(data.order)) ? Number(data.order) : 0,
    tags: terms?.life_tag || [],
  };
}

export async function loadFeatureEntries(
  query: FeatureQuery,
  collection: FeatureCollection,
  locale: string,
): Promise<FeatureEntry[]> {
  const entries: FeatureEntry[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await query(collection, {
      locale,
      status: "published",
      limit: 100,
      cursor,
    });
    if (result.error) throw result.error;
    for (const entry of result.entries) {
      const data = entry.data as Record<string, unknown>;
      if (
        data.status !== "published" ||
        (data.locale && data.locale !== locale)
      )
        continue;
      const item = normalizeFeature(entry, collection, locale);
      if (item) entries.push(item);
    }
    cursor = result.nextCursor;
    if (cursor && seen.has(cursor))
      throw new Error("Feature pagination did not advance");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return entries.sort(
    collection === "friends"
      ? (a, b) => a.order - b.order || a.title.localeCompare(b.title)
      : (a, b) => (b.date?.valueOf() || 0) - (a.date?.valueOf() || 0),
  );
}

export function archiveEntries<T extends { date?: Date }>(
  entries: T[],
  year?: string,
  month?: string,
): { year: string; month: string; items: T[] }[] {
  if (
    (year && !/^\d{4}$/.test(year)) ||
    (month &&
      (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12))
  )
    return [];
  const groups = new Map<string, { year: string; month: string; items: T[] }>();
  for (const entry of [...entries].sort(
    (a, b) => (b.date?.valueOf() || 0) - (a.date?.valueOf() || 0),
  )) {
    if (!entry.date || Number.isNaN(entry.date.valueOf())) continue;
    const y = String(entry.date.getUTCFullYear()).padStart(4, "0");
    const m = String(entry.date.getUTCMonth() + 1).padStart(2, "0");
    if ((year && y !== year) || (month && m !== month.padStart(2, "0")))
      continue;
    const key = `${y}-${m}`;
    if (!groups.has(key)) groups.set(key, { year: y, month: m, items: [] });
    groups.get(key)!.items.push(entry);
  }
  return [...groups.values()];
}

export const featureHref = (entry: Pick<FeatureEntry, "collection" | "slug">) =>
  `/${entry.collection}/${encodeURIComponent(entry.slug)}/`;
