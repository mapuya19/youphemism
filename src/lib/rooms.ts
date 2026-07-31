/**
 * Room service — the only module that combines the pure engine with storage.
 *
 * Reads are "self-healing": every read runs `tick()` so expired phase
 * deadlines advance without any background worker (serverless friendly).
 * Writes use bounded compare-and-set retries so two simultaneous submissions
 * can never clobber each other.
 */

import { RuleError, applyAction, createGame, tick } from "./engine";
import { generateRoomCode, randomSeed } from "./rng";
import { getStore, isPersistent, requiresPersistence } from "./storage";
import { Action, GameState } from "./types";
import { normalizeCode } from "./code";

export { normalizeCode };

const MAX_CAS_ATTEMPTS = 6;

export class NotFoundError extends Error {
  constructor(code: string) {
    super(`Room ${code} doesn't exist (or has expired).`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor() {
    super("The room is busy — try that again.");
    this.name = "ConflictError";
  }
}

/**
 * Raised when deployed without Redis. The in-memory fallback is per-instance, so
 * a room created by one serverless invocation is invisible to the next — which
 * surfaces as a baffling "room not found" immediately after creating a room.
 * Better to say exactly what's wrong.
 */
export class MisconfiguredError extends Error {
  constructor() {
    super(
      "Server storage isn't configured, so rooms can't be shared between " +
        "requests. Connect a Redis database and redeploy — environment variables " +
        "only apply to new builds.",
    );
    this.name = "MisconfiguredError";
  }
}

function assertStorageUsable() {
  if (requiresPersistence() && !isPersistent()) throw new MisconfiguredError();
}

export async function createRoom(): Promise<GameState> {
  assertStorageUsable();
  const store = getStore();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    if (await store.get(code)) continue;
    const state = createGame(code, randomSeed(), Date.now());
    if (await store.compareAndSet(state, -1)) return state;
  }
  throw new Error("Couldn't allocate a room code. Please retry.");
}

/** Read a room, applying (and persisting) any pending timer transitions. */
export async function readRoom(code: string): Promise<GameState> {
  const store = getStore();
  const state = await store.get(code);
  if (!state) throw new NotFoundError(code);

  const before = state.rev;
  if (tick(state, Date.now())) {
    // Best-effort persist; if another writer won, their state is newer anyway.
    const ok = await store.compareAndSet(state, before);
    if (!ok) {
      const fresh = await store.get(code);
      if (fresh) return fresh;
    }
  }
  return state;
}

/**
 * Cheap change probe for the SSE loop: the room's current revision, without
 * transferring the whole room. Returns null if the room is gone.
 */
export async function peekRev(code: string): Promise<number | null> {
  return getStore().getRev(code);
}

/**
 * Apply an action atomically. `mutate` re-reads and replays on CAS failure,
 * which is safe because `applyAction` is a pure function of (state, action).
 */
export async function mutateRoom(
  code: string,
  playerId: string,
  action: Action,
): Promise<GameState> {
  const store = getStore();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const state = await store.get(code);
    if (!state) throw new NotFoundError(code);
    const expectedRev = state.rev;

    const now = Date.now();
    tick(state, now);
    const next = applyAction(state, playerId, action, now);

    if (await store.compareAndSet(next, expectedRev)) {
      // An empty lobby is unreachable — nobody holds its code and nobody can
      // rejoin it meaningfully. Reclaim it now rather than waiting out the TTL.
      if (next.players.length === 0) {
        await store.delete(code).catch(() => {});
      }
      return next;
    }
    lastError = new ConflictError();
    // Small jittered backoff to break up simultaneous retries.
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }

  throw lastError instanceof Error ? lastError : new ConflictError();
}

export { RuleError };
