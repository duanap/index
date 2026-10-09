import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getPosts, getPostId } from "../lib/posts";
import { categoryLabel } from "../data/post-options";
import { siteInfo } from "../config";
import { getFeatureEntries } from "../lib/features";
import { featureHref } from "../lib/feature-content";
import { getIndexExclusions } from "../lib/index-policy";

export const GET: APIRoute = async ({ site, locals }) => {
  const excluded = await getIndexExclusions(locals);
  return rss({
    title: siteInfo.title,
    description: siteInfo.description,
    site: site!,
    items: [
      ...(await getPosts(locals))
        .filter(
          (post) =>
            !post.data.seo?.noIndex &&
            !excluded.has(`posts:${post.databaseId}`),
        )
        .map((post) => ({
          title: post.data.title,
          description: post.data.description,
          pubDate: post.data.date,
          link: `/posts/${getPostId(post)}/`,
          categories: [categoryLabel(post.data.category)],
        })),
      ...[
        ...(await getFeatureEntries("life", locals)),
        ...(await getFeatureEntries("projects", locals)),
      ]
        .filter(
          (entry) =>
            !entry.seo?.noIndex &&
            !excluded.has(`${entry.collection}:${entry.id}`),
        )
        .map((entry) => ({
          title: entry.title,
          description: entry.excerpt,
          pubDate: entry.date!,
          link: featureHref(entry),
        })),
    ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()),
    customData: `<language>${siteInfo.language}</language>`,
  });
};
