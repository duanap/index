import { mkdir, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataPaths } from "../config/runtime.mjs";
import { writeFile } from "node:fs/promises";
import { generateProjectEnvTypes } from "../node_modules/emdash/dist/schema/project-env-types.mjs";

/** Prepare local files without resetting existing CMS data or keys. @param {string} [cwd] */
export async function setup(cwd = process.cwd()) {
  const paths = dataPaths(cwd);
  await mkdir(paths.uploads, { recursive: true });
  await mkdir(paths.derivatives, { recursive: true });
  if (!process.env.EMDASH_ENCRYPTION_KEY) {
    const cli = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../node_modules/emdash/dist/cli/index.mjs",
    );
    const result = spawnSync(
      process.execPath,
      [cli, "secrets", "generate", "--write", resolve(cwd, ".env")],
      { cwd, stdio: "ignore" },
    );
    if (result.status !== 0)
      throw new Error("EmDash encryption-key initialization failed");
    await chmod(resolve(cwd, ".env"), 0o600);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await setup();
  await writeFile(
    "emdash-env.d.ts",
    await generateProjectEnvTypes(process.cwd()),
  );
  console.log(
    "Local data directories and encryption-key binding prepared. Existing data is preserved.",
  );
}
