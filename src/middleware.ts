import { defineMiddleware } from "astro:middleware";
import { prepareDerivative } from "./lib/media/derivatives";

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
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
