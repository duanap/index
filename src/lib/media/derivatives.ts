import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  stat,
  rm,
  realpath,
} from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { dataPaths } from "../../../config/runtime.mjs";
import { convertImage, imageOptions } from "./convert";

type Descriptor = {
  signature: string;
  policy: string;
  hash: string;
  file: string | null;
  width?: number;
  height?: number;
};
export type Derivative = {
  bytes: Buffer;
  hash: string;
  width: number;
  height: number;
};
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

export class DerivativeStore {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Promise<Derivative | null>>();
  constructor(private paths: { uploads: string; derivatives: string }) {}

  private source(key: string) {
    if (
      !key ||
      key.includes("\\") ||
      key.startsWith("/") ||
      key.split("/").some((part) => !part || part === ".." || part === ".")
    )
      throw new Error("Invalid media key");
    const base = resolve(this.paths.uploads);
    const path = resolve(base, key);
    if (!path.startsWith(base + sep)) throw new Error("Invalid media key");
    return path;
  }
  private descriptorPath(key: string) {
    return join(this.paths.derivatives, `${hash(key)}.json`);
  }
  private async descriptor(key: string): Promise<Descriptor | undefined> {
    try {
      return JSON.parse(await readFile(this.descriptorPath(key), "utf8"));
    } catch (e) {
      if (missing(e) || e instanceof SyntaxError) return undefined;
      throw e;
    }
  }
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async clear(key: string) {
    const old = await this.descriptor(key);
    if (old?.file && /^[a-f0-9-]+\.webp$/.test(old.file))
      await rm(join(this.paths.derivatives, old.file), { force: true });
    await rm(this.descriptorPath(key), { force: true });
  }
  async remove(key: string) {
    this.source(key);
    await this.enqueue(() => this.clear(key));
  }
  async ensure(key: string): Promise<Derivative | null> {
    this.source(key);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const result = this.enqueue(() => this.generate(key)).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, result);
    return result;
  }
  private async generate(key: string): Promise<Derivative | null> {
    const source = this.source(key);
    let sourceStat;
    try {
      const [realSource, realBase] = await Promise.all([
        realpath(source),
        realpath(this.paths.uploads),
      ]);
      if (!realSource.startsWith(realBase + sep))
        throw new Error("Invalid media key: symlink escapes uploads");
      sourceStat = await stat(source);
    } catch (e) {
      if (missing(e)) {
        await this.clear(key);
        return null;
      }
      throw e;
    }
    const signature = `${sourceStat.size}:${sourceStat.mtimeMs}:${sourceStat.ctimeMs}:${sourceStat.ino}`;
    const config = imageOptions();
    const policy = hash(JSON.stringify(config));
    const old = await this.descriptor(key);
    if (old?.signature === signature && old.policy === policy) {
      if (!old.file) return null;
      try {
        return {
          bytes: await readFile(join(this.paths.derivatives, old.file)),
          hash: old.hash,
          width: old.width!,
          height: old.height!,
        };
      } catch (e) {
        if (!missing(e)) throw e;
      }
    }
    if (sourceStat.size > config.maxBytes)
      throw new Error("Image is too large");
    const bytes = await readFile(source);
    const contentHash = hash(bytes);
    const converted = await convertImage(bytes);
    const after = await stat(source).catch((e) => {
      if (missing(e)) return undefined;
      throw e;
    });
    if (
      !after ||
      `${after.size}:${after.mtimeMs}:${after.ctimeMs}:${after.ino}` !==
        signature
    )
      return null;
    await mkdir(this.paths.derivatives, { recursive: true });
    const filename = converted
      ? `${hash(key)}-${contentHash}-${policy}.webp`
      : null;
    let temp: string | undefined;
    try {
      if (converted && filename) {
        temp = join(this.paths.derivatives, `${randomUUID()}.tmp`);
        await writeFile(temp, converted.bytes, { mode: 0o600 });
        await rename(temp, join(this.paths.derivatives, filename));
        temp = undefined;
      }
      const record: Descriptor = {
        signature,
        policy,
        hash: contentHash,
        file: filename,
        width: converted?.width,
        height: converted?.height,
      };
      temp = `${this.descriptorPath(key)}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(record), { mode: 0o600 });
      await rename(temp, this.descriptorPath(key));
      temp = undefined;
      if (
        old?.file &&
        old.file !== filename &&
        /^[a-f0-9-]+\.webp$/.test(old.file)
      )
        await rm(join(this.paths.derivatives, old.file), { force: true });
    } finally {
      if (temp) await rm(temp, { force: true });
    }
    return converted ? { ...converted, hash: contentHash } : null;
  }
}

let shared: DerivativeStore | undefined;
export function derivativeStore() {
  return (shared ??= new DerivativeStore(dataPaths()));
}
export async function prepareDerivative(key: string) {
  try {
    return await derivativeStore().ensure(key);
  } catch (error) {
    console.error(
      "[kanade-media] WebP conversion failed; original retained:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}
