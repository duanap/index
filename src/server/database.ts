import { mkdirSync } from "node:fs";
import { createDialect as sqliteDialect } from "emdash/db/sqlite";
import { dataPaths } from "../../config/runtime.mjs";

export function createDialect() {
  const paths = dataPaths();
  mkdirSync(paths.directory, { recursive: true });
  return sqliteDialect({ url: `file:${paths.database}` });
}
