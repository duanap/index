import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Markdown migration preserves headings, inline links, lists and fenced code", async () => {
  const { markdownToBlocks } =
    await import("../../scripts/content/markdown.ts").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof markdownToBlocks, "function");
  const blocks = (markdownToBlocks as Function)(
    "## 标题\n\n这是 **粗体** 和 [链接](https://example.com)。\n\n- 第一项\n  - 子项\n\n```ts\nconst x = 1;\n```",
  );
  assert.equal(blocks[0].style, "h2");
  assert.ok(
    blocks[1].children.some((s: { marks: string[] }) =>
      s.marks.includes("strong"),
    ),
  );
  assert.equal(blocks[1].markDefs[0].href, "https://example.com");
  assert.equal(blocks[2].listItem, "bullet");
  assert.equal(blocks[3].level, 2);
  assert.equal(blocks[4]._type, "code");
  assert.equal(blocks[4].code, "const x = 1;");
  assert.equal(blocks[4].language, "ts");
});

test("seed contains all 24 posts with localized slugs, dates and native taxonomies", async () => {
  const { buildSeed } = await import("../../scripts/content/seed.ts").catch(
    () => ({}) as Record<string, unknown>,
  );
  assert.equal(typeof buildSeed, "function");
  const seed = await (buildSeed as Function)(process.cwd());
  assert.equal(seed.content.posts.length, 24);
  for (const locale of ["zh-CN", "en", "ja"]) {
    const posts = seed.content.posts.filter(
      (p: { locale: string }) => p.locale === locale,
    );
    assert.equal(posts.length, 8);
    const hello = posts.find(
      (p: { slug: string }) => p.slug === "hello-kanade",
    );
    assert.equal(hello.data.date, "2026-09-18T00:00:00.000Z");
    assert.equal(hello.status, "published");
    assert.equal(hello.taxonomies.category[0], "notes");
    assert.ok(
      hello.data.content.some((b: { style: string }) => b.style === "h2"),
    );
  }
  assert.deepEqual(seed, await (buildSeed as Function)(process.cwd()));
  const original = await readFile("src/content/posts/hello-kanade.md", "utf8");
  assert.match(original, /## 为什么还要写博客/);
});
