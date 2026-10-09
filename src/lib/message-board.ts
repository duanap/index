import { sql } from "kysely";
import { getDb } from "emdash/runtime";
import { language } from "../i18n";
import { chooseMessageBoard } from "./message-board-content";
import type { PaperMessage } from "./message-types";

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
export async function getBoardMessages(id: string): Promise<PaperMessage[]> {
  const db = await getDb();
  const rows = await sql<{
    id: string;
    author_name: string;
    body: string;
    created_at: string;
    moderation_metadata: string | null;
  }>`SELECT id, author_name, body, created_at, moderation_metadata FROM _emdash_comments WHERE collection='wall' AND content_id=${id} AND status='approved' ORDER BY created_at DESC, id DESC LIMIT 100`.execute(
    db,
  );
  return rows.rows.map((row) => {
    let color: PaperMessage["color"] = "butter";
    try {
      const value = JSON.parse(row.moderation_metadata || "{}").kanadeColor;
      if (["butter", "rose", "mint", "sky", "lilac"].includes(value))
        color = value;
    } catch {
      /* old comments have no paper metadata */
    }
    return {
      id: row.id,
      name: row.author_name,
      content: row.body,
      date: row.created_at,
      color,
    };
  });
}
