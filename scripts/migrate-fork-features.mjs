import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Kysely } from "kysely";
import { createDialect } from "emdash/db/sqlite";
import { applySeed } from "emdash/seed";
import { SchemaRegistry } from "emdash";
import { backupSite } from "./backup.mjs";
import { dataPaths } from "../config/runtime.mjs";

const featureFile = new URL("../seed/features.json", import.meta.url);
const versionKey = "kanade:fork-features:v1";
const pendingKey = versionKey + ":pending";
function hasMigrationWork(plan) {
  return Boolean(
    plan.collections.length ||
    plan.fields.length ||
    plan.taxonomies.length ||
    plan.comments.length ||
    plan.contentMissing.length,
  );
}
async function featureSeed() {
  return JSON.parse(await readFile(featureFile, "utf8"));
}

export async function planFeatureMigration({ database }) {
  const seed = await featureSeed();
  const db = new DatabaseSync(resolve(database), { readOnly: true });
  const plan = {
    collections: [],
    fields: [],
    taxonomies: [],
    contentLocales: {},
    comments: [],
    contentMissing: [],
    needsFinalize: false,
    changed: false,
  };
  try {
    const initialized =
      db.prepare("SELECT value FROM options WHERE name=?").get(versionKey)
        ?.value === "1";
    plan.needsFinalize = !initialized;
    const pendingValue = db
      .prepare("SELECT value FROM options WHERE name=?")
      .get(pendingKey)?.value;
    const pending = pendingValue ? JSON.parse(pendingValue) : undefined;
    for (const collection of seed.collections) {
      const existing = db
        .prepare("SELECT * FROM _emdash_collections WHERE slug=?")
        .get(collection.slug);
      if (!existing) {
        plan.collections.push(collection.slug);
        continue;
      }
      for (const field of collection.fields) {
        const old = db
          .prepare(
            "SELECT * FROM _emdash_fields WHERE collection_id=? AND slug=?",
          )
          .get(existing.id, field.slug);
        if (old && old.type !== field.type)
          throw new Error(
            `Incompatible field ${collection.slug}.${field.slug}: ${old.type}, expected ${field.type}`,
          );
        if (!old)
          plan.fields.push({ collection: collection.slug, field: field.slug });
      }
      if (
        !db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(`ec_${collection.slug}`)
      )
        throw new Error(
          `Incompatible collection ${collection.slug}: physical table is missing`,
        );
    }
    const hasTaxonomyGroups = !!db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_emdash_taxonomy_def_groups'",
      )
      .get();
    for (const taxonomy of seed.taxonomies) {
      const definitions = db
        .prepare("SELECT * FROM _emdash_taxonomy_defs WHERE name=?")
        .all(taxonomy.name);
      if (!definitions.length) {
        plan.taxonomies.push(taxonomy.name);
        continue;
      }
      for (const definition of definitions) {
        // In 1.2 the shared group owns structure; localized definitions retain legacy columns.
        const existing =
          (hasTaxonomyGroups && definition.translation_group
            ? db
                .prepare("SELECT * FROM _emdash_taxonomy_def_groups WHERE id=?")
                .get(definition.translation_group)
            : undefined) || definition;
        let collections;
        try {
          collections = JSON.parse(existing.collections || "[]");
        } catch {
          throw Error(
            `Incompatible taxonomy ${taxonomy.name}: invalid collections`,
          );
        }
        if (
          Boolean(existing.hierarchical) !== Boolean(taxonomy.hierarchical) ||
          !Array.isArray(collections) ||
          collections.some((value) => typeof value !== "string") ||
          JSON.stringify([...new Set(collections)].sort()) !==
            JSON.stringify([...taxonomy.collections].sort())
        )
          throw Error(
            `Incompatible taxonomy ${taxonomy.name}: expected hierarchy=${Boolean(taxonomy.hierarchical)} and collections=${taxonomy.collections.join(",")}`,
          );
      }
    }
    for (const name of ["wall", "friends"]) {
      const exists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(`ec_${name}`);
      plan.contentLocales[name] = initialized
        ? []
        : (pending?.contentLocales[name] ??
          ["zh-CN", "en", "ja"].filter(
            (locale) =>
              !exists ||
              !db
                .prepare(`SELECT id FROM ec_${name} WHERE locale=? LIMIT 1`)
                .get(locale),
          ));
      if (
        !Array.isArray(plan.contentLocales[name]) ||
        plan.contentLocales[name].some(
          (locale) => !["zh-CN", "en", "ja"].includes(locale),
        )
      )
        throw new Error("Invalid pending feature migration state");
      for (const entry of seed.content[name])
        if (
          plan.contentLocales[name].includes(entry.locale) &&
          (!exists ||
            !db
              .prepare(`SELECT id FROM ec_${name} WHERE slug=? AND locale=?`)
              .get(entry.slug, entry.locale))
        )
          plan.contentMissing.push({
            collection: name,
            slug: entry.slug,
            locale: entry.locale,
          });
    }
    for (const name of ["posts", "life", "projects", "wall"]) {
      const collection = db
        .prepare(
          "SELECT comments_enabled FROM _emdash_collections WHERE slug=?",
        )
        .get(name);
      if (collection && !collection.comments_enabled) plan.comments.push(name);
    }
    plan.changed = hasMigrationWork(plan) || plan.needsFinalize;
    return plan;
  } finally {
    db.close();
  }
}

export async function applyFeatureMigration({
  database,
  uploads,
  keyFile,
  backupDestination,
}) {
  const plan = await planFeatureMigration({ database });
  if (!plan.changed) return { changed: false, plan };
  if (!backupDestination || !keyFile)
    throw new Error(
      "A backup destination and existing encryption-key file are required",
    );
  const dataDir = dirname(resolve(database));
  if (resolve(database) !== join(dataDir, "emdash.db"))
    throw new Error(
      "Complete site backups require the canonical emdash.db filename",
    );
  if (resolve(uploads) !== join(dataDir, "uploads"))
    throw new Error("Uploads must match the persistent data directory");
  await backupSite({ dataDir, destination: backupDestination, keyFile });
  const seed = await featureSeed();
  const db = new Kysely({
    dialect: createDialect({ url: `file:${resolve(database)}` }),
  });
  try {
    await db
      .insertInto("options")
      .values({
        name: pendingKey,
        value: JSON.stringify({ contentLocales: plan.contentLocales }),
      })
      .onConflict((conflict) => conflict.column("name").doNothing())
      .execute();
    const content = Object.fromEntries(
      Object.entries(seed.content).map(([name, entries]) => {
        const chosen = entries
          .filter((entry) => plan.contentLocales[name].includes(entry.locale))
          .map((entry) => ({ ...entry }));
        for (const entry of chosen)
          if (
            entry.translationOf &&
            !chosen.some((canonical) => canonical.id === entry.translationOf)
          )
            delete entry.translationOf;
        return [name, chosen];
      }),
    );
    await applySeed(
      db,
      { ...seed, content: {} },
      { includeContent: false, onConflict: "skip" },
    );
    const registry = new SchemaRegistry(db);
    for (const item of plan.fields) {
      const field = seed.collections
        .find((collection) => collection.slug === item.collection)
        .fields.find((field) => field.slug === item.field);
      await registry.createField(item.collection, {
        ...field,
        defaultValue: field.default,
      });
    }
    await applySeed(
      db,
      { ...seed, content },
      { includeContent: true, onConflict: "skip" },
    );
    for (const collection of ["posts", "life", "projects", "wall"]) {
      if (
        plan.comments.includes(collection) ||
        plan.collections.includes(collection)
      )
        await registry.updateCollection(collection, {
          commentsEnabled: true,
          commentsModeration: "all",
          commentsAutoApproveUsers: false,
        });
    }
    const remaining = await planFeatureMigration({ database });
    if (hasMigrationWork(remaining))
      throw new Error(
        "Feature migration is incomplete; inspect the remaining plan before starting the new application",
      );
    await db
      .insertInto("options")
      .values({ name: versionKey, value: "1" })
      .onConflict((conflict) => conflict.column("name").doNothing())
      .execute();
    await db.deleteFrom("options").where("name", "=", pendingKey).execute();
    return { changed: true, plan, backupDestination };
  } finally {
    await db.destroy();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      database: { type: "string" },
      "dry-run": { type: "boolean" },
      apply: { type: "boolean" },
      "key-file": { type: "string" },
      "backup-destination": { type: "string" },
    },
  });
  const paths = dataPaths();
  const database = values.database || paths.database;
  const result = values.apply
    ? await applyFeatureMigration({
        database,
        uploads: join(dirname(resolve(database)), "uploads"),
        keyFile: values["key-file"],
        backupDestination: values["backup-destination"],
      })
    : await planFeatureMigration({ database });
  console.log(JSON.stringify(result, null, 2));
}
