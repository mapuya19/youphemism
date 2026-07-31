import { NextResponse } from "next/server";
import { jsonError, playerIdFromRequest, toResponse } from "@/lib/http";
import { projectForPlayer } from "@/lib/projection";
import { normalizeCode, readRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/rooms/[code] — one-shot snapshot. Used for the initial paint and as
 * a fallback if the SSE stream is unavailable (e.g. a proxy that buffers).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    if (!code) return jsonError("Invalid room code.", 400);
    const playerId = await playerIdFromRequest(request);
    const state = await readRoom(code);
    return NextResponse.json(projectForPlayer(state, playerId, Date.now()), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return toResponse(error);
  }
}
