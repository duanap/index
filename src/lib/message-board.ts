import { sql } from "kysely";
import { getDb } from "emdash/runtime";
import { language } from "../i18n";
import { chooseMessageBoard } from "./message-board-content";
import { loadPublicMessages } from "./message-query";

const cache = new WeakMap<
  object,
  Promise<{ id: string; slug: string } | null>
>();
export function resolveMessageBoard(locals: object) {
  let result = cache.get(locals);
  if (!result) {
    result = (async () => {
      const db = await getDb();
      const exists = await db
        .selectFrom("_emdash_collections")
        .select("slug")
        .where("slug", "=", "wall")
        .executeTakeFirst();
      if (!exists) return null;
      const rows = await sql<{
        id: string;
        slug: string;
        locale: string;
        status: string;
        created_at: string;
      }>`SELECT id, slug, locale, status, created_at FROM ec_wall WHERE status='published' AND deleted_at IS NULL AND locale=${language} ORDER BY created_at, id LIMIT 1`.execute(
        db,
      );
      return chooseMessageBoard(rows.rows, language);
    })();
    cache.set(locals, result);
  }
  return result;
}
export async function getBoardMessages(id: string, cursor?: string) {
  return loadPublicMessages(await getDb(), id, language, cursor);
}
