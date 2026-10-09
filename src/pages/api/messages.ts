import type { APIRoute } from "astro";
import { getBoardMessages, resolveMessageBoard } from "../../lib/message-board";
import { MessageCursorError } from "../../lib/message-query";

export const GET: APIRoute = async ({ url, locals }) => {
  const headers = { "Cache-Control": "no-store" };
  const board = await resolveMessageBoard(locals);
  if (!board)
    return Response.json({ error: "unavailable" }, { status: 404, headers });
  const requested = url.searchParams.get("boardId");
  if (requested && requested !== board.id)
    return Response.json({ error: "board_changed" }, { status: 409, headers });
  try {
    return Response.json(
      await getBoardMessages(
        board.id,
        url.searchParams.get("cursor") || undefined,
      ),
      { headers },
    );
  } catch (error) {
    if (error instanceof MessageCursorError)
      return Response.json(
        { error: "invalid_cursor" },
        { status: 400, headers },
      );
    throw error;
  }
};
