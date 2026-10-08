import { test, expect, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";

let headers: Record<string, string>;
test.beforeAll(async ({ request }) => {
  const response = await request.get("/_emdash/api/setup/dev-bypass?token=1");
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.data.token).toBeTruthy();
  headers = {
    Authorization: `Bearer ${result.data.token}`,
    "X-EmDash-Request": "1",
  };
});
async function mutation(
  request: APIRequestContext,
  method: "post" | "put" | "delete",
  url: string,
  data?: unknown,
) {
  const response = await request[method](url, { headers, data });
  expect(
    response.ok(),
    `${method} ${url}: ${response.status()} ${(await response.text()).slice(0, 300)}`,
  ).toBeTruthy();
  return response.json();
}

test("CMS saves drafts privately, publishes edits immediately and unpublishes all public surfaces", async ({
  request,
  page,
}) => {
  const slug = "cms-lifecycle";
  const created = await mutation(
    request,
    "post",
    "/_emdash/api/content/posts",
    {
      slug,
      locale: "zh-CN",
      data: {
        title: "CMS 测试文章",
        excerpt: "CMS 功能验证",
        date: "2026-10-08T00:00:00.000Z",
        cover: "notes",
        featured: false,
        content: [
          {
            _type: "block",
            _key: "body",
            style: "normal",
            children: [
              {
                _type: "span",
                _key: "text",
                text: "来自编辑器的正文",
                marks: [],
              },
            ],
            markDefs: [],
          },
        ],
      },
    },
  );
  const id = created.data.item.id;
  expect((await page.goto(`/posts/${slug}/`))?.status()).toBe(404);
  expect(await (await page.request.get("/rss.xml")).text()).not.toContain(
    "CMS 测试文章",
  );
  await mutation(
    request,
    "post",
    `/_emdash/api/content/posts/${id}/publish`,
    {},
  );
  await page.goto(`/posts/${slug}/`);
  await expect(page.locator(".article-header h1")).toHaveText("CMS 测试文章");
  await expect(page.locator("#article-body")).toContainText("来自编辑器的正文");
  expect(await (await page.request.get("/rss.xml")).text()).toContain(
    "CMS 测试文章",
  );
  expect(await (await page.request.get("/sitemap-0.xml")).text()).toContain(
    slug,
  );
  await mutation(request, "put", `/_emdash/api/content/posts/${id}`, {
    data: { title: "已发布的新标题" },
  });
  await page.reload();
  await expect(page.locator(".article-header h1")).toHaveText("CMS 测试文章");
  const preview = await mutation(
    request,
    "post",
    `/_emdash/api/content/posts/${id}/preview-url`,
    {},
  );
  const previewUrl = new URL(preview.data.url, "http://127.0.0.1:4174");
  await page.goto(previewUrl.pathname + previewUrl.search);
  await expect(page.locator(".article-header h1")).toHaveText("已发布的新标题");
  for (const path of ["/rss.xml", "/sitemap-0.xml"]) {
    const response = await page.request.get(path + previewUrl.search);
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain("已发布的新标题");
  }
  await page.goto(`/posts/${slug}/`);
  await mutation(
    request,
    "post",
    `/_emdash/api/content/posts/${id}/publish`,
    {},
  );
  await page.reload();
  await expect(page.locator(".article-header h1")).toHaveText("已发布的新标题");
  await mutation(
    request,
    "post",
    `/_emdash/api/content/posts/${id}/unpublish`,
    {},
  );
  expect((await page.goto(`/posts/${slug}/`))?.status()).toBe(404);
  expect(await (await page.request.get("/rss.xml")).text()).not.toContain(
    "已发布的新标题",
  );
  expect(await (await page.request.get("/sitemap-0.xml")).text()).not.toContain(
    slug,
  );
  await mutation(request, "delete", `/_emdash/api/content/posts/${id}`);
});

test("real image upload, replacement and deletion serve current WebP while retaining originals", async ({
  request,
  page,
}) => {
  const makeImage = async (color: string) =>
    sharp({ create: { width: 40, height: 20, channels: 4, background: color } })
      .png()
      .toBuffer();
  const original = await makeImage("#de3466");
  const registered = await mutation(
    request,
    "post",
    "/_emdash/api/media/upload-url",
    {
      filename: "upload-test.png",
      contentType: "image/png",
      size: original.length,
      deduplicate: false,
    },
  );
  const media = registered.data;
  const uploaded = await request.put(media.uploadUrl, {
    headers: { ...headers, "Content-Type": "image/png" },
    data: original,
  });
  expect(uploaded.ok()).toBeTruthy();
  const confirmed = await mutation(
    request,
    "post",
    `/_emdash/api/media/${media.mediaId}/confirm`,
    { width: 40, height: 20 },
  );
  let url = confirmed.data.item.url;
  expect(await (await page.request.get(url)).body()).toEqual(original);
  const variant = await page.request.get(`${url}?format=webp`);
  expect(variant.headers()["content-type"]).toBe("image/webp");
  expect((await sharp(await variant.body()).metadata()).format).toBe("webp");
  const first = await variant.body();
  const body = await makeImage("#325cba");
  const replacement = await request.put(
    `/_emdash/api/media/${media.mediaId}/replace`,
    {
      headers,
      multipart: {
        file: { name: "replacement.png", mimeType: "image/png", buffer: body },
        width: "40",
        height: "20",
      },
    },
  );
  expect(
    replacement.ok(),
    (await replacement.text()).slice(0, 300),
  ).toBeTruthy();
  const replaced = await replacement.json();
  url = replaced.data.item.url;
  const updated = await page.request.get(`${url}?format=webp`);
  expect(updated.status()).toBe(200);
  expect(updated.headers()["content-type"]).toBe("image/webp");
  expect(await updated.body()).not.toEqual(first);
  expect(await (await page.request.get(url)).body()).toEqual(body);
  const post = await mutation(request, "post", "/_emdash/api/content/posts", {
    slug: "image-post",
    locale: "zh-CN",
    data: {
      title: "图片文章",
      excerpt: "图片验证",
      date: "2026-10-08T00:00:00.000Z",
      content: [
        {
          _type: "image",
          _key: "picture",
          asset: { _type: "reference", _ref: media.mediaId },
          alt: "测试图片",
        },
      ],
    },
  });
  await mutation(
    request,
    "post",
    `/_emdash/api/content/posts/${post.data.item.id}/publish`,
    {},
  );
  await page.goto("/posts/image-post/");
  await expect(page.locator("#article-body img")).toHaveAttribute(
    "src",
    /format=webp/,
  );
  await mutation(
    request,
    "delete",
    `/_emdash/api/content/posts/${post.data.item.id}`,
  );
  await mutation(request, "delete", `/_emdash/api/media/${media.mediaId}`);
  expect((await page.request.get(`${url}?format=webp`)).status()).toBe(404);
});

test("admin mounts, anonymous content API is denied and missing CMS pages return 404", async ({
  page,
}) => {
  expect((await page.request.get("/_emdash/api/content/posts")).status()).toBe(
    401,
  );
  expect(
    (
      await page.request.get(
        "/_emdash/api/media/file/backups/private.png?format=webp",
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get("/_emdash/api/media/file/missing.png?format=webp")
    ).status(),
  ).toBe(404);
  await page.goto("/_emdash/admin/");
  await expect(page.locator("body")).toContainText(/sign in|log in|登录/i, {
    timeout: 30_000,
  });
  expect((await page.goto("/pages/no-such-page/"))?.status()).toBe(404);
  await page.goto("/pages/about/");
  await expect(page.locator(".prose")).not.toBeEmpty();
});

test("CMS SEO settings reach published article and page metadata", async ({
  request,
  page,
}) => {
  const post = await mutation(request, "post", "/_emdash/api/content/posts", {
    slug: "seo-check",
    locale: "zh-CN",
    data: {
      title: "正文标题",
      excerpt: "正文摘要",
      date: "2026-10-08T00:00:00.000Z",
      content: [],
    },
  });
  const id = post.data.item.id;
  await mutation(
    request,
    "post",
    `/_emdash/api/content/posts/${id}/publish`,
    {},
  );
  await mutation(request, "put", `/_emdash/api/content/posts/${id}`, {
    seo: {
      title: "SEO 标题",
      description: "SEO 摘要",
      canonical: "https://duanap.cn/custom/",
      image: "https://duanap.cn/favicon.svg",
      noIndex: true,
    },
  });
  await page.goto("/posts/seo-check/");
  await expect(page).toHaveTitle("SEO 标题 · Kanade");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "SEO 摘要",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://duanap.cn/custom/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://duanap.cn/favicon.svg",
  );
  const cmsPage = await mutation(
    request,
    "post",
    "/_emdash/api/content/pages",
    {
      slug: "seo-page",
      locale: "zh-CN",
      data: { title: "页面标题", content: [] },
      seo: { title: "页面 SEO", description: "页面 SEO 摘要", noIndex: true },
    },
  );
  await mutation(
    request,
    "post",
    `/_emdash/api/content/pages/${cmsPage.data.item.id}/publish`,
    {},
  );
  await page.goto("/pages/seo-page/");
  await expect(page).toHaveTitle("页面 SEO · Kanade");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "页面 SEO 摘要",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await mutation(
    request,
    "delete",
    `/_emdash/api/content/pages/${cmsPage.data.item.id}`,
  );
  await mutation(request, "delete", `/_emdash/api/content/posts/${id}`);
});

test("other-language page IDs cannot bypass the configured language", async ({
  request,
  page,
}) => {
  const english = await mutation(
    request,
    "post",
    "/_emdash/api/content/pages",
    {
      slug: "english-only",
      locale: "en",
      data: { title: "English only", content: [] },
    },
  );
  await mutation(
    request,
    "post",
    `/_emdash/api/content/pages/${english.data.item.id}/publish`,
    {},
  );
  expect((await page.goto(`/pages/${english.data.item.id}/`))?.status()).toBe(
    404,
  );

  await mutation(
    request,
    "delete",
    `/_emdash/api/content/pages/${english.data.item.id}`,
  );
});
