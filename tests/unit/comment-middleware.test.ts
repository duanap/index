import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import ts from "typescript";
import { sql } from "kysely";
import {
  createPlugin,
  prepareKanadeComment,
  discardKanadeComment,
} from "../../src/plugins/members/index";
import { membersFixture, loginMember } from "../helpers/members";

async function loadMiddleware(db: unknown) {
  // Astro's virtual runtime is supplied by the host; SQL, hooks, requests and storage are real.
  const source = await readFile("src/middleware.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = {
    exports: {} as {
      onRequest: (
        context: any,
        next: () => Promise<Response>,
      ) => Promise<Response>;
    },
  };
  const modules: Record<string, unknown> = {
    "astro:middleware": { defineMiddleware: (handler: unknown) => handler },
    "emdash/runtime": { getDb: async () => db },
    kysely: { sql },
    "./i18n": { language: "zh-CN" },
    "./plugins/members": { prepareKanadeComment, discardKanadeComment },
    "./lib/media/derivatives": {},
    "./lib/sitemap": {},
    emdash: {},
  };
  new Script(code, { filename: "src/middleware.ts" }).runInNewContext({
    module,
    exports: module.exports,
    require: (name: string) => {
      if (!(name in modules)) throw Error(`Unexpected import ${name}`);
      return modules[name];
    },
    Request,
    Response,
    Headers,
    URL,
    console: { ...console, warn: () => {} },
  });
  return module.exports.onRequest;
}

for (const failure of ["prepare", "cleanup"] as const)
  test(`comment middleware ${failure} failure never resubmits the original request`, async () => {
    const plugin = createPlugin();
    const f = await membersFixture(plugin);
    try {
      const cookie = await loginMember(plugin, f.ctx);
      if (failure === "cleanup")
        f.ctx.kv.delete = async () => {
          throw Error("injected cleanup failure");
        };
      await plugin.hooks!["plugin:activate"]!.handler({} as never, f.ctx);
      const post = await f.db
        .selectFrom("ec_posts")
        .selectAll()
        .where("locale", "=", "zh-CN")
        .executeTakeFirstOrThrow();
      if (failure === "prepare")
        await sql`CREATE TRIGGER reject_ticket BEFORE INSERT ON options WHEN NEW.name LIKE 'plugin:duanap-members:comment:ticket:%' BEGIN SELECT RAISE(ABORT, 'injected ticket write failure'); END`.execute(
          f.db,
        );
      const onRequest = await loadMiddleware(f.db);
      const request = new Request(
        `https://duanap.cn/_emdash/api/comments/posts/${post.id}`,
        {
          method: "POST",
          headers: {
            cookie,
            "Content-Type": "application/json",
            "X-EmDash-Request": "1",
          },
          body: JSON.stringify({
            authorName: "未验证身份",
            authorEmail: "guest@example.test",
            body: "只提交一次",
          }),
        },
      );
      let nextCalls = 0;
      let rewriteCalls = 0;
      const context = {
        url: new URL(request.url),
        request,
        locals: {},
        rewrite: async (nextRequest: Request) => {
          rewriteCalls++;
          const input = await nextRequest.json();
          const event = await plugin.hooks!["comment:beforeCreate"]!.handler(
            {
              comment: {
                ...input,
                collection: "posts",
                contentId: post.id,
                parentId: null,
                authorUserId: null,
                ipHash: null,
                userAgent: null,
              },
              metadata: {},
            },
            f.ctx,
          );
          assert.ok(event);
          const comment = await f.comments.create({
            ...event.comment,
            status: "pending",
          });
          return Response.json(
            { success: true, data: { id: comment.id, status: "pending" } },
            { status: 201 },
          );
        },
      };
      const response = await onRequest(context, async () => {
        nextCalls++;
        await f.comments.create({
          collection: "posts",
          contentId: post.id,
          authorName: "未验证身份",
          authorEmail: "guest@example.test",
          body: "只提交一次",
          status: "pending",
        });
        return Response.json({ success: true });
      });
      assert.equal(nextCalls, 0);
      assert.equal(rewriteCalls, failure === "prepare" ? 0 : 1);
      assert.equal(response.status, failure === "prepare" ? 503 : 201);
      const comments = await f.comments.findForPlugin({
        status: "pending",
        contentId: post.id,
      });
      assert.equal(comments.items.length, failure === "prepare" ? 0 : 1);
      if (failure === "cleanup")
        assert.equal(comments.items[0].authorName, "测试会员");
    } finally {
      await f.cleanup();
    }
  });
