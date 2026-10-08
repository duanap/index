import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const api = () =>
  import("../../src/lib/media/convert.ts").catch(
    () => ({}) as Record<string, unknown>,
  );
test("JPEG conversion creates real WebP, limits dimensions and removes EXIF", async () => {
  const { convertImage } = await api();
  assert.equal(typeof convertImage, "function");
  const source = await sharp({
    create: { width: 3000, height: 1500, channels: 3, background: "#e2aabc" },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const result = await (convertImage as Function)(source);
  const meta = await sharp(result.bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 2560);
  assert.equal(meta.height, 1280);
  assert.equal(meta.exif, undefined);
  assert.ok(result.bytes.length < source.length);
});
test("PNG conversion preserves alpha and fixes EXIF orientation without enlarging", async () => {
  const { convertImage } = await api();
  assert.equal(typeof convertImage, "function");
  const source = await sharp({
    create: {
      width: 40,
      height: 20,
      channels: 4,
      background: { r: 220, g: 20, b: 60, alpha: 0.5 },
    },
  })
    .png()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await (convertImage as Function)(source);
  const meta = await sharp(result.bytes).metadata();
  assert.equal(meta.width, 20);
  assert.equal(meta.height, 40);
  assert.equal(meta.hasAlpha, true);
  const { data } = await sharp(result.bytes)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.ok(data[3]! > 100 && data[3]! < 150);
});
test("SVG, GIF animation and existing WebP are preserved; malformed or oversized images are rejected", async () => {
  const { convertImage } = await api();
  assert.equal(typeof convertImage, "function");
  const png = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const webp = await sharp(png).webp().toBuffer();
  const frames = Buffer.alloc(10 * 20 * 4, 128);
  frames.fill(220, 10 * 10 * 4);
  const gif = await sharp(frames, {
    raw: { width: 10, height: 20, channels: 4, pageHeight: 10 },
  })
    .gif({ delay: [100, 100], loop: 0 })
    .toBuffer();
  assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 2);
  assert.equal(await (convertImage as Function)(gif), null);
  assert.equal(await (convertImage as Function)(webp), null);
  assert.equal(
    await (convertImage as Function)(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      ),
    ),
    null,
  );
  await assert.rejects(() =>
    (convertImage as Function)(Buffer.from("broken image")),
  );
  await assert.rejects(
    () => (convertImage as Function)(png, { maxBytes: 10 }),
    /large/i,
  );
  await assert.rejects(() =>
    (convertImage as Function)(png, { maxPixels: 10 }),
  );
});

test("derivatives survive restart and regenerate on replacement; deleted media never resolves stale bytes", async () => {
  const { DerivativeStore } =
    await import("../../src/lib/media/derivatives.ts").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof DerivativeStore, "function");
  const root = await mkdtemp(join(tmpdir(), "kanade-media-"));
  const uploads = join(root, "uploads");
  const derivatives = join(root, "webp");
  await mkdir(uploads);
  try {
    const key = "picture.png";
    const original = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await writeFile(join(uploads, key), original);
    const store = new (DerivativeStore as any)({ uploads, derivatives });
    const first = await store.ensure(key);
    assert.equal((await sharp(first.bytes).metadata()).format, "webp");
    assert.deepEqual(await readFile(join(uploads, key)), original);
    const restarted = new (DerivativeStore as any)({ uploads, derivatives });
    assert.equal((await restarted.ensure(key)).hash, first.hash);
    await writeFile(
      join(uploads, key),
      await sharp({
        create: { width: 20, height: 10, channels: 3, background: "blue" },
      })
        .png()
        .toBuffer(),
    );
    const replaced = await restarted.ensure(key);
    assert.notEqual(replaced.hash, first.hash);
    await rm(join(uploads, key));
    await restarted.remove(key);
    assert.equal(await restarted.ensure(key), null);
    await assert.rejects(() => store.ensure("../outside.png"), /key/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
