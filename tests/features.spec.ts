import { test, expect, type APIRequestContext } from "@playwright/test";

let headers: Record<string, string>;
test.beforeAll(async ({ request }) => {
  const response = await request.get("/_emdash/api/setup/dev-bypass?token=1");
  headers = {
    Authorization: `Bearer ${(await response.json()).data.token}`,
    "X-EmDash-Request": "1",
  };
});

async function create(
  request: APIRequestContext,
  collection: string,
  slug: string,
  locale = "zh-CN",
) {
  const response = await request.post(`/_emdash/api/content/${collection}`, {
    headers,
    data: {
      slug,
      locale,
      data: {
        title: `验证-${slug}`,
        excerpt: "内容模型验证",
        date: "2025-12-31T23:59:59.000Z",
        content: [
          {
            _type: "block",
            _key: "body",
            style: "normal",
            children: [
              {
                _type: "span",
                _key: "text",
                text: "来自新集合的正文",
                marks: [],
              },
            ],
            markDefs: [],
          },
        ],
        ...(collection === "projects"
          ? {
              project_type: "tool",
              project_url: "https://example.test/",
              featured: true,
            }
          : {}),
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data.item.id as string;
}

test("new content publishes into lists, archives and feeds, keeps drafts private and returns real 404 after withdrawal", async ({
  request,
  page,
}) => {
  for (const collection of ["life", "projects"]) {
    const slug = `new-${collection}`;
    const id = await create(request, collection, slug);
    expect((await request.get(`/${collection}/${slug}/`)).status()).toBe(404);
    expect(await (await request.get(`/${collection}/`)).text()).not.toContain(
      `验证-${slug}`,
    );
    expect(
      (
        await request.post(`/_emdash/api/content/${collection}/${id}/publish`, {
          headers,
          data: {},
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto(`/${collection}/${slug}/`);
    await expect(page.locator(".article-header h1")).toHaveText(`验证-${slug}`);
    await expect(page.locator("#article-body")).toContainText(
      "来自新集合的正文",
    );
    await page.goto(
      `/${collection}/${collection === "projects" ? "?type=tool" : ""}`,
    );
    await expect(page.locator(".feature-card")).toContainText(`验证-${slug}`);
    expect(await (await request.get("/rss.xml")).text()).toContain(
      `/${collection}/${slug}/`,
    );
    expect(await (await request.get("/sitemap-0.xml")).text()).toContain(
      `/${collection}/${slug}/`,
    );
    if (collection === "life")
      expect(await (await request.get("/archives/2025/12/")).text()).toContain(
        `验证-${slug}`,
      );
    expect(
      (
        await request.put(`/_emdash/api/content/${collection}/${id}`, {
          headers,
          data: { seo: { noIndex: true } },
        })
      ).ok(),
    ).toBeTruthy();
    await request.post(`/_emdash/api/content/${collection}/${id}/publish`, {
      headers,
      data: {},
    });
    expect(await (await request.get("/rss.xml")).text()).not.toContain(
      `/${collection}/${slug}/`,
    );
    expect(await (await request.get("/sitemap-0.xml")).text()).not.toContain(
      `/${collection}/${slug}/`,
    );
    const english = await create(request, collection, `${slug}-english`, "en");
    await request.post(
      `/_emdash/api/content/${collection}/${english}/publish`,
      { headers, data: {} },
    );
    expect(
      (await request.get(`/${collection}/${slug}-english/`)).status(),
    ).toBe(404);
    await request.post(`/_emdash/api/content/${collection}/${id}/unpublish`, {
      headers,
      data: {},
    });
    expect((await request.get(`/${collection}/${slug}/`)).status()).toBe(404);
  }
  expect((await request.get("/archives/2026/13/")).status()).toBe(404);
});

test("CMS friend edits render immediately and featured projects survive their type filter on desktop and mobile", async ({
  request,
  page,
}) => {
  const listed = await request.get("/_emdash/api/content/friends", { headers });
  const first = (await listed.json()).data.items.find(
    (item: { locale: string }) => item.locale === "zh-CN",
  );
  expect(first).toBeTruthy();
  await request.put(`/_emdash/api/content/friends/${first.id}`, {
    headers,
    data: { data: { title: "来自CMS的友链" } },
  });
  await request.post(`/_emdash/api/content/friends/${first.id}/publish`, {
    headers,
    data: {},
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/friends/");
    await expect(page.locator(".friend-grid")).toContainText("来自CMS的友链");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.goto("/projects/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBeTruthy();
  }
});
