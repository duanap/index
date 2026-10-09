import { test } from "node:test";
import assert from "node:assert/strict";
import { membersFixture, loginMember } from "../helpers/members";
import { createPlugin } from "../../src/plugins/members/index";

test("comment ownership is attested by a session, not a forged derived identity email", async () => {
  const plugin = createPlugin();
  const f = await membersFixture(plugin);
  try {
    const before = plugin.hooks?.["comment:beforeCreate"]?.handler;
    assert.equal(typeof before, "function");
    const comment = {
      collection: "posts",
      contentId: "post",
      parentId: null,
      authorName: "伪造",
      authorEmail: "member-aaaaaaaaaaaaaaaa@members.duanap.cn",
      authorUserId: null,
      body: "伪造本人评论",
      ipHash: null,
      userAgent: null,
    };
    assert.equal(await before!({ comment, metadata: {} }, f.ctx), false);
    await plugin.hooks!["plugin:activate"]!.handler({} as never, f.ctx);
    const { prepareKanadeComment } =
      await import("../../src/plugins/members/index");
    const cookie = await loginMember(plugin, f.ctx);
    const request = new Request("https://duanap.cn/comments", {
      headers: { cookie },
    });
    const input = await prepareKanadeComment(request, "posts", "post", {
      authorName: "伪造",
      authorEmail: "a@example.test",
      body: " 本人评论 ",
      color: "sky",
    });
    const event = await before!(
      { comment: { ...comment, ...input, body: " 本人评论 " }, metadata: {} },
      f.ctx,
    );
    assert.ok(event);
    assert.match(event.comment.authorEmail, /^member-/);
    assert.equal(event.comment.authorName, "测试会员");
    assert.equal(event.metadata.kanadeColor, "sky");
    assert.equal(
      await before!(
        { comment: { ...comment, ...input, body: " 本人评论 " }, metadata: {} },
        f.ctx,
      ),
      false,
    );
  } finally {
    await f.cleanup();
  }
});
