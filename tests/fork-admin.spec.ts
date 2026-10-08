import { test, expect } from "@playwright/test";

test("custom admin settings store their fields without losing unrelated settings", async ({
  request,
  page,
}) => {
  const response = await request.get("/_emdash/api/setup/dev-bypass?token=1");
  const token = (await response.json()).data.token;
  const headers = { Authorization: `Bearer ${token}`, "X-EmDash-Request": "1" };
  const carousel = {
    heroSlides: [
      {
        title: "管理轮播",
        imageUrl: "/_emdash/api/media/file/example.png",
        url: "/posts/",
      },
    ],
    heroCarousel: { intervalSeconds: 7, height: 360 },
  };
  expect(
    (
      await request.post("/_emdash/api/settings", { headers, data: carousel })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post("/_emdash/api/settings", {
        headers,
        data: {
          title: "设置保持测试",
          footerLinks: [
            { label: "备案测试", url: "https://beian.miit.gov.cn/" },
          ],
        },
      })
    ).ok(),
  ).toBeTruthy();
  const settings = (
    await (await request.get("/_emdash/api/settings", { headers })).json()
  ).data;
  expect(settings.heroSlides[0].title).toBe("管理轮播");
  expect(settings.heroCarousel.intervalSeconds).toBe(7);
  expect(settings.footerLinks[0].label).toBe("备案测试");
  await page.goto(
    "/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin/settings/carousel",
  );
  await page
    .getByRole("button", { name: /Get Started|开始使用/ })
    .click({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: /carousel|轮播/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto("/_emdash/admin/settings/footer");
  await expect(
    page.getByRole("heading", { name: /footer|页脚/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
});
