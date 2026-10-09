import { test } from "node:test";
import assert from "node:assert/strict";
import { membersFixture, memberRoute, loginMember } from "../helpers/members";
import { createPlugin } from "../../src/plugins/members/index";

test("private member comments have independent cursors beyond 100 records", async () => {
  const plugin = createPlugin();
  const f = await membersFixture(plugin);
  try {
    const cookie = await loginMember(plugin, f.ctx);
    const status = (await memberRoute(
      plugin,
      f.ctx,
      "auth/status",
      "https://duanap.cn/auth/status",
      undefined,
      cookie,
    )) as { data: { commentIdentity: { email: string } } };
    const post = (await f.db
      .selectFrom("ec_posts")
      .selectAll()
      .where("locale", "=", "zh-CN")
      .executeTakeFirst()) as { id: string; slug: string };
    for (let i = 0; i < 105; i++) {
      const comment = await f.comments.create({
        collection: "posts",
        contentId: post.id,
        body: `评论-${i}`,
        authorName: "会员测试",
        authorEmail: status.data.commentIdentity.email,
        status: "pending",
      });
      await f.ctx.storage.memberComments.put(comment.id, {
        memberRef: status.data.commentIdentity.email,
        collection: "posts",
        contentId: post.id,
        targetTitle: "标题",
        targetSlug: post.slug,
        createdAt: comment.createdAt,
      });
    }
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const result = (await memberRoute(
        plugin,
        f.ctx,
        "member/overview",
        `https://duanap.cn/member/overview${cursor ? `?commentsCursor=${encodeURIComponent(cursor)}` : ""}`,
        undefined,
        cookie,
      )) as { comments: { id: string }[]; commentsCursor?: string };
      for (const c of result.comments)
        (assert.equal(seen.has(c.id), false), seen.add(c.id));
      cursor = result.commentsCursor;
    } while (cursor);
    assert.equal(seen.size, 105);
  } finally {
    await f.cleanup();
  }
});
