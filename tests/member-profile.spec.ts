import { test, expect } from "@playwright/test";

test("profile uses the private session, supports independent long-list cursors, persists edits and logout", async ({
  page,
  context,
  request,
}) => {
  const anonymous = await request.get(
    "/_emdash/api/plugins/duanap-members/member/overview?memberId=fixture-member",
  );
  expect((await anonymous.json()).data.reason).toBe("unauthorized");
  await context.addCookies([
    {
      name: "dm_session",
      value: "fixture-session",
      url: "http://127.0.0.1:4174",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/member/");
  await expect(page.getByLabel("昵称", { exact: true })).toHaveValue(
    "会员测试",
  );
  await page.getByLabel("昵称", { exact: true }).fill("<b>自己的昵称</b>");
  await page.getByLabel("简介", { exact: true }).fill("这段简介不会被 QQ 覆盖");
  await page.getByRole("button", { name: "保存资料" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(page.locator(".member-favorite")).toHaveCount(20);
  await page.getByRole("button", { name: "更多收藏" }).click();
  await expect(page.locator(".member-favorite")).toHaveCount(40);
  await expect(page.locator(".member-comment")).toHaveCount(20);
  await page.getByRole("button", { name: "更多评论" }).click();
  await expect(page.locator(".member-comment")).toHaveCount(40);
  await expect(page.locator(".member-panel")).not.toContainText(
    "另一会员的私密评论",
  );
  await page.reload();
  await expect(page.getByLabel("昵称", { exact: true })).toHaveValue(
    "<b>自己的昵称</b>",
  );
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login\//);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "dm_session"),
  ).toBe(false);
});
