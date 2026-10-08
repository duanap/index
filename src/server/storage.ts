import { createStorage as localStorage } from "emdash/storage/local";
import { prepareDerivative, derivativeStore } from "../lib/media/derivatives";
import { dataPaths } from "../../config/runtime.mjs";

export function createStorage() {
  const storage = localStorage({
    directory: dataPaths().uploads,
    baseUrl: "/_emdash/api/media/file",
  });
  const upload = storage.upload.bind(storage);
  storage.upload = async (options) => {
    const result = await upload(options);
    if (options.contentType?.startsWith("image/")) {
      await derivativeStore().remove(options.key);
      await prepareDerivative(options.key);
    }
    return result;
  };
  const remove = storage.delete.bind(storage);
  storage.delete = async (key) => {
    await remove(key);
    await derivativeStore().remove(key);
  };
  return storage;
}
