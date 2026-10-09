import type { APIRoute } from "astro";

export const GET: APIRoute = ({ url, rewrite }) =>
  rewrite(`/_emdash/api/plugins/duanap-members/auth/qq/callback${url.search}`);
