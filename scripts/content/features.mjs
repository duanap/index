import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const supports = [
  "drafts",
  "revisions",
  "preview",
  "scheduling",
  "search",
  "seo",
];
const field = (slug, label, type, extra = {}) => ({
  slug,
  label,
  type,
  ...extra,
});
const articleFields = () => [
  field("title", "标题", "string", { required: true, searchable: true }),
  field("excerpt", "摘要", "text", { searchable: true }),
  field("content", "正文", "portableText", { searchable: true }),
  field("date", "日期", "datetime", { indexed: true }),
  field("featured_image", "封面图片", "image"),
];

export async function buildFeatureSeed(root = process.cwd()) {
  const config = JSON.parse(
    await readFile(resolve(root, "src/site.config.json"), "utf8"),
  );
  const wall = [];
  const friends = [];
  for (const locale of ["zh-CN", "en", "ja"]) {
    const dictionary = JSON.parse(
      await readFile(resolve(root, `src/i18n/${locale}.json`), "utf8"),
    );
    const translate = (key) => dictionary[key] || key;
    wall.push({
      id: `${locale}-kanade-wall`,
      slug: "messages",
      locale,
      ...(locale !== "zh-CN" ? { translationOf: "zh-CN-kanade-wall" } : {}),
      status: "published",
      data: { title: translate("guestbook.pageTitle"), content: [] },
    });
    for (const [key, title, url, icon, color, order] of [
      ["astro", "Astro", "https://astro.build/", "astro", "purple", 0],
      ["vue", "Vue.js", "https://vuejs.org/", "vue", "green", 1],
      [
        "tailwind",
        "Tailwind CSS",
        "https://tailwindcss.com/",
        "tailwind",
        "blue",
        2,
      ],
      [
        "github",
        `${config.author.name.en} / GitHub`,
        config.author.github,
        "github",
        "pink",
        3,
      ],
    ])
      friends.push({
        id: `${locale}-kanade-friend-${key}`,
        slug: key,
        locale,
        ...(locale !== "zh-CN"
          ? { translationOf: `zh-CN-kanade-friend-${key}` }
          : {}),
        status: "published",
        data: {
          title,
          url,
          icon,
          color,
          order,
          description: translate(`friend.${key}Description`),
          label: translate(`friend.${key}Label`),
        },
      });
  }
  return {
    version: "1",
    defaultLocale: "zh-CN",
    collections: [
      {
        slug: "life",
        label: "生活记录",
        labelSingular: "生活记录",
        urlPattern: "/life/{slug}/",
        supports,
        commentsEnabled: true,
        dateField: "date",
        fields: articleFields(),
      },
      {
        slug: "projects",
        label: "作品",
        labelSingular: "作品",
        urlPattern: "/projects/{slug}/",
        supports,
        commentsEnabled: true,
        dateField: "date",
        fields: [
          ...articleFields(),
          field("project_type", "作品类型", "select", {
            default: "web",
            validation: { options: ["web", "tool", "other"] },
          }),
          field("project_url", "作品链接", "url"),
          field("featured", "精选作品", "boolean", { default: false }),
        ],
      },
      {
        slug: "wall",
        label: "留言墙",
        labelSingular: "留言墙",
        urlPattern: "/wall/{slug}/",
        supports,
        commentsEnabled: true,
        fields: [
          field("title", "标题", "string", { required: true }),
          field("content", "说明", "portableText"),
        ],
      },
      {
        slug: "friends",
        label: "友链",
        labelSingular: "友链",
        routable: false,
        urlPattern: "/friends/",
        supports: ["drafts", "revisions", "preview"],
        fields: [
          field("title", "名称", "string", { required: true }),
          field("description", "介绍", "text"),
          field("url", "链接", "url", { required: true }),
          field("icon", "图标", "select", {
            default: "link",
            validation: {
              options: ["astro", "vue", "tailwind", "github", "link"],
            },
          }),
          field("color", "颜色", "select", {
            default: "purple",
            validation: { options: ["purple", "green", "blue", "pink"] },
          }),
          field("label", "标签", "string"),
          field("order", "排序", "integer", { default: 0, indexed: true }),
        ],
      },
    ],
    taxonomies: [
      {
        name: "life_tag",
        label: "生活标签",
        labelSingular: "生活标签",
        hierarchical: false,
        collections: ["life"],
        terms: [],
      },
    ],
    content: { wall, friends },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await writeFile(
    "seed/features.json",
    JSON.stringify(await buildFeatureSeed(), null, 2) + "\n",
  );
