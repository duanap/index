import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const production = process.argv.includes("--production");
const port = production ? "4173" : "4174";
const root = await mkdtemp(join(tmpdir(), "kanade-e2e-"));
const env = {
  ...process.env,
  KANADE_DATA_DIR: root,
  HOST: "127.0.0.1",
  PORT: port,
  ASTRO_TELEMETRY_DISABLED: "1",
};
if (!production) {
  env.SITE_URL = `http://127.0.0.1:${port}`;
  env.EMDASH_SITE_URL = env.SITE_URL;
}
const seeded = spawnSync(process.execPath, ["scripts/setup.mjs"], {
  env,
  stdio: "inherit",
});
if (seeded.status !== 0) {
  await rm(root, { recursive: true, force: true });
  process.exit(seeded.status || 1);
}
const seed = spawnSync(process.execPath, ["scripts/seed.mjs"], {
  env,
  stdio: "inherit",
});
if (seed.status !== 0) {
  await rm(root, { recursive: true, force: true });
  process.exit(seed.status || 1);
}
const child = spawn(
  process.execPath,
  production
    ? ["dist/server/entry.mjs"]
    : [
        "node_modules/astro/bin/astro.mjs",
        "dev",
        "--ignore-lock",
        "--host",
        "127.0.0.1",
        "--port",
        port,
      ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await rm(root, { recursive: true, force: true });
  process.exit(code || 0);
});
