import { definePlugin } from "emdash";
import { prepareDerivative } from "../lib/media/derivatives";

export function createPlugin() {
  return definePlugin({
    id: "kanade-webp",
    version: "1.0.0",
    capabilities: ["media:read"],
    hooks: {
      "media:afterUpload": async ({ media }) => {
        const path = new URL(media.url, "http://localhost").pathname;
        const prefix = "/_emdash/api/media/file/";
        if (path.startsWith(prefix))
          await prepareDerivative(
            decodeURIComponent(path.slice(prefix.length)),
          );
      },
    },
  });
}
