import { test } from "node:test";
import assert from "node:assert/strict";

const entry = (slug: string, extra: Record<string, unknown> = {}) => ({
  id: slug,
  data: {
    id: `db-${slug}`,
    slug,
    locale: "zh-CN",
    status: "published",
    title: slug,
    date: "2026-10-09T00:00:00.000Z",
    content: [],
    ...extra,
  },
});

test("feature lists exhaust cursor pages, exclude drafts and other languages, and retain database IDs", async () => {
  const { loadFeatureEntries } =
    await import("../../src/lib/feature-content").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof loadFeatureEntries, "function");
  const result = await (loadFeatureEntries as Function)(
    async (_collection: string, options: { cursor?: string }) =>
      options.cursor
        ? { entries: [entry("older", { date: "2025-12-31T00:00:00.000Z" })] }
        : {
            entries: [
              entry("visible"),
              entry("draft", { status: "draft" }),
              entry("english", { locale: "en" }),
            ],
            nextCursor: "next",
          },
    "life",
    "zh-CN",
  );
  assert.deepEqual(
    result.map((item: { slug: string }) => item.slug),
    ["visible", "older"],
  );
  assert.equal(result[0].id, "db-visible");
});

test("archives use UTC year/month boundaries and keep descending entry dates", async () => {
  const { archiveEntries } =
    await import("../../src/lib/feature-content").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof archiveEntries, "function");
  const entries = [
    { slug: "new-year", date: new Date("2026-01-01T00:00:00.000Z") },
    { slug: "last-year", date: new Date("2025-12-31T23:59:59.000Z") },
  ];
  assert.deepEqual(
    (archiveEntries as Function)(entries, "2025", "12")[0].items.map(
      (item: { slug: string }) => item.slug,
    ),
    ["last-year"],
  );
  assert.equal((archiveEntries as Function)(entries, "2026", "13").length, 0);
});

test("friend cards reject executable URLs and private or invalid entries do not become public defaults", async () => {
  const { loadFeatureEntries } =
    await import("../../src/lib/feature-content").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof loadFeatureEntries, "function");
  const result = await (loadFeatureEntries as Function)(
    async () => ({
      entries: [
        entry("safe", { url: "https://example.test/", order: 2 }),
        entry("unsafe", { url: "javascript:alert(1)" }),
        entry("hidden", { url: "https://example.test/", status: "draft" }),
      ],
    }),
    "friends",
    "zh-CN",
  );
  assert.deepEqual(
    result.map((item: { slug: string }) => item.slug),
    ["safe"],
  );
});

test("feature paging keeps more than 100 entries and rejects stuck cursors and invalid dates", async () => {
  const { loadFeatureEntries } = await import("../../src/lib/feature-content");
  const items = Array.from({ length: 121 }, (_, i) => entry(`item-${i}`));
  const result = await loadFeatureEntries(
    async (_collection, options) =>
      options.cursor
        ? { entries: items.slice(100) }
        : { entries: items.slice(0, 100), nextCursor: "remaining" },
    "life",
    "zh-CN",
  );
  assert.equal(result.length, 121);
  await assert.rejects(
    () =>
      loadFeatureEntries(
        async () => ({ entries: [], nextCursor: "stuck" }),
        "life",
        "zh-CN",
      ),
    /did not advance/,
  );
  await assert.rejects(
    () =>
      loadFeatureEntries(
        async () => ({ entries: [entry("bad-date", { date: "invalid" })] }),
        "life",
        "zh-CN",
      ),
    /Invalid life date/,
  );
});
