import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dataPaths } from "../config/runtime.mjs";
import { planFeatureMigration } from "./migrate-fork-features.mjs";

const paths = dataPaths();
let established = false;
if (existsSync(paths.database)) {
  const db = new DatabaseSync(paths.database, { readOnly: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    for (const { name } of tables) {
      if (name === "users" || /^ec_[a-z][a-z0-9_]*$/.test(name)) {
        if (db.prepare(`SELECT 1 FROM "${name}" LIMIT 1`).get())
          established = true;
      }
    }
    if (
      tables.some(({ name }) => name === "options") &&
      db
        .prepare("SELECT value FROM options WHERE name=?")
        .get("kanade:fork-features:v1")?.value === "1"
    )
      established = true;
  } finally {
    db.close();
  }
}

if (established) {
  const plan = await planFeatureMigration({ database: paths.database });
  if (plan.changed)
    throw new Error(
      "Existing CMS requires an explicit backed-up migrate:fork --apply. Setup does not upgrade or replay demo content in an established database.",
    );
  console.log(
    "Existing CMS content, settings and administrator data preserved; demo content was not replayed.",
  );
} else {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/emdash/dist/cli/index.mjs",
      "seed",
      "seed/seed.json",
      "--database",
      paths.database,
      "--uploads-dir",
      paths.uploads,
      "--on-conflict",
      "skip",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  const db = new DatabaseSync(paths.database);
  db.prepare(
    "INSERT INTO options(name,value) VALUES(?,?) ON CONFLICT(name) DO NOTHING",
  ).run("kanade:fork-features:v1", "1");
  db.close();
}
