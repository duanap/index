import { resolve, join } from "node:path";

/** @param {string} [cwd] */
export function dataPaths(cwd = process.cwd()) {
  const directory = resolve(cwd, process.env.KANADE_DATA_DIR || "data");
  return {
    directory,
    database: join(directory, "emdash.db"),
    uploads: join(directory, "uploads"),
    derivatives: join(directory, "webp"),
  };
}
