import { test } from "node:test";
import assert from "node:assert/strict";

test("live post adapter consumes cursor pages, respects locale and propagates errors", async () => {
  const { loadPosts } = await import("../../src/lib/cms-posts.ts").catch(
    () => ({}) as Record<string, unknown>,
  );
  assert.equal(typeof loadPosts, "function");
  const seen: unknown[] = [];
  const entry = (slug: string, date: string, locale = "zh-CN") => ({
    id: slug,
    data: {
      slug,
      locale,
      title: slug,
      excerpt: "摘要",
      date,
      status: "published",
      content: [],
      terms: {
        category: [{ slug: "notes", label: "开发笔记" }],
        tag: [{ label: "标签" }],
      },
    },
  });
  const query = async (_type: string, options: Record<string, unknown>) => {
    seen.push(options);
    return options.cursor
      ? { entries: [entry("new", "2026-10-08")], nextCursor: undefined }
      : {
          entries: [
            entry("old", "2026-09-18"),
            entry("english", "2026-10-09", "en"),
          ],
          nextCursor: "next",
        };
  };
  const posts = await (loadPosts as Function)(query, "zh-CN");
  assert.deepEqual(
    posts.map((p: { id: string }) => p.id),
    ["new", "old"],
  );
  assert.equal(posts[0].data.category, "notes");
  assert.deepEqual(posts[0].data.tags, ["标签"]);
  assert.equal((seen[0] as Record<string, unknown>).status, "published");
  assert.equal((seen[0] as Record<string, unknown>).locale, "zh-CN");
  await assert.rejects(
    () =>
      (loadPosts as Function)(
        async () => ({ entries: [], error: new Error("DB unavailable") }),
        "zh-CN",
      ),
    /DB unavailable/,
  );
});

test("summary and headings preserve dates and duplicate heading anchors", async () => {
  const api = await import("../../src/lib/cms-posts.ts").catch(
    () => ({}) as Record<string, unknown>,
  );
  assert.equal(typeof api.normalizePost, "function");
  const content = [
    { _type: "block", _key: "a", style: "h2", children: [{ text: "重复" }] },
    { _type: "block", _key: "b", style: "h2", children: [{ text: "重复" }] },
  ];
  const post = (api.normalizePost as Function)(
    {
      id: "hello",
      data: {
        slug: "hello",
        title: "标题",
        excerpt: "摘要",
        date: "2026-09-18",
        locale: "zh-CN",
        content,
      },
    },
    "zh-CN",
  );
  assert.equal((api.summarize as Function)(post).date, "2026-09-18");
  assert.deepEqual(
    (api.getHeadings as Function)(content).map((h: { slug: string }) => h.slug),
    ["h-a", "h-b"],
  );
});

test("cursor paging retains more than 100 published entries and rejects a stuck cursor", async () => {
  const { loadPosts } = await import("../../src/lib/cms-posts.ts");
  const entries = Array.from({ length: 103 }, (_, i) => ({
    id: String(i),
    data: {
      slug: String(i),
      title: String(i),
      excerpt: "",
      date: "2026-10-08",
      status: "published",
      locale: "zh-CN",
      content: [],
    },
  }));
  const posts = await loadPosts(
    async (_type, options) =>
      options.cursor
        ? { entries: entries.slice(100) }
        : { entries: entries.slice(0, 100), nextCursor: "second" },
    "zh-CN",
  );
  assert.equal(posts.length, 103);
  assert.equal(new Set(posts.map((post) => post.id)).size, 103);
  await assert.rejects(
    () =>
      loadPosts(async () => ({ entries: [], nextCursor: "stuck" }), "zh-CN"),
    /did not advance/,
  );
});
