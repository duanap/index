import { spawnSync } from "node:child_process";
import { dataPaths } from "../config/runtime.mjs";
const paths = dataPaths();
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
process.exit(result.status ?? 1);
