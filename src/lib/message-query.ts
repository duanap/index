import { sql, type QueryExecutorProvider } from "kysely";
import type { PaperMessage, MessagePage } from "./message-types";

export class MessageCursorError extends Error {}
type CommentRow = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  moderation_metadata: string | null;
};
function parseCursor(value?: string): { id: string; date: string } | undefined {
  if (!value) return;
  try {
    if (value.length > 512 || !/^[\w-]+$/.test(value)) throw Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed.id !== "string" ||
      !/^[\w-]{1,128}$/.test(parsed.id) ||
      typeof parsed.date !== "string" ||
      parsed.date.length > 40 ||
      !Number.isFinite(Date.parse(parsed.date))
    )
      throw Error();
    return { id: parsed.id, date: parsed.date };
  } catch {
    throw new MessageCursorError("Invalid message cursor");
  }
}
export async function loadPublicMessages(
  db: QueryExecutorProvider,
  id: string,
  locale: string,
  cursor?: string,
): Promise<MessagePage> {
  const after = parseCursor(cursor);
  const position = after
    ? sql`AND (created_at < ${after.date} OR (created_at=${after.date} AND id < ${after.id}))`
    : sql``;
  const rows = (
    await sql<CommentRow>`SELECT id, author_name, body, created_at, moderation_metadata FROM _emdash_comments
   WHERE collection='wall' AND content_id=${id} AND status='approved'
   AND EXISTS (SELECT 1 FROM ec_wall WHERE ec_wall.id=${id} AND status='published' AND deleted_at IS NULL AND locale=${locale})
   ${position} ORDER BY created_at DESC, id DESC LIMIT 51`.execute(db)
  ).rows;
  const page = rows.slice(0, 50);
  const items = page.map((row) => {
    let color: PaperMessage["color"] = "butter";
    try {
      const value = JSON.parse(row.moderation_metadata || "{}").kanadeColor;
      if (["butter", "rose", "mint", "sky", "lilac"].includes(value))
        color = value;
    } catch {
      /* Legacy records have no paper metadata. */
    }
    return {
      id: row.id,
      name: row.author_name,
      content: row.body,
      date: row.created_at,
      color,
    };
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ id: last.id, date: last.created_at }),
          ).toString("base64url")
        : undefined,
  };
}
