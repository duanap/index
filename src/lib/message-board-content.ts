type BoardRow = {
  id: string;
  slug?: string;
  locale?: string | null;
  status: string;
  created_at?: string;
  deleted_at?: unknown;
};
export function chooseMessageBoard(rows: BoardRow[], locale: string) {
  const row = rows
    .filter(
      (item) =>
        item.status === "published" &&
        item.locale === locale &&
        !item.deleted_at &&
        item.slug,
    )
    .sort(
      (a, b) =>
        (a.created_at || "").localeCompare(b.created_at || "") ||
        a.id.localeCompare(b.id),
    )[0];
  return row ? { id: row.id, slug: row.slug! } : null;
}
