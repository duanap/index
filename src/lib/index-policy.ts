import { getDb } from "emdash/runtime";

const requests = new WeakMap<object, Promise<Set<string>>>();
export function getIndexExclusions(locals: object): Promise<Set<string>> {
  let result = requests.get(locals);
  if (!result) {
    result = (async () => {
      const db = await getDb();
      const rows = await db
        .selectFrom("_emdash_seo")
        .select(["collection", "content_id"])
        .where("seo_no_index", "=", 1)
        .execute();
      return new Set(rows.map((row) => `${row.collection}:${row.content_id}`));
    })();
    requests.set(locals, result);
  }
  return result;
}
