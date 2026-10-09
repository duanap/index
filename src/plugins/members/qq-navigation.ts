/** Adapted from duanap/emdash bb448eaf, MIT. Each site has its own member database. */
export function isQqSiteOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const configured =
      process.env.EMDASH_SITE_URL ||
      process.env.SITE_URL ||
      "https://duanap.cn";
    return (
      url.origin === new URL(configured).origin ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
export function qqReturnTarget(value: string | null, requestUrl: URL): string {
  const fallback = new URL("/", requestUrl.origin).href;
  if (!value || !isQqSiteOrigin(requestUrl.origin)) return fallback;
  try {
    if (value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value))
      return fallback;
    const target = new URL(value, requestUrl.origin);
    return target.origin === requestUrl.origin &&
      !target.username &&
      !target.password
      ? target.href
      : fallback;
  } catch {
    return fallback;
  }
}
