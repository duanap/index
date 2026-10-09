// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import emdash from "emdash/astro";
import { sqlite } from "emdash/db";
import { resolve } from "node:path";
import settings from "./src/site.config.json" with { type: "json" };
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { duanapMembersPlugin } from "./src/plugins/members/index.ts";

const environment = loadEnv(
  process.env.NODE_ENV ?? "production",
  process.cwd(),
  "",
);
/** @param {string} file */
const projectPath = (file) => resolve(file).replaceAll("\\", "/");
const { SITE_URL = "https://duanap.cn" } = loadEnv(
  process.env.NODE_ENV ?? "production",
  process.cwd(),
  "SITE_URL",
);
const site = new URL(SITE_URL);
const requestedLanguage = environment.PUBLIC_SITE_LANGUAGE || settings.language;
if (!["zh-CN", "en", "ja"].includes(requestedLanguage))
  throw new Error("Unsupported site language");
const language = /** @type {"zh-CN" | "en" | "ja"} */ (requestedLanguage);
if (
  !["http:", "https:"].includes(site.protocol) ||
  site.pathname !== "/" ||
  site.search ||
  site.hash ||
  site.username ||
  site.password
) {
  throw new Error(
    "SITE_URL must be an HTTP(S) origin, such as https://example.com, without a path, credentials, query, or fragment.",
  );
}

// https://astro.build/config
export default defineConfig({
  site: site.href,
  output: "server",
  adapter: node({ mode: "standalone" }),
  session: { driver: { entrypoint: projectPath("src/server/session.ts") } },
  security: {
    allowedDomains: [
      { hostname: site.hostname, protocol: site.protocol.slice(0, -1) },
    ],
  },
  i18n: { defaultLocale: language, locales: ["zh-CN", "en", "ja"] },
  trailingSlash: "ignore",
  // Preserve the spacing between inline elements when migrating from Astro 5.
  compressHTML: true,
  integrations: [
    vue({ include: ["**/*.vue"] }),
    react({ include: ["**/*.{jsx,tsx}"] }),
    emdash({
      database: {
        ...sqlite({ url: "file:./data/emdash.db" }),
        entrypoint: projectPath("src/server/database.ts"),
      },
      storage: { entrypoint: projectPath("src/server/storage.ts"), config: {} },
      siteUrl: site.origin,
      plugins: [
        duanapMembersPlugin(projectPath("src/plugins/members/index.ts")),
        {
          id: "kanade-webp",
          version: "1.0.0",
          entrypoint: projectPath("src/server/media-plugin.ts"),
        },
      ],
      maxUploadSize: 10 * 1024 * 1024,
      fonts: false,
      trustedProxyHeaders: ["x-real-ip"],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { "@phosphor-icons/react": projectPath("vendor/admin-icons.tsx") },
    },
    ssr: { noExternal: ["lucide-react"] },
    server: { allowedHosts: [site.hostname] },
  },
});
