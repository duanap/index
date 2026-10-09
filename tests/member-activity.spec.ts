import { test, expect } from "@playwright/test";
test("members like and save a published target independently, repeated adds stay at one", async ({
  page,
  context,
  request,
}) => {
  await context.addCookies([
    {
      name: "dm_session",
      value: "fixture-session",
      url: "http://127.0.0.1:4174",
      httpOnly: true,
    },
  ]);
  await page.goto("/posts/fixture-post-104/");
  await page.locator(".activity").first().scrollIntoViewIfNeeded();
  const like = page.getByRole("button", { name: /点赞/ }).first();
  await like.scrollIntoViewIfNeeded();
  await expect(like).toContainText("0");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  const favorite = page.getByRole("button", { name: /收藏/ }).first();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await expect(like).toContainText("1");
  const headers = {
    Origin: "http://127.0.0.1:4174",
    Cookie: "dm_session=fixture-session",
  };
  const data = {
    kind: "like",
    action: "add",
    targetType: "posts",
    targetId: "fixture-post-104",
  };
  const responses = await Promise.all([
    request.post("/_emdash/api/plugins/duanap-members/activity/toggle", {
      headers,
      data,
    }),
    request.post("/_emdash/api/plugins/duanap-members/activity/toggle", {
      headers,
      data,
    }),
  ]);
  for (const r of responses) expect((await r.json()).data.count).toBe(1);
  const form = page.locator("[data-ec-comment-form]");
  await expect(form.locator('input[name="authorName"]')).toHaveValue(
    "会员测试",
  );
  await form.locator('textarea[name="body"]').fill("会员会话绑定的本人评论");
  await form.getByRole("button", { name: "提交评论" }).click();
  await expect(form.locator(".ec-comment-form-status")).toContainText(
    "审核后公开",
  );
  const overview = (
    await (
      await request.get("/_emdash/api/plugins/duanap-members/member/overview", {
        headers,
      })
    ).json()
  ).data;
  expect(
    overview.comments.some(
      (comment: { body: string }) => comment.body === "会员会话绑定的本人评论",
    ),
  ).toBe(true);
});
