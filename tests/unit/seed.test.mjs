import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("official seed replay skips existing content and keeps all localized translations", async () => {
  const root = await mkdtemp(join(tmpdir(), "kanade-seed-"));
  const database = join(root, "emdash.db");
  const source = JSON.parse(await readFile("seed/seed.json", "utf8"));
  const edited = structuredClone(source);
  edited.content.posts[0].data.title = "Existing editor title";
  const file = join(root, "edited-seed.json");
  await writeFile(file, JSON.stringify(edited));
  const seed = (path) => {
    const run = spawnSync(
      process.execPath,
      [
        resolve("node_modules/emdash/dist/cli/index.mjs"),
        "seed",
        path,
        "--database",
        database,
        "--uploads-dir",
        join(root, "uploads"),
        "--on-conflict",
        "skip",
      ],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr.slice(0, 300));
  };
  try {
    seed(file);
    seed(resolve("seed/seed.json"));
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM ec_posts").get().n,
        24,
      );
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ec_pages").get().n, 3);
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM ec_posts p JOIN content_taxonomies ct ON ct.entry_id=p.translation_group JOIN taxonomies t ON t.translation_group=ct.taxonomy_id AND t.locale=p.locale WHERE t.name='category'",
          )
          .get().n,
        24,
      );
      assert.equal(
        db
          .prepare("SELECT title FROM ec_posts WHERE slug=? AND locale=?")
          .get(edited.content.posts[0].slug, edited.content.posts[0].locale)
          .title,
        "Existing editor title",
      );
    } finally {
      db.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
