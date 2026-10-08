import type { APIRoute } from "astro";
import { sitemapUrls, xmlEscape } from "../lib/sitemap";
export const GET: APIRoute = async ({ site, locals }) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${(await sitemapUrls(site!, locals)).map((url) => `<url><loc>${xmlEscape(url)}</loc></url>`).join("")}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
