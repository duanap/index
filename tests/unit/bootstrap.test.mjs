import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("setup preserves an existing encryption key and existing environment settings", async () => {
  const { setup } = await import("../../scripts/setup.mjs").catch(() => ({}));
  assert.equal(typeof setup, "function", "idempotent setup must exist");
  const dir = await mkdtemp(join(tmpdir(), "kanade-setup-"));
  try {
    const original =
      "SITE_URL=https://duanap.cn\nEMDASH_ENCRYPTION_KEY=existing-test-key\n";
    await writeFile(join(dir, ".env"), original);
    await setup(dir);
    assert.equal(await readFile(join(dir, ".env"), "utf8"), original);
    assert.ok((await stat(join(dir, "data/uploads"))).isDirectory());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setup generates a local key once without writing a production administrator", async () => {
  const { setup } = await import("../../scripts/setup.mjs").catch(() => ({}));
  assert.equal(typeof setup, "function");
  const dir = await mkdtemp(join(tmpdir(), "kanade-setup-"));
  try {
    await setup(dir);
    const first = await readFile(join(dir, ".env"), "utf8");
    assert.match(
      first,
      /EMDASH_ENCRYPTION_KEY=emdash_enc_v1_[A-Za-z0-9_-]{43}/,
    );
    assert.doesNotMatch(first, /ADMIN|PASSWORD/);
    await setup(dir);
    assert.equal(await readFile(join(dir, ".env"), "utf8"), first);
    assert.equal((await stat(join(dir, ".env"))).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
