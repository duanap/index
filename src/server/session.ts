import fsLite from "unstorage/drivers/fs-lite";
import { join } from "node:path";
import { dataPaths } from "../../config/runtime.mjs";

export default function createSessionDriver() {
  return fsLite({ base: join(dataPaths().directory, "sessions") });
}
