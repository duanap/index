import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { Kysely } from "kysely";
import { createDialect } from "emdash/db/sqlite";
import { applySeed } from "emdash/seed";

async function originalSite() {
  const root = await mkdtemp(join(tmpdir(), "kanade-feature-migration-"));
  const data = join(root, "data");
  await mkdir(join(data, "uploads"), { recursive: true });
  const database = join(data, "emdash.db");
  const seed = JSON.parse(await readFile("seed/seed.json", "utf8"));
  seed.collections = seed.collections.filter((collection) =>
    ["posts", "pages"].includes(collection.slug),
  );
  for (const collection of seed.collections) collection.commentsEnabled = false;
  seed.taxonomies = seed.taxonomies.filter((taxonomy) =>
    ["category", "tag"].includes(taxonomy.name),
  );
  seed.content = { posts: seed.content.posts, pages: seed.content.pages };
  const baseline = join(root, "baseline.json");
  await writeFile(baseline, JSON.stringify(seed));
  const run = spawnSync(
    process.execPath,
    [
      resolve("node_modules/emdash/dist/cli/index.mjs"),
      "seed",
      baseline,
      "--database",
      database,
      "--on-conflict",
      "skip",
    ],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const db = new DatabaseSync(database);
  db.prepare("UPDATE ec_posts SET title=? WHERE locale=?").run(
    "保留作者编辑",
    "zh-CN",
  );
  db.prepare("INSERT INTO users(id,email,name,role) VALUES(?,?,?,?)").run(
    "kept-admin",
    "owner@example.test",
    "已有管理员",
    100,
  );
  db.prepare("INSERT OR REPLACE INTO options(name,value) VALUES(?,?)").run(
    "test-existing-setting",
    "preserved",
  );
  db.close();
  const keyFile = join(data, "site.env");
  await writeFile(keyFile, "EMDASH_ENCRYPTION_KEY=existing-test-key\n", {
    mode: 0o600,
  });
  await writeFile(join(data, "uploads/photo.png"), "original-media");
  return {
    root,
    data,
    database,
    uploads: join(data, "uploads"),
    keyFile,
    backupDestination: join(root, "backup"),
  };
}

test("feature migration adds only missing models, backs up old data, and safely replays", async () => {
  const { planFeatureMigration, applyFeatureMigration } =
    await import("../../scripts/migrate-fork-features.mjs").catch(() => ({}));
  assert.equal(
    typeof planFeatureMigration,
    "function",
    "explicit feature migration must exist",
  );
  const site = await originalSite();
  try {
    const before = await readFile(site.database);
    const plan = await planFeatureMigration(site);
    assert.deepEqual(plan.collections, ["life", "projects", "wall", "friends"]);
    assert.deepEqual(
      await readFile(site.database),
      before,
      "dry-run must not change database bytes",
    );
    const applied = await applyFeatureMigration(site);
    assert.equal(applied.changed, true);
    const db = new DatabaseSync(site.database, { readOnly: true });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ec_posts").get().n, 24);
    assert.equal(
      db
        .prepare("SELECT title FROM ec_posts WHERE locale=? LIMIT 1")
        .get("zh-CN").title,
      "保留作者编辑",
    );
    assert.equal(
      db.prepare("SELECT name FROM users WHERE id=?").get("kept-admin").name,
      "已有管理员",
    );
    assert.equal(
      db
        .prepare("SELECT value FROM options WHERE name=?")
        .get("test-existing-setting").value,
      "preserved",
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ec_friends").get().n, 12);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ec_wall").get().n, 3);
    db.close();
    assert.equal(
      await readFile(site.keyFile, "utf8"),
      "EMDASH_ENCRYPTION_KEY=existing-test-key\n",
    );
    assert.equal(
      await readFile(join(site.backupDestination, "uploads/photo.png"), "utf8"),
      "original-media",
    );
    const backup = new DatabaseSync(join(site.backupDestination, "emdash.db"), {
      readOnly: true,
    });
    assert.equal(
      backup
        .prepare("SELECT COUNT(*) n FROM _emdash_collections WHERE slug=?")
        .get("life").n,
      0,
    );
    backup.close();
    assert.equal((await applyFeatureMigration(site)).changed, false);
    assert.deepEqual((await planFeatureMigration(site)).collections, []);
    const edited = new DatabaseSync(site.database);
    edited.prepare("DELETE FROM ec_friends WHERE locale=?").run("zh-CN");
    edited.close();
    assert.equal(
      (
        await applyFeatureMigration({
          ...site,
          backupDestination: join(site.root, "backup-after-editor-changes"),
        })
      ).changed,
      false,
      "replay must not restore intentionally deleted default friends",
    );
  } finally {
    await rm(site.root, { recursive: true, force: true });
  }
});

test("feature migration requires a complete key/media recovery point before changing schema", async () => {
  const { applyFeatureMigration } =
    await import("../../scripts/migrate-fork-features.mjs");
  const site = await originalSite();
  try {
    const before = await readFile(site.database);
    await assert.rejects(
      () => applyFeatureMigration({ ...site, backupDestination: undefined }),
      /backup/i,
    );
    assert.deepEqual(await readFile(site.database), before);
  } finally {
    await rm(site.root, { recursive: true, force: true });
  }
});

test("interrupted default insertion resumes without losing remaining friends or marking the migration complete", async () => {
  const { planFeatureMigration, applyFeatureMigration } =
    await import("../../scripts/migrate-fork-features.mjs");
  const site = await originalSite();
  try {
    const schema = JSON.parse(await readFile("seed/features.json", "utf8"));
    const prepared = new Kysely({
      dialect: createDialect({ url: `file:${site.database}` }),
    });
    await applySeed(
      prepared,
      { ...schema, content: {} },
      { includeContent: false, onConflict: "skip" },
    );
    await prepared.destroy();
    const fault = new DatabaseSync(site.database);
    fault.exec(
      "CREATE TRIGGER fail_vue BEFORE INSERT ON ec_friends WHEN NEW.slug='vue' BEGIN SELECT RAISE(ABORT,'injected default failure'); END",
    );
    fault.close();
    await assert.rejects(
      () => applyFeatureMigration(site),
      /injected default failure/,
    );
    const paused = new DatabaseSync(site.database);
    assert.equal(
      paused.prepare("SELECT COUNT(*) n FROM ec_friends").get().n,
      1,
    );
    assert.equal(
      paused
        .prepare("SELECT value FROM options WHERE name=?")
        .get("kanade:fork-features:v1"),
      undefined,
    );
    paused.exec("DROP TRIGGER fail_vue");
    paused.close();
    assert.equal((await planFeatureMigration(site)).changed, true);
    await applyFeatureMigration({
      ...site,
      backupDestination: join(site.root, "resume-backup"),
    });
    const done = new DatabaseSync(site.database);
    assert.equal(done.prepare("SELECT COUNT(*) n FROM ec_friends").get().n, 12);
    assert.equal(
      done
        .prepare("SELECT title FROM ec_posts WHERE locale=? LIMIT 1")
        .get("zh-CN").title,
      "保留作者编辑",
    );
    done.close();
  } finally {
    await rm(site.root, { recursive: true, force: true });
  }
});

test("existing setup refuses an unbacked upgrade and never restores deleted demo posts", async () => {
  const { applyFeatureMigration } =
    await import("../../scripts/migrate-fork-features.mjs");
  const site = await originalSite();
  const setupSeed = () =>
    spawnSync(process.execPath, [resolve("scripts/seed.mjs")], {
      env: { ...process.env, KANADE_DATA_DIR: site.data },
      encoding: "utf8",
    });
  try {
    const before = await readFile(site.database);
    const refused = setupSeed();
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /backed-up migrate:fork/);
    assert.deepEqual(await readFile(site.database), before);
    await applyFeatureMigration(site);
    const edited = new DatabaseSync(site.database);
    edited
      .prepare("DELETE FROM ec_posts WHERE slug=? AND locale=?")
      .run("hello-kanade", "zh-CN");
    edited.close();
    assert.equal(setupSeed().status, 0);
    const preserved = new DatabaseSync(site.database);
    assert.equal(
      preserved.prepare("SELECT COUNT(*) n FROM ec_posts").get().n,
      23,
    );
    preserved.close();
  } finally {
    await rm(site.root, { recursive: true, force: true });
  }
});

test("default locale seeding leaves existing CMS friends untouched", async () => {
  const { applyFeatureMigration } =
    await import("../../scripts/migrate-fork-features.mjs");
  const site = await originalSite();
  try {
    const seed = JSON.parse(await readFile("seed/features.json", "utf8"));
    const db = new Kysely({
      dialect: createDialect({ url: `file:${site.database}` }),
    });
    await applySeed(
      db,
      {
        ...seed,
        content: {
          friends: [
            {
              id: "own-friend",
              slug: "own-friend",
              locale: "zh-CN",
              status: "published",
              data: {
                title: "站主已有友链",
                url: "https://example.test/",
                order: 0,
              },
            },
          ],
        },
      },
      { includeContent: true, onConflict: "skip" },
    );
    await db.destroy();
    await applyFeatureMigration(site);
    const preserved = new DatabaseSync(site.database);
    assert.equal(
      preserved
        .prepare("SELECT COUNT(*) n FROM ec_friends WHERE locale=?")
        .get("zh-CN").n,
      1,
    );
    assert.equal(
      preserved
        .prepare("SELECT title FROM ec_friends WHERE locale=?")
        .get("zh-CN").title,
      "站主已有友链",
    );
    assert.equal(
      preserved
        .prepare("SELECT COUNT(*) n FROM ec_friends WHERE locale=?")
        .get("en").n,
      4,
    );
    preserved.close();
  } finally {
    await rm(site.root, { recursive: true, force: true });
  }
});

test("feature migration refuses incompatible existing fields before changing data", async () => {
  const { planFeatureMigration } =
    await import("../../scripts/migrate-fork-features.mjs").catch(() => ({}));
  assert.equal(typeof planFeatureMigration, "function");
  const site = await originalSite();
  try {
    const db = new DatabaseSync(site.database);
    db.prepare(
      "INSERT INTO _emdash_collections(id,slug,label,label_singular,supports) VALUES(?,?,?,?,?)",
    ).run("bad-life", "life", "生活", "生活", "[]");
    db.prepare(
      "INSERT INTO _emdash_fields(id,collection_id,slug,label,type,column_type,sort_order) VALUES(?,?,?,?,?,?,?)",
    ).run("bad-title", "bad-life", "title", "标题", "number", "real", 0);
    db.close();
    const before = await readFile(site.database);
    await assert.rejects(
      () => planFeatureMigration(site),
      /incompatible.*life.*title/i,
    );
    assert.deepEqual(await readFile(site.database), before);
  } finally {
    await rm(site.root, { recursive: true, force: true });
  }
});
