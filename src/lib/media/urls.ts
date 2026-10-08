export function webpUrl(src: string | undefined): string | undefined {
  if (!src || src.startsWith("//")) return undefined;
  const url = new URL(src, "https://duanap.cn");
  if (!["https:", "http:"].includes(url.protocol)) return undefined;
  if (src.startsWith("/_emdash/api/media/file/")) {
    url.searchParams.set("format", "webp");
    return `${url.pathname}${url.search}`;
  }
  return src;
}
