import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent, PhrasingContent } from "mdast";

export type Block = { _type: string; _key: string; [key: string]: unknown };

export function markdownToBlocks(markdown: string): Block[] {
  let sequence = 0;
  const key = () => `md-${sequence++}`;
  const blocks: Block[] = [];
  function paragraph(
    children: PhrasingContent[],
    style = "normal",
    extra: Record<string, unknown> = {},
  ) {
    const spans: Record<string, unknown>[] = [];
    const markDefs: Record<string, unknown>[] = [];
    function inline(nodes: PhrasingContent[], marks: string[] = []) {
      for (const node of nodes) {
        switch (node.type) {
          case "text":
          case "inlineCode":
          case "break":
            spans.push({
              _type: "span",
              _key: key(),
              text: node.type === "break" ? "\n" : node.value,
              marks: node.type === "inlineCode" ? [...marks, "code"] : marks,
            });
            break;
          case "strong":
          case "emphasis":
          case "delete":
            inline(node.children, [
              ...marks,
              node.type === "strong"
                ? "strong"
                : node.type === "emphasis"
                  ? "em"
                  : "strike-through",
            ]);
            break;
          case "link": {
            const id = key();
            markDefs.push({ _key: id, _type: "link", href: node.url });
            inline(node.children, [...marks, id]);
            break;
          }
          case "image":
            blocks.push({
              _type: "image",
              _key: key(),
              asset: { _ref: node.url, url: node.url },
              alt: node.alt || "",
            });
            break;
          default:
            if ("value" in node)
              spans.push({
                _type: "span",
                _key: key(),
                text: node.value,
                marks,
              });
        }
      }
    }
    inline(children);
    if (spans.length)
      blocks.push({
        _type: "block",
        _key: key(),
        style,
        children: spans,
        markDefs,
        ...extra,
      });
  }
  function visit(
    nodes: RootContent[],
    style = "normal",
    extra: Record<string, unknown> = {},
    level = 0,
  ) {
    for (const node of nodes) {
      switch (node.type) {
        case "paragraph":
          paragraph(node.children, style, extra);
          break;
        case "heading":
          paragraph(node.children, `h${node.depth}`, extra);
          break;
        case "blockquote":
          visit(node.children, "blockquote", extra, level);
          break;
        case "list":
          for (const item of node.children)
            visit(
              item.children,
              style,
              {
                ...extra,
                listItem: node.ordered ? "number" : "bullet",
                level: level + 1,
              },
              level + 1,
            );
          break;
        case "code":
          blocks.push({
            _type: "code",
            _key: key(),
            code: node.value,
            language: node.lang || "text",
          });
          break;
        case "thematicBreak":
          blocks.push({ _type: "break", _key: key() });
          break;
        case "html":
          blocks.push({ _type: "htmlBlock", _key: key(), html: node.value });
          break;
        default:
          break;
      }
    }
  }
  visit(fromMarkdown(markdown).children);
  return blocks;
}
