import { test, expect } from "@playwright/test";
test("server notes stay pending, approvals and edits render immediately after board rename; private data stays private", async ({
  page,
  request,
}) => {
  const token = (
    await (await request.get("/_emdash/api/setup/dev-bypass?token=1")).json()
  ).data.token;
  const headers = { Authorization: `Bearer ${token}`, "X-EmDash-Request": "1" };
  const firstPage = (
    await (
      await request.get(
        "/_emdash/api/admin/comments?collection=posts&status=pending&limit=100",
        { headers },
      )
    ).json()
  ).data;
  expect(firstPage.items).toHaveLength(100);
  expect(firstPage.nextCursor).toBeTruthy();
  const secondPage = (
    await (
      await request.get(
        `/_emdash/api/admin/comments?collection=posts&status=pending&limit=100&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
        { headers },
      )
    ).json()
  ).data;
  expect(secondPage.items.length).toBeGreaterThanOrEqual(6);
  const rows = (
    await (
      await request.get("/_emdash/api/content/wall?limit=100", { headers })
    ).json()
  ).data.items;
  const board = rows.find((r: { locale: string }) => r.locale === "zh-CN");
  const other = rows.find((r: { locale: string }) => r.locale === "en");
  expect(
    (await request.get(`/_emdash/api/comments/wall/${other.id}`)).status(),
  ).toBe(404);
  await page.goto("/messages/");
  await page.getByLabel("怎么称呼你").fill("服务器访客");
  await page.getByLabel("邮箱（不公开）").fill("guest@example.test");
  await page
    .getByRole("textbox", { name: "想说的话" })
    .fill('<img src=x onerror="alert(1)"> 需要审核');
  await page.getByRole("radio", { name: "晴空蓝" }).check();
  await page.getByRole("button", { name: "贴到留言墙" }).click();
  await expect(page.getByRole("status")).toContainText("审核后公开");
  await expect(page.locator(".message")).toHaveCount(0);
  const pending = (
    await (
      await request.get(
        "/_emdash/api/admin/comments?collection=wall&status=pending",
        { headers },
      )
    ).json()
  ).data.items.find(
    (r: { authorName: string }) => r.authorName === "服务器访客",
  );
  expect(pending).toBeTruthy();
  expect(await (await request.get("/messages/")).text()).not.toContain(
    "需要审核",
  );
  const listed = await (
    await request.get(`/_emdash/api/comments/wall/${board.id}`)
  ).json();
  expect(JSON.stringify(listed)).not.toContain("guest@example.test");
  expect(
    (
      await request.put(`/_emdash/api/admin/comments/${pending.id}/status`, {
        headers,
        data: { status: "approved" },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.locator(".message .message-main > p")).toContainText(
    "需要审核",
  );
  await expect(page.locator(".message")).toHaveAttribute("data-color", "sky");
  await expect(page.locator(".message img")).toHaveCount(0);
  expect(
    (
      await request.put(`/_emdash/api/content/wall/${board.id}`, {
        headers,
        data: { slug: "renamed-wall", data: { title: "改名留言容器" } },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`/_emdash/api/content/wall/${board.id}/publish`, {
        headers,
        data: {},
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.locator(".message .message-main > p")).toContainText(
    "需要审核",
  );
  expect(
    (
      await request.patch(`/_emdash/api/admin/comments/${pending.id}`, {
        headers,
        data: { body: "站主已编辑" },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.locator(".message .message-main > p")).toHaveText(
    "站主已编辑",
  );
  const forbidden = await request.post("/_emdash/api/admin/comments/bulk", {
    data: { ids: [pending.id], action: "approve" },
  });
  expect(forbidden.status()).toBeGreaterThanOrEqual(401);
  const bulk = await request.post("/_emdash/api/admin/comments/bulk", {
    headers,
    data: { ids: [pending.id, "missing-id"], action: "trash" },
  });
  expect(bulk.ok()).toBe(true);
  expect((await bulk.json()).data).toMatchObject({ affected: 1 });
  await page.reload();
  await expect(page.locator(".message")).toHaveCount(0);
});
