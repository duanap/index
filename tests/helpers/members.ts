import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { Kysely } from "kysely";
import { createDialect } from "emdash/db/sqlite";
import {
  OptionsRepository,
  CommentRepository,
  PluginStorageRepository,
  createSettingsAccess,
  type RouteContext,
  type ResolvedPlugin,
} from "emdash";

export async function membersFixture(plugin: ResolvedPlugin) {
  const root = await mkdtemp(join(tmpdir(), "kanade-members-"));
  const database = join(root, "emdash.db");
  const seeded = spawnSync(
    process.execPath,
    [
      resolve("node_modules/emdash/dist/cli/index.mjs"),
      "seed",
      resolve("seed/seed.json"),
      "--database",
      database,
    ],
    { encoding: "utf8" },
  );
  if (seeded.status !== 0) throw new Error(seeded.stderr);
  process.env.EMDASH_ENCRYPTION_KEY ||= `emdash_enc_v1_${Buffer.alloc(32, 11).toString("base64url")}`;
  const db = new Kysely<any>({
    dialect: createDialect({ url: `file:${database}` }),
  });
  const options = new OptionsRepository(db);
  const settings = createSettingsAccess(
    options,
    plugin.id,
    plugin.admin?.settingsSchema || {},
  );
  await settings.set("qqClientId", "test-app");
  await settings.set("qqClientSecret", "only-for-isolated-test");
  await settings.set("qqCallbackUrl", "https://duanap.cn/oauth/qq/callback");
  await settings.set("siteOrigin", "https://duanap.cn");
  const storage = Object.fromEntries(
    Object.entries(plugin.storage || {}).map(([name, config]) => [
      name,
      new PluginStorageRepository(db, plugin.id, name, [
        ...(config.indexes || []),
        ...(config.uniqueIndexes || []),
      ]),
    ]),
  );
  const key = (name: string) => `plugin:${plugin.id}:${name}`;
  const comments = new CommentRepository(db);
  const ctx = {
    comments: { get: (id: string) => comments.findById(id) },
    content: {
      get: async (collection: string, id: string) => {
        if (!["posts", "life", "projects", "wall"].includes(collection))
          return null;
        const row = (await db
          .selectFrom(`ec_${collection}`)
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirst()) as Record<string, unknown> | undefined;
        return row ? { ...row, data: row } : null;
      },
    },
    settings,
    storage,
    kv: {
      get: (name: string) => options.get(key(name)),
      set: (name: string, value: unknown) => options.set(key(name), value),
      delete: (name: string) => options.delete(key(name)),
      getVersioned: (name: string) => options.getVersioned(key(name)),
      compareAndDelete: (name: string, revision: string) =>
        options.compareAndDelete(key(name), revision),
      compareAndSet: (name: string, revision: string | null, value: unknown) =>
        options.compareAndSet(key(name), revision, value),
      list: async (prefix = "") =>
        [...(await options.getByPrefix(key(prefix)))].map(([name, value]) => ({
          key: name.slice(`plugin:${plugin.id}:`.length),
          value,
        })),
    },
    request: new Request(
      "https://duanap.cn/_emdash/api/plugins/duanap-members/auth/status",
    ),
    http: {
      fetch: async (input: string | URL | Request) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        if (url.hostname !== "graph.qq.com")
          throw new Error("Unexpected outbound provider host");
        if (url.pathname === "/oauth2.0/token")
          return Response.json({ access_token: "provider-test-token" });
        if (url.pathname === "/oauth2.0/me")
          return Response.json({ openid: "test-member-openid" });
        return Response.json({
          ret: 0,
          nickname: "测试会员",
          figureurl_qq_2: "https://example.test/avatar.png",
        });
      },
    },
  } as unknown as RouteContext;
  return {
    ctx,
    db,
    options,
    database,
    comments,
    root,
    cleanup: async () => {
      await db.destroy();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function loginMember(plugin: ResolvedPlugin, ctx: RouteContext) {
  const start = (await memberRoute(
    plugin,
    ctx,
    "auth/qq/start",
    "https://duanap.cn/auth/qq/start?returnTo=/member/",
  )) as { headers: [string, string][] };
  const state = new URL(
    start.headers.find(([name]) => name === "location")![1],
  ).searchParams.get("state")!;
  const response = (await memberRoute(
    plugin,
    ctx,
    "auth/qq/callback",
    `https://duanap.cn/oauth/qq/callback?state=${state}&code=test`,
    undefined,
    `dm_state=${state}`,
  )) as { headers: [string, string][] };
  return response.headers
    .find(
      ([name, value]) =>
        name === "set-cookie" && value.startsWith("dm_session="),
    )![1]
    .split(";")[0];
}

export async function memberRoute(
  plugin: ResolvedPlugin,
  ctx: RouteContext,
  path: string,
  url: string,
  input?: unknown,
  cookie?: string,
) {
  ctx.request = new Request(url, {
    method: input ? "POST" : "GET",
    headers: cookie ? { cookie } : {},
  });
  ctx.input = input as RouteContext["input"];
  return plugin.routes![path]!.handler(ctx);
}
