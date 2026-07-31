import { playerIdFromRequest, toResponse } from "@/lib/http";
import { projectForPlayer } from "@/lib/projection";
import { normalizeCode, readRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Vercel streaming budget; the client reconnects transparently after this. */
export const maxDuration = 60;

const POLL_MS = 800;
const HEARTBEAT_MS = 15_000;
const STREAM_LIFETIME_MS = 50_000;

/**
 * GET /api/rooms/[code]/stream — Server-Sent Events feed of the room.
 *
 * Why SSE rather than WebSockets: Vercel functions don't hold WebSocket
 * connections, and this game's update rate is low (a handful of events per
 * minute). A single streaming function per client, tailing the room's revision
 * counter, gives sub-second updates with no extra infrastructure.
 *
 * Each `state` event carries the caller's *projected* view, so secrecy rules
 * are applied per-subscriber.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const playerId = await playerIdFromRequest(request);

    // Fail fast with a normal JSON error if the room is gone.
    await readRoom(code);

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        const startedAt = Date.now();
        let lastRev = -1;
        let lastPush = 0;

        request.signal.addEventListener("abort", () => {
          closed = true;
        });

        // Advise the client how long to wait before reconnecting.
        controller.enqueue(encoder.encode("retry: 1000\n\n"));

        while (!closed && Date.now() - startedAt < STREAM_LIFETIME_MS) {
          try {
            const state = await readRoom(code);
            const now = Date.now();
            if (state.rev !== lastRev || now - lastPush > HEARTBEAT_MS) {
              lastRev = state.rev;
              lastPush = now;
              send("state", projectForPlayer(state, playerId, now));
            } else {
              controller.enqueue(encoder.encode(": ping\n\n"));
            }
          } catch {
            send("gone", { error: "This room no longer exists." });
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }

        if (!closed) send("reconnect", {});
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}
