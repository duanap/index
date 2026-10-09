import { test, expect } from "@playwright/test";

test("saved carousel and footer render immediately, preserve other settings, support motion preference, keyboard and mobile heights", async ({
  page,
  request,
}) => {
  const token = (
    await (await request.get("/_emdash/api/setup/dev-bypass?token=1")).json()
  ).data.token;
  const headers = { Authorization: `Bearer ${token}`, "X-EmDash-Request": "1" };
  const slide = (title: string) => ({
    title,
    imageUrl: "http://127.0.0.1:4174/images/hero.webp",
    url: "/life/",
    excerpt: "轮播说明",
  });
  try {
    expect(
      (
        await request.post("/_emdash/api/settings", {
          headers,
          data: {
            heroSlides: [slide("第一张"), slide("第二张")],
            heroCarousel: {
              intervalSeconds: 2,
              height: 420,
              mobileHeight: 240,
              textPosition: "bottom-start",
            },
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await request.post("/_emdash/api/settings", {
          headers,
          data: {
            footerLinks: [
              { label: "备案验证", url: "https://beian.miit.gov.cn/" },
            ],
            title: "其他设置保留",
          },
        })
      ).ok(),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".hero-slide").first()).toBeVisible();
    await expect(page.locator(".hero-slide").first()).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await expect(page.getByRole("link", { name: "备案验证" })).toHaveAttribute(
      "href",
      "https://beian.miit.gov.cn/",
    );
    await expect(page.locator(".hero-carousel")).toHaveCSS("height", "420px");
    await page.waitForTimeout(2200);
    await expect(page.locator(".hero-slide").first()).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await page.locator(".hero-carousel").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".hero-slide").nth(1)).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await page.waitForTimeout(2200);
    await expect(page.locator(".hero-slide").nth(1)).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page
      .locator(".hero-carousel")
      .evaluate((element) => (element as HTMLElement).blur());
    await page.mouse.move(0, 0);
    await expect(page.locator(".hero-slide").first()).toHaveAttribute(
      "aria-hidden",
      "false",
      { timeout: 5000 },
    );
    await page.locator(".hero-carousel").hover();
    const pausedTitle = await page
      .locator('.hero-slide[aria-hidden="false"] h1')
      .innerText();
    await page.waitForTimeout(2200);
    await expect(
      page.locator('.hero-slide[aria-hidden="false"] h1'),
    ).toHaveText(pausedTitle);
    await page.mouse.move(0, 0);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hiddenTitle = await page
      .locator('.hero-slide[aria-hidden="false"] h1')
      .innerText();
    await page.waitForTimeout(2200);
    await expect(
      page.locator('.hero-slide[aria-hidden="false"] h1'),
    ).toHaveText(hiddenTitle);
    await page.evaluate(() => {
      delete (document as unknown as Record<string, unknown>).hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".hero-carousel")).toHaveCSS("height", "240px");
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      elements: [...document.querySelectorAll("*")]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          right: element.getBoundingClientRect().right,
        }))
        .slice(0, 10),
    }));
    expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(
      overflow.viewport,
    );
    expect(
      (
        await request.post("/_emdash/api/settings", {
          headers,
          data: { heroSlides: [slide("单图")] },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(page.locator(".hero-slide")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "下一张" })).toHaveCount(0);
    expect(
      (
        await request.post("/_emdash/api/settings", {
          headers,
          data: {
            heroSlides: [{ ...slide("危险"), url: "javascript:alert(1)" }],
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/_emdash/api/settings", {
          headers,
          data: {
            heroSlides: [
              {
                ...slide("缺失图片"),
                imageUrl: "/_emdash/api/media/file/unknown.png",
              },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(page.locator(".hero-slide img")).toHaveAttribute(
      "src",
      "/images/hero.webp",
    );
    const sitemap = await request.post("/_emdash/api/settings/sitemap", {
      headers,
    });
    expect(sitemap.ok(), await sitemap.text()).toBe(true);
    const data = (await sitemap.json()).data;
    const xml = await (await request.get("/sitemap-0.xml")).text();
    expect(data.urls).toBe((xml.match(/<url>/g) || []).length);
    expect(data.collections).toBe(1);
    expect(
      (await request.post("/_emdash/api/settings/sitemap")).status(),
    ).toBeGreaterThanOrEqual(401);
  } finally {
    await request.post("/_emdash/api/settings", {
      headers,
      data: { heroSlides: [], footerLinks: [] },
    });
  }
  await page.reload();
  await expect(page.locator(".hero-carousel")).toHaveCount(0);
  await expect(page.locator(".welcome-section")).toBeVisible();
});
