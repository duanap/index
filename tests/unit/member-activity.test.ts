import { test } from "node:test";
import assert from "node:assert/strict";
import { membersFixture, memberRoute, loginMember } from "../helpers/members";
import { createPlugin } from "../../src/plugins/members/index";

test("activity counts require published local targets and concurrent adds are idempotent", async () => {
  const plugin = createPlugin();
  const f = await membersFixture(plugin);
  try {
    const cookie = await loginMember(plugin, f.ctx);
    const post = await f.db
      .selectFrom("ec_posts")
      .selectAll()
      .where("locale", "=", "zh-CN")
      .executeTakeFirstOrThrow();
    const change = (action: string, kind = "like", targetId = post.id) =>
      memberRoute(
        plugin,
        { ...f.ctx },
        "activity/toggle",
        "https://duanap.cn/activity/toggle",
        { kind, action, targetType: "posts", targetId },
        cookie,
      ) as Promise<{ ok: boolean; count: number; reason: string }>;
    const added = await Promise.all([change("add"), change("add")]);
    assert.equal(
      added.every((r) => r.ok),
      true,
    );
    assert.equal(
      await f.ctx.storage.activity.count({ kind: "like", targetId: post.id }),
      1,
    );
    await change("add", "favorite");
    await change("remove");
    const state = (await memberRoute(
      plugin,
      f.ctx,
      "activity/state",
      `https://duanap.cn/activity/state?targetType=posts&targetId=${post.id}`,
      undefined,
      cookie,
    )) as { likeCount: number; favoriteCount: number };
    assert.equal(state.likeCount, 0);
    assert.equal(state.favoriteCount, 1);
    const other = await f.db
      .selectFrom("ec_posts")
      .selectAll()
      .where("locale", "=", "en")
      .executeTakeFirstOrThrow();
    assert.equal((await change("add", "like", other.id)).reason, "not_found");
    await f.db
      .updateTable("ec_posts")
      .set({ status: "draft" })
      .where("id", "=", post.id)
      .execute();
    const hidden = (await memberRoute(
      plugin,
      f.ctx,
      "activity/state",
      `https://duanap.cn/activity/state?targetType=posts&targetId=${post.id}`,
    )) as { reason: string };
    assert.equal(hidden.reason, "not_found");
  } finally {
    await f.cleanup();
  }
});

test("comment likes reject pending comments and unpublished or other-language parents", async () => {
  const plugin = createPlugin();
  const f = await membersFixture(plugin);
  try {
    const cookie = await loginMember(plugin, f.ctx);
    const post = await f.db
      .selectFrom("ec_posts")
      .selectAll()
      .where("locale", "=", "zh-CN")
      .executeTakeFirstOrThrow();
    const c = await f.comments.create({
      collection: "posts",
      contentId: post.id,
      authorName: "A",
      authorEmail: "a@example.test",
      body: "待审核",
      status: "pending",
    });
    const result = (await memberRoute(
      plugin,
      f.ctx,
      "activity/toggle",
      "https://duanap.cn/activity/toggle",
      { kind: "like", action: "add", targetType: "comment", targetId: c.id },
      cookie,
    )) as { reason: string };
    assert.equal(result.reason, "not_found");
  } finally {
    await f.cleanup();
  }
});
