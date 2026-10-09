import { test } from "node:test";
import assert from "node:assert/strict";
test("message board keeps the oldest local published ID when its slug changes", async () => {
  const { chooseMessageBoard } =
    await import("../../src/lib/message-board-content").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof chooseMessageBoard, "function");
  const rows = [
    {
      id: "stable",
      slug: "renamed",
      locale: "zh-CN",
      status: "published",
      created_at: "2020-01-01",
    },
    {
      id: "new",
      slug: "new",
      locale: "zh-CN",
      status: "published",
      created_at: "2022-01-01",
    },
    {
      id: "other",
      locale: "en",
      status: "published",
      created_at: "2000-01-01",
    },
    { id: "draft", locale: "zh-CN", status: "draft", created_at: "1999-01-01" },
  ];
  assert.deepEqual((chooseMessageBoard as Function)(rows, "zh-CN"), {
    id: "stable",
    slug: "renamed",
  });
});
