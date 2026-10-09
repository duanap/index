import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";
import { markdownToBlocks } from "./markdown";
import { buildFeatureSeed } from "./features.mjs";

const languages = ["zh-CN", "en", "ja"] as const;
const legacyCategories: Record<string, string> = {
  前端开发: "frontend",
  开发笔记: "notes",
  生活随笔: "life",
};
const categoryLabels = {
  "zh-CN": ["前端开发", "开发笔记", "生活随笔"],
  en: ["Frontend", "Development notes", "Life"],
  ja: ["フロントエンド", "開発ノート", "日常"],
};
const field = (slug: string, label: string, type: string, extra = {}) => ({
  slug,
  label,
  type,
  ...extra,
});

export async function buildSeed(cwd: string) {
  const posts: Record<string, unknown>[] = [];
  const terms: {
    id: string;
    slug: string;
    label: string;
    locale: string;
    translationOf?: string;
  }[] = [];
  const pages: Record<string, unknown>[] = [];
  for (const locale of languages) {
    const folder = resolve(
      cwd,
      "src/content/posts",
      locale === "zh-CN" ? "" : locale,
    );
    const files = (await readdir(folder))
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .sort();
    for (const filename of files) {
      const { data, content } = matter(
        await readFile(resolve(folder, filename), "utf8"),
      );
      const slug = basename(filename, ".md");
      const tags = (data.tags || []) as string[];
      // Terms share translation groups just like their linked articles.
      // Kanade's sample translations preserve tag order across locales.
      const canonicalTags =
        locale === "zh-CN"
          ? tags
          : (matter(
              await readFile(
                resolve(cwd, "src/content/posts", filename),
                "utf8",
              ),
            ).data.tags as string[]);
      if (canonicalTags.length !== tags.length)
        throw new Error(`Unmatched translated tags: ${locale}/${slug}`);
      const tagSlugs = canonicalTags.map(
        (label) => `tag-${Buffer.from(label).toString("hex")}`,
      );
      tags.forEach((label, i) => {
        if (!terms.some((t) => t.slug === tagSlugs[i] && t.locale === locale))
          terms.push({
            id: `${locale}-${tagSlugs[i]}`,
            slug: tagSlugs[i]!,
            label,
            locale,
            ...(locale !== "zh-CN"
              ? { translationOf: `zh-CN-${tagSlugs[i]}` }
              : {}),
          });
      });
      posts.push({
        id: `${locale}-${slug}`,
        slug,
        locale,
        ...(locale !== "zh-CN" ? { translationOf: `zh-CN-${slug}` } : {}),
        status: data.draft ? "draft" : "published",
        data: {
          title: data.title,
          excerpt: data.description,
          date: new Date(data.date).toISOString(),
          content: markdownToBlocks(content),
          cover: data.cover || "notes",
          featured: data.featured ?? false,
        },
        taxonomies: {
          category: [legacyCategories[data.category] || data.category],
          tag: tagSlugs,
        },
      });
    }
    const dictionary = JSON.parse(
      await readFile(resolve(cwd, `src/i18n/${locale}.json`), "utf8"),
    ) as Record<string, string>;
    const about = ["me", "interests", "site", "content"]
      .map(
        (section) =>
          `## ${dictionary[`about.${section}`]}\n\n${section === "me" ? [dictionary["about.intro"], dictionary["about.blog"], `> ${dictionary["about.quote"]}`].join("\n\n") : section === "interests" ? [dictionary["about.codeDescription"], dictionary["about.lifeDescription"]].join("\n\n") : section === "site" ? [dictionary["about.siteIntro"], dictionary["about.siteTech"]].join("\n\n") : dictionary["about.contentDescription"]}`,
      )
      .join("\n\n");
    pages.push({
      id: `${locale}-about`,
      slug: "about",
      locale,
      ...(locale !== "zh-CN" ? { translationOf: "zh-CN-about" } : {}),
      status: "published",
      data: {
        title: dictionary["nav.about"],
        content: markdownToBlocks(about),
      },
    });
  }
  const support = [
    "drafts",
    "revisions",
    "preview",
    "scheduling",
    "search",
    "seo",
  ];
  const features = await buildFeatureSeed(cwd);
  return {
    version: "1",
    defaultLocale: "zh-CN",
    meta: {
      name: "Kanade + EmDash",
      description: "Kanade theme with database-managed content",
    },
    settings: { title: "Kanade", url: "https://duanap.cn" },
    collections: [
      {
        slug: "posts",
        label: "文章",
        labelSingular: "文章",
        urlPattern: "/posts/{slug}/",
        supports: support,
        commentsEnabled: true,
        fields: [
          field("title", "标题", "string", {
            required: true,
            searchable: true,
          }),
          field("excerpt", "摘要", "text", {
            required: true,
            searchable: true,
          }),
          field("content", "正文", "portableText", { searchable: true }),
          field("date", "文章日期", "datetime", { indexed: true }),
          field("cover", "装饰封面", "select", {
            default: "notes",
            validation: {
              options: [
                "astro",
                "vue",
                "css",
                "notes",
                "life",
                "typescript",
                "git",
                "design",
              ],
            },
          }),
          field("featured", "置顶标记", "boolean", { default: false }),
          field("featured_image", "封面图片", "image"),
        ],
      },
      {
        slug: "pages",
        label: "页面",
        labelSingular: "页面",
        urlPattern: "/pages/{slug}/",
        supports: support,
        fields: [
          field("title", "标题", "string", { required: true }),
          field("content", "正文", "portableText"),
        ],
      },
      ...features.collections,
    ],
    taxonomies: [
      {
        name: "category",
        label: "分类",
        labelSingular: "分类",
        hierarchical: true,
        collections: ["posts"],
        terms: languages.flatMap((locale) =>
          ["frontend", "notes", "life"].map((slug, i) => ({
            id: `${locale}-category-${slug}`,
            ...(locale !== "zh-CN"
              ? { translationOf: `zh-CN-category-${slug}` }
              : {}),
            slug,
            label: categoryLabels[locale][i],
            locale,
          })),
        ),
      },
      {
        name: "tag",
        label: "标签",
        labelSingular: "标签",
        hierarchical: false,
        collections: ["posts"],
        terms,
      },
      ...features.taxonomies,
    ],
    content: { posts, pages, ...features.content },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const seed = await buildSeed(process.cwd());
  await mkdir("seed", { recursive: true });
  await writeFile("seed/seed.json", `${JSON.stringify(seed, null, 2)}\n`);
  console.log(
    `Generated seed: ${seed.content.posts.length} posts, ${seed.content.pages.length} pages.`,
  );
}
