// Invoked only by the isolated browser-test server, never by application setup.
import { Kysely } from "kysely";
import { createDialect } from "emdash/db/sqlite";
import { PluginStorageRepository, CommentRepository } from "emdash";
import { join } from "node:path";
import { createHash } from "node:crypto";

export async function seedMembers(root) {
  const db = new Kysely({
    dialect: createDialect({ url: `file:${join(root, "emdash.db")}` }),
  });
  try {
    const storage = (name) =>
      new PluginStorageRepository(
        db,
        "duanap-members",
        name,
        name === "activity"
          ? ["memberOpenid", "kind", "createdAt", "targetType", "targetId"]
          : name === "memberComments"
            ? ["memberRef", "createdAt"]
            : ["qqOpenid", "memberId", "status"],
      );
    const now = new Date().toISOString();
    await storage("members").put("fixture-member", {
      displayName: "会员测试",
      avatarUrl: "",
      bio: "",
      status: "active",
      qqOpenid: "fixture-openid",
      createdAt: now,
      updatedAt: now,
    });
    await storage("sessions").put("fixture-session", {
      memberId: "fixture-openid",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const memberRef = `member-${createHash("sha256").update("fixture-openid").digest("hex").slice(0, 16)}@members.duanap.cn`;
    const comments = new CommentRepository(db);
    const post = await db
      .selectFrom("ec_posts")
      .selectAll()
      .where("locale", "=", "zh-CN")
      .executeTakeFirstOrThrow();
    for (let i = 0; i < 105; i++) {
      // Separate published targets make every saved favorite visible.
      const id = `fixture-post-${i}`;
      await db
        .insertInto("ec_posts")
        .values({
          ...post,
          id,
          slug: `fixture-post-${i}`,
          title: `收藏测试 ${i}`,
          translation_group: id,
        })
        .execute();
      await storage("activity").put(`favorite:fixture-openid:posts:${id}`, {
        kind: "favorite",
        memberOpenid: "fixture-openid",
        targetType: "posts",
        targetId: id,
        createdAt: now,
      });
      const comment = await comments.create({
        collection: "posts",
        contentId: post.id,
        authorName: "会员测试",
        authorEmail: memberRef,
        body: `私有分页评论 ${i}`,
        status: "pending",
      });
      await storage("memberComments").put(comment.id, {
        memberRef,
        collection: "posts",
        contentId: post.id,
        targetTitle: post.title,
        targetSlug: post.slug,
        createdAt: now,
      });
    }
    const other = await comments.create({
      collection: "posts",
      contentId: post.id,
      authorName: "另一会员",
      authorEmail: "other@example.test",
      body: "另一会员的私密评论",
      status: "pending",
    });
    await storage("memberComments").put(other.id, {
      memberRef: "other@example.test",
      collection: "posts",
      contentId: post.id,
      targetTitle: post.title,
      targetSlug: post.slug,
      createdAt: now,
    });
  } finally {
    await db.destroy();
  }
}
