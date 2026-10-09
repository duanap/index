import { getSiteSettings, type SiteSettings } from "emdash";
export { heroSlides, footerLinks, carouselOptions } from "./settings-content";
const cache = new WeakMap<object, Promise<Partial<SiteSettings>>>();
export function getKanadeSiteSettings(
  locals: object,
): Promise<Partial<SiteSettings>> {
  let promise = cache.get(locals);
  if (!promise) {
    promise = getSiteSettings();
    cache.set(locals, promise);
  }
  return promise;
}
