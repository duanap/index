import type { SiteSettings } from "emdash";
import { safeSiteLink } from "./feature-content";
import { webpUrl } from "./media/urls";
export interface HeroSlide {
  title: string;
  imageUrl: string;
  url: string;
  excerpt: string;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function image(value: unknown) {
  const url = safeSiteLink(value);
  return url &&
    (url.startsWith("/_emdash/api/media/file/") || /^https?:\/\//.test(url))
    ? webpUrl(url)
    : undefined;
}
export function heroSlides(settings: Partial<SiteSettings>): HeroSlide[] {
  return (Array.isArray(settings.heroSlides) ? settings.heroSlides : [])
    .flatMap((value) => {
      const row = record(value);
      const imageUrl = image(row.imageUrl);
      const url = safeSiteLink(row.url);
      return imageUrl &&
        url &&
        typeof row.title === "string" &&
        row.title.trim()
        ? [
            {
              title: row.title.slice(0, 200),
              imageUrl,
              url,
              excerpt:
                typeof row.excerpt === "string"
                  ? row.excerpt.slice(0, 500)
                  : "",
            },
          ]
        : [];
    })
    .slice(0, 8);
}
export function footerLinks(settings: Partial<SiteSettings>) {
  return (Array.isArray(settings.footerLinks) ? settings.footerLinks : [])
    .flatMap((value) => {
      const row = record(value);
      const url = safeSiteLink(row.url);
      return url && typeof row.label === "string" && row.label.trim()
        ? [{ label: row.label.slice(0, 200), url, iconUrl: image(row.iconUrl) }]
        : [];
    })
    .slice(0, 20);
}
const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
export function carouselOptions(
  input: NonNullable<SiteSettings["heroCarousel"]> = {},
) {
  const positions = [
    "top-start",
    "top-center",
    "top-end",
    "center-start",
    "center",
    "center-end",
    "bottom-start",
    "bottom-center",
    "bottom-end",
  ];
  const height = (v: unknown, fallback: number) =>
    v === 0 ? 0 : number(v, fallback, 160, 1200);
  return {
    intervalSeconds: number(input.intervalSeconds, 7, 2, 60),
    blurPx: number(input.blurPx, 0, 0, 30),
    overlayOpacity: number(input.overlayOpacity, 45, 0, 100),
    textPosition: positions.includes(input.textPosition || "")
      ? input.textPosition!
      : "center",
    titleSize: number(input.titleSize, 42, 12, 120),
    mobileTitleSize: number(input.mobileTitleSize, 28, 12, 72),
    descriptionSize: number(input.descriptionSize, 16, 12, 40),
    height: height(input.height, 450),
    mobileHeight: height(input.mobileHeight, 330),
  };
}
