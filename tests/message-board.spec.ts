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
  await expect(page.locator(".guestbook")).toHaveAttribute(
    "data-ready",
    "true",
  );
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
  const preview = await request.get("/wall/renamed-wall/", { maxRedirects: 0 });
  expect(preview.status()).toBe(302);
  expect(preview.headers().location).toBe("/messages/");
  expect((await request.get("/wall/missing-wall/")).status()).toBe(404);
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

test("approved wall notes page beyond 100 without exposing pending notes or another-language container", async ({
  page,
  request,
  browser,
}) => {
  const token = (
    await (await request.get("/_emdash/api/setup/dev-bypass?token=1")).json()
  ).data.token;
  const headers = { Authorization: `Bearer ${token}`, "X-EmDash-Request": "1" };
  const boards = (
    await (
      await request.get("/_emdash/api/content/wall?limit=100", { headers })
    ).json()
  ).data.items;
  const board = boards
    .filter(
      (entry: { locale: string; status: string }) =>
        entry.locale === "zh-CN" && entry.status === "published",
    )
    .sort(
      (
        a: { createdAt: string; id: string },
        b: { createdAt: string; id: string },
      ) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )[0];
  const other = boards.find(
    (entry: { locale: string }) => entry.locale === "en",
  );
  for (let index = 0; index < 105; index++) {
    const response = await request.post("/_emdash/api/admin/comments", {
      headers,
      data: {
        collection: "wall",
        contentId: board.id,
        authorName: "公开长列表",
        authorEmail: "private@example.test",
        body: `公开留言 ${index}`,
        status: "approved",
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await request.post("/_emdash/api/admin/comments", {
    headers,
    data: {
      collection: "wall",
      contentId: board.id,
      authorName: "待审核",
      authorEmail: "hidden@example.test",
      body: "不要公开的内容",
      status: "pending",
    },
  });
  await page.goto("/messages/");
  await expect(page.locator(".message")).toHaveCount(50);
  await page.getByRole("button", { name: "加载更早的留言" }).click();
  await expect(page.locator(".message")).toHaveCount(100);
  await page.getByRole("button", { name: "加载更早的留言" }).click();
  await expect(page.locator(".message")).toHaveCount(105);
  await expect(
    page.getByRole("button", { name: "加载更早的留言" }),
  ).toHaveCount(0);
  await expect(page.locator(".note-board")).toContainText("公开留言 0");
  await expect(page.locator(".note-board")).not.toContainText("不要公开的内容");
  const result = await request.get(`/api/messages?boardId=${board.id}`);
  expect(result.status()).toBe(200);
  const data = await result.json();
  expect(data.items).toHaveLength(50);
  expect(data.nextCursor).toBeTruthy();
  expect(JSON.stringify(data)).not.toContain("private@example.test");
  expect(
    (await request.get(`/api/messages?boardId=${other.id}`)).status(),
  ).toBe(409);
  expect(
    (await request.get("/api/messages?cursor=not-a-cursor")).status(),
  ).toBe(400);
  const plain = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: "http://127.0.0.1:4174",
  });
  try {
    const reader = await plain.newPage();
    await reader.goto("/messages/");
    await expect(reader.locator(".message")).toHaveCount(50);
    await reader.getByRole("link", { name: "加载更早的留言" }).click();
    await expect(reader).toHaveURL(/cursor=/);
    await expect(reader.locator(".message")).toHaveCount(50);
    await expect(reader.locator(".note-board")).not.toContainText(
      "不要公开的内容",
    );
  } finally {
    await plain.close();
  }
});
