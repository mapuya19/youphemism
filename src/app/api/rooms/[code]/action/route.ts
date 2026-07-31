import { NextResponse } from "next/server";
import { jsonError, playerIdFromRequest, toResponse } from "@/lib/http";
import { projectForPlayer } from "@/lib/projection";
import { mutateRoom, normalizeCode } from "@/lib/rooms";
import { actionSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/rooms/[code]/action
 *
 * The single write endpoint. Body is a validated `Action`; the response is the
 * caller's projected view of the resulting state, so the UI updates instantly
 * without waiting for the SSE stream to catch up.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    if (!code) return jsonError("Invalid room code.", 400);

    const playerId = await playerIdFromRequest(request);
    if (!playerId) return jsonError("Missing or malformed player token.", 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Body must be JSON.", 400);
    }

    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid action.", 400);
    }

    const state = await mutateRoom(code, playerId, parsed.data);
    return NextResponse.json(projectForPlayer(state, playerId, Date.now()), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return toResponse(error);
  }
}
