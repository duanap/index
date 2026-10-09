import { defineMiddleware } from "astro:middleware";
import { prepareDerivative } from "./lib/media/derivatives";
import { getDb } from "emdash/runtime";
import { sql } from "kysely";
import { language } from "./i18n";
import { sitemapUrls } from "./lib/sitemap";
import { setSiteSettings } from "emdash";
import { prepareKanadeComment, discardKanadeComment } from "./plugins/members";

declare global {
  namespace App {
    interface Locals {
      kanadeCommentPrepared?: boolean;
    }
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const comments = context.url.pathname.match(
    /^\/_emdash\/api\/comments\/([a-z_]+)\/([^/]+)(?:\/reactions)?\/?$/,
  );
  if (comments) {
    const [, collection, encodedId] = comments;
    if (!["posts", "life", "projects", "wall"].includes(collection!))
      return new Response(null, { status: 404 });
    let id: string;
    try {
      id = decodeURIComponent(encodedId!);
    } catch {
      return new Response(null, { status: 404 });
    }
    const db = await getDb();
    const result = await sql<{
      id: string;
    }>`SELECT id FROM ${sql.table(`ec_${collection}`)} WHERE id=${id} AND status='published' AND locale=${language} AND deleted_at IS NULL`.execute(
      db,
    );
    if (!result.rows.length) return new Response(null, { status: 404 });
    if (
      context.request.method === "POST" &&
      !context.url.pathname.endsWith("/reactions") &&
      !context.locals.kanadeCommentPrepared
    ) {
      if (
        context.request.headers.get("X-EmDash-Request") !== "1" &&
        context.request.headers.get("origin") !== context.url.origin
      )
        return new Response(null, { status: 403 });
      try {
        const input: unknown = await context.request.clone().json();
        if (input && typeof input === "object" && !Array.isArray(input)) {
          const prepared = await prepareKanadeComment(
            context.request,
            collection!,
            id,
            input as Record<string, unknown>,
          );
          context.locals.kanadeCommentPrepared = true;
          const headers = new Headers(context.request.headers);
          headers.delete("content-length");
          try {
            return await context.rewrite(
              new Request(context.request, {
                headers,
                body: JSON.stringify(prepared),
              }),
            );
          } finally {
            await discardKanadeComment(prepared);
          }
        }
      } catch {
        /* Core parsing reports invalid JSON without accepting a comment. */
      }
    }
  }
  const response = await next();
  // The framework route performs administrator permission, token-scope and CSRF
  // checks first. Report this theme's actual dynamic map after that authorization.
  if (
    context.request.method === "POST" &&
    context.url.pathname === "/_emdash/api/settings/sitemap"
  ) {
    const payload = await response
      .clone()
      .json()
      .catch(() => null);
    if (
      payload?.success ||
      payload?.error?.code === "SITEMAP_GENERATION_ERROR"
    ) {
      const urls = await sitemapUrls(
        context.site || new URL(context.url.origin),
        context.locals,
      );
      const generatedAt = new Date().toISOString();
      await setSiteSettings({ sitemapUpdatedAt: generatedAt }, await getDb());
      return Response.json(
        {
          success: true,
          data: { generatedAt, collections: 1, urls: urls.length },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  const prefix = "/_emdash/api/media/file/";
  if (
    context.request.method === "GET" &&
    context.url.pathname.startsWith(prefix) &&
    context.url.searchParams.get("format") === "webp" &&
    response.status === 200 &&
    !context.request.headers.has("Range") &&
    ["image/jpeg", "image/png"].includes(
      response.headers.get("Content-Type") || "",
    )
  ) {
    const key = decodeURIComponent(context.url.pathname.slice(prefix.length));
    const converted = await prepareDerivative(key);
    if (converted) {
      await response.body?.cancel();
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("Content-Type", "image/webp");
      headers.set("Content-Length", String(converted.bytes.length));
      headers.set("ETag", `"webp-${converted.hash}"`);
      headers.delete("Last-Modified");
      headers.delete("Accept-Ranges");
      headers.delete("Content-Range");
      return new Response(new Uint8Array(converted.bytes), {
        status: 200,
        headers,
      });
    }
  }
  if (!context.url.pathname.startsWith("/_astro/"))
    response.headers.set("Cache-Control", "no-store");
  return response;
});
