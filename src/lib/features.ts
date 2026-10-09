import { getEmDashCollection, getEmDashEntry } from "emdash";
import { language } from "../i18n";
import { publicContent } from "./posts";
import {
  loadFeatureEntries,
  normalizeFeature,
  type FeatureCollection,
  type FeatureEntry,
} from "./feature-content";

const requests = new WeakMap<
  object,
  Map<FeatureCollection, Promise<FeatureEntry[]>>
>();
export function getFeatureEntries(
  collection: FeatureCollection,
  locals: object,
): Promise<FeatureEntry[]> {
  let cache = requests.get(locals);
  if (!cache) {
    cache = new Map();
    requests.set(locals, cache);
  }
  let result = cache.get(collection);
  if (!result) {
    result = publicContent(() =>
      loadFeatureEntries(getEmDashCollection, collection, language),
    );
    cache.set(collection, result);
  }
  return result;
}

export async function getFeatureEntry(
  collection: "life" | "projects",
  slug: string,
) {
  const result = await getEmDashEntry(collection, slug, { locale: language });
  if (result.error) throw result.error;
  if (!result.entry) return undefined;
  const entry = normalizeFeature(result.entry, collection, language);
  return entry?.slug === slug ? entry : undefined;
}
