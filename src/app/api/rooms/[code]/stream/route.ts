import { playerIdFromRequest, toResponse } from "@/lib/http";
import { projectForPlayer } from "@/lib/projection";
import { normalizeCode, peekRev, readRoom } from "@/lib/rooms";

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
 * Why SSE rather than WebSockets: Vercel functions can't hold WebSocket
 * connections, and this game's update rate is a handful of events per minute.
 * A single streaming function per client, tailing the room's revision counter,
 * gives sub-second updates with no extra infrastructure.
 *
 * The hot loop polls a tiny `rev` key (a few bytes) and only reads the full
 * room — ~20KB — when something has actually changed, or when a phase deadline
 * has elapsed and needs enforcing. Without that split, six players would pull
 * hundreds of megabytes per hour out of Redis just to watch an idle lobby.
 *
 * Each `state` event carries the caller's *projected* view, so secrecy rules
 * are applied per subscriber.
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
        const enqueue = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };
        const send = (event: string, data: unknown) =>
          enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

        const startedAt = Date.now();
        let lastRev = -1;
        let lastPush = 0;
        /** Deadline from the last state we sent, so we can force a re-read. */
        let knownDeadline: number | null = null;

        request.signal.addEventListener("abort", () => {
          closed = true;
        });

        // Advise the client how long to wait before reconnecting.
        enqueue("retry: 1000\n\n");

        while (!closed && Date.now() - startedAt < STREAM_LIFETIME_MS) {
          try {
            const now = Date.now();
            const rev = await peekRev(code);
            if (rev === null) {
              send("gone", { error: "This room no longer exists." });
              break;
            }

            const deadlinePassed = knownDeadline !== null && now >= knownDeadline;
            const needsFullRead =
              rev !== lastRev || deadlinePassed || now - lastPush > HEARTBEAT_MS;

            if (needsFullRead) {
              // `readRoom` also enforces timers, so an expired phase advances
              // even when nobody is interacting.
              const state = await readRoom(code);
              lastRev = state.rev;
              lastPush = now;
              knownDeadline = state.deadline;
              send("state", projectForPlayer(state, playerId, now));
            } else {
              enqueue(": ping\n\n");
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
