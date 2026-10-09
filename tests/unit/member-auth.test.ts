import { test } from "node:test";
import assert from "node:assert/strict";
import { membersFixture, memberRoute, loginMember } from "../helpers/members";

test("QQ login validates state, keeps secret encrypted, sets a private session and consumes state once", async () => {
  const { createPlugin } =
    await import("../../src/plugins/members/index").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof createPlugin, "function");
  const plugin = (createPlugin as Function)();
  const fixture = await membersFixture(plugin);
  try {
    const start = (await memberRoute(
      plugin,
      fixture.ctx,
      "auth/qq/start",
      "https://duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/start?returnTo=/member/",
    )) as { headers: [string, string][] };
    const target = new URL(
      start.headers.find(([name]) => name === "location")![1],
    );
    const state = target.searchParams.get("state")!;
    assert.equal(target.origin, "https://graph.qq.com");
    const cookie = `dm_state=${state}`;
    const callback = (await memberRoute(
      plugin,
      fixture.ctx,
      "auth/qq/callback",
      `https://duanap.cn/oauth/qq/callback?state=${state}&code=test`,
      undefined,
      cookie,
    )) as { headers: [string, string][] };
    const session = callback.headers.find(
      ([name, value]) =>
        name === "set-cookie" && value.startsWith("dm_session="),
    )![1];
    assert.match(session, /HttpOnly/);
    assert.match(session, /Secure/);
    assert.match(session, /SameSite=Lax/);
    assert.equal(
      callback.headers.find(([name]) => name === "location")![1],
      "/member/",
    );
    const status = (await memberRoute(
      plugin,
      fixture.ctx,
      "auth/status",
      "https://duanap.cn/auth/status",
      undefined,
      session.split(";")[0],
    )) as { data: { loggedIn: boolean; member: Record<string, unknown> } };
    assert.equal(status.data.loggedIn, true);
    assert.equal(status.data.member.qqOpenid, undefined);
    const encrypted = await fixture.options.get(
      "plugin:duanap-members:settings:qqClientSecret",
    );
    assert.notEqual(encrypted, "only-for-isolated-test");
    const again = (await memberRoute(
      plugin,
      fixture.ctx,
      "auth/qq/callback",
      `https://duanap.cn/oauth/qq/callback?state=${state}&code=test`,
      undefined,
      cookie,
    )) as { headers: [string, string][] };
    assert.equal(
      again.headers.some(
        ([name, value]) =>
          name === "set-cookie" && value.startsWith("dm_session="),
      ),
      false,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("returnTo stays on this site and rejects sibling domains and credentials", async () => {
  const { qqReturnTarget } =
    await import("../../src/plugins/members/qq-navigation").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof qqReturnTarget, "function");
  const base = new URL("https://duanap.cn/login/");
  for (const value of [
    "https://blog.duanap.cn/member/",
    "//evil.test/",
    "https://user:secret@duanap.cn/member/",
    "/\\evil.test/",
  ])
    assert.equal(
      (qqReturnTarget as Function)(value, base),
      "https://duanap.cn/",
    );
  assert.equal(
    (qqReturnTarget as Function)("/member/?tab=favorites", base),
    "https://duanap.cn/member/?tab=favorites",
  );
});

test("concurrent callbacks consume one OAuth state atomically", async () => {
  const { createPlugin } = await import("../../src/plugins/members/index");
  const plugin = createPlugin();
  const fixture = await membersFixture(plugin);
  try {
    const start = (await memberRoute(
      plugin,
      fixture.ctx,
      "auth/qq/start",
      "https://duanap.cn/auth/qq/start",
    )) as { headers: [string, string][] };
    const state = new URL(
      start.headers.find(([n]) => n === "location")![1],
    ).searchParams.get("state")!;
    // Force the two real SQLite reads to overlap, rather than relying on scheduler luck.
    let reads = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const kv = {
      ...fixture.ctx.kv,
      get: async <T>(key: string) => {
        const result = await fixture.ctx.kv.get<T>(key);
        if (++reads === 2) release();
        await barrier;
        return result;
      },
      getVersioned: async <T>(key: string) => {
        const result = await fixture.ctx.kv.getVersioned<T>(key);
        if (++reads === 2) release();
        await barrier;
        return result;
      },
    };
    const responses = (await Promise.all(
      [1, 2].map(() =>
        memberRoute(
          plugin,
          { ...fixture.ctx, kv },
          "auth/qq/callback",
          `https://duanap.cn/oauth/qq/callback?state=${state}&code=test`,
          undefined,
          `dm_state=${state}`,
        ),
      ),
    )) as { headers: [string, string][] }[];
    assert.equal(
      responses.filter((r) =>
        r.headers.some(
          ([n, v]) => n === "set-cookie" && v.startsWith("dm_session="),
        ),
      ).length,
      1,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("state double validation, expiry, profile preservation, private overview and logout use real SQLite", async () => {
  const { createPlugin } = await import("../../src/plugins/members/index");
  const plugin = createPlugin();
  const f = await membersFixture(plugin);
  try {
    const start = (await memberRoute(
      plugin,
      f.ctx,
      "auth/qq/start",
      "https://duanap.cn/auth/qq/start",
    )) as { headers: [string, string][] };
    const state = new URL(
      start.headers.find(([n]) => n === "location")![1],
    ).searchParams.get("state")!;
    const bad = (await memberRoute(
      plugin,
      f.ctx,
      "auth/qq/callback",
      `https://duanap.cn/oauth/qq/callback?state=${state}&code=test`,
      undefined,
      "dm_state=wrong",
    )) as { headers: [string, string][] };
    assert.match(
      bad.headers.find(([n]) => n === "location")![1],
      /state_mismatch/,
    );
    await f.ctx.kv.set(
      `oauth:state:${state}`,
      JSON.stringify({ returnTo: "/member/", expiresAt: "2000-01-01" }),
    );
    const expired = (await memberRoute(
      plugin,
      f.ctx,
      "auth/qq/callback",
      `https://duanap.cn/oauth/qq/callback?state=${state}&code=test`,
      undefined,
      `dm_state=${state}`,
    )) as { headers: [string, string][] };
    assert.match(
      expired.headers.find(([n]) => n === "location")![1],
      /state_expired/,
    );
    const cookie = await loginMember(plugin, f.ctx);
    const update = (await memberRoute(
      plugin,
      f.ctx,
      "member/profile",
      "https://duanap.cn/member/profile",
      { displayName: "自定昵称", bio: "自己的简介" },
      cookie,
    )) as { ok: boolean };
    assert.equal(update.ok, true);
    const again = await loginMember(plugin, f.ctx);
    const overview = (await memberRoute(
      plugin,
      f.ctx,
      "member/overview",
      "https://duanap.cn/member/overview?memberId=someone-else",
      undefined,
      again,
    )) as { member: { displayName: string; bio: string } };
    assert.equal(overview.member.displayName, "自定昵称");
    assert.equal(overview.member.bio, "自己的简介");
    assert.equal(
      (
        (await memberRoute(
          plugin,
          f.ctx,
          "member/overview",
          "https://duanap.cn/member/overview",
        )) as { reason: string }
      ).reason,
      "unauthorized",
    );
    const row = (await f.ctx.storage.members.query({ limit: 1 })).items[0];
    await f.ctx.storage.members.put(row.id, {
      ...(row.data as object),
      status: "disabled",
    });
    assert.equal(
      (
        (await memberRoute(
          plugin,
          f.ctx,
          "member/overview",
          "https://duanap.cn/member/overview",
          undefined,
          cookie,
        )) as { reason: string }
      ).reason,
      "unauthorized",
    );
    await f.ctx.storage.members.put(row.id, row.data);
    await f.ctx.storage.sessions.put(again.slice("dm_session=".length), {
      memberId: "test-member-openid",
      expiresAt: "2000-01-01",
    });
    assert.equal(
      (
        (await memberRoute(
          plugin,
          f.ctx,
          "member/overview",
          "https://duanap.cn/member/overview",
          undefined,
          again,
        )) as { reason: string }
      ).reason,
      "unauthorized",
    );
    await memberRoute(
      plugin,
      f.ctx,
      "auth/logout",
      "https://duanap.cn/auth/logout",
      {},
      cookie,
    );
    assert.equal(
      (
        (await memberRoute(
          plugin,
          f.ctx,
          "member/overview",
          "https://duanap.cn/member/overview",
          undefined,
          cookie,
        )) as { reason: string }
      ).reason,
      "unauthorized",
    );
  } finally {
    await f.cleanup();
  }
});
