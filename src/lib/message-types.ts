export interface PaperMessage {
  id: string;
  name: string;
  content: string;
  date: string;
  color: "butter" | "rose" | "mint" | "sky" | "lilac";
  local?: boolean;
}
export interface MessagePage {
  items: PaperMessage[];
  nextCursor?: string;
}
