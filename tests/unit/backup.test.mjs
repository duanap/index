import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("online backup includes committed WAL rows, uploads and protected encryption-key file", async () => {
  const { backupSite } = await import("../../scripts/backup.mjs").catch(
    () => ({}),
  );
  assert.equal(typeof backupSite, "function");
  const root = await mkdtemp(join(tmpdir(), "kanade-backup-"));
  const dataDir = join(root, "data");
  await mkdir(join(dataDir, "uploads"), { recursive: true });
  await writeFile(join(dataDir, "uploads/photo.png"), "original");
  const keyFile = join(root, "site.env");
  await writeFile(keyFile, "EMDASH_ENCRYPTION_KEY=secret-for-test-only\n", {
    mode: 0o600,
  });
  const db = new DatabaseSync(join(dataDir, "emdash.db"));
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE content(title TEXT); INSERT INTO content VALUES ('published in WAL');",
    );
    const destination = join(root, "backup");
    await backupSite({ dataDir, destination, keyFile });
    const restored = new DatabaseSync(join(destination, "emdash.db"), {
      readOnly: true,
    });
    assert.equal(
      restored.prepare("select title from content").get().title,
      "published in WAL",
    );
    restored.close();
    assert.equal(
      await readFile(join(destination, "uploads/photo.png"), "utf8"),
      "original",
    );
    assert.equal(
      await readFile(join(destination, "site.env"), "utf8"),
      await readFile(keyFile, "utf8"),
    );
    assert.equal(
      (await stat(join(destination, "site.env"))).mode & 0o777,
      0o600,
    );
    await assert.rejects(
      () => backupSite({ dataDir, destination, keyFile }),
      /exist/i,
    );
    await assert.rejects(
      () =>
        backupSite({ dataDir, destination: join(dataDir, "nested"), keyFile }),
      /outside/i,
    );
    await symlink(dataDir, join(root, "alias"));
    await assert.rejects(
      () =>
        backupSite({
          dataDir,
          destination: join(root, "alias", "nested"),
          keyFile,
        }),
      /outside/i,
    );
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
