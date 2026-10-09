import { test, expect } from "@playwright/test";

test("login renders safely, raw login clears state cookie, POST requires same-site Origin", async ({
  page,
  request,
}) => {
  await page.goto("/login/?returnTo=https://evil.test/&error=provider_failed");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  await expect(
    page.getByRole("heading", { name: "会员登录", exact: true }).first(),
  ).toBeVisible();
  const start = await request.get(
    "/_emdash/api/plugins/duanap-members/auth/qq/start",
    { maxRedirects: 0 },
  );
  expect(start.status()).toBe(302);
  expect(start.headers()["set-cookie"]).toContain("dm_state=");
  expect(start.headers().location).toContain("not_configured");
  const csrf = await request.post(
    "/_emdash/api/plugins/duanap-members/auth/logout",
    { headers: { Origin: "https://evil.test" } },
  );
  expect(csrf.status()).toBe(403);
  const logout = await request.post(
    "/_emdash/api/plugins/duanap-members/auth/logout",
    { headers: { Origin: "http://127.0.0.1:4174" } },
  );
  expect(logout.status()).toBe(200);
  expect(logout.headers()["set-cookie"]).toContain("dm_session=");
});
