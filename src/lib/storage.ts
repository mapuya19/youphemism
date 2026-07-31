/**
 * Room persistence.
 *
 * Production uses Upstash Redis (available as a one-click Vercel Marketplace
 * integration) with optimistic concurrency: writes only land if the stored
 * revision still matches the one we read. That keeps the game engine
 * authoritative even though every request runs in a separate, stateless
 * serverless invocation.
 *
 * With no Redis credentials configured we fall back to a process-local map so
 * `npm run dev` works out of the box (single instance only).
 */

import { Redis } from "@upstash/redis";
import { GameState } from "./types";

const ROOM_TTL_SECONDS = 60 * 60 * 6;
const key = (code: string) => `youphemism:room:${code}`;
/**
 * A tiny companion key holding only the revision number. Stream subscribers
 * poll this instead of re-reading the whole room, which cuts streaming
 * bandwidth by orders of magnitude (a few bytes per poll instead of ~20KB).
 */
const revKey = (code: string) => `youphemism:rev:${code}`;

/** CAS write: only overwrite if the persisted `rev` equals `expectedRev`. */
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  local rev = string.match(current, '"rev":(%-?%d+)')
  if rev ~= ARGV[2] then return 0 end
elseif ARGV[2] ~= '-1' then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[3])
return 1
`;

export interface RoomStore {
  get(code: string): Promise<GameState | null>;
  /**
   * Cheap liveness probe: the room's current revision, or null if it's gone.
   * Reads a handful of bytes rather than the entire room.
   */
  getRev(code: string): Promise<number | null>;
  /** Returns false when the compare-and-set failed (someone else wrote first). */
  compareAndSet(state: GameState, expectedRev: number): Promise<boolean>;
  delete(code: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Upstash Redis                                                       */
/* ------------------------------------------------------------------ */

function redisStore(redis: Redis): RoomStore {
  return {
    async get(code) {
      const raw = await redis.get<string | GameState>(key(code));
      if (!raw) return null;
      return typeof raw === "string" ? (JSON.parse(raw) as GameState) : raw;
    },
    async getRev(code) {
      const raw = await redis.get<string | number>(revKey(code));
      if (raw === null || raw === undefined) return null;
      const rev = Number(raw);
      return Number.isFinite(rev) ? rev : null;
    },
    async compareAndSet(state, expectedRev) {
      const result = await redis.eval(
        CAS_SCRIPT,
        [key(state.code), revKey(state.code)],
        [
          JSON.stringify(state),
          String(expectedRev),
          String(ROOM_TTL_SECONDS),
          String(state.rev),
        ],
      );
      return Number(result) === 1;
    },
    async delete(code) {
      await redis.del(key(code), revKey(code));
    },
  };
}

/* ------------------------------------------------------------------ */
/* In-memory dev fallback                                              */
/* ------------------------------------------------------------------ */

const globalForMemory = globalThis as unknown as {
  __youphemismRooms?: Map<string, { json: string; expiresAt: number }>;
};

function memoryStore(): RoomStore {
  const rooms = (globalForMemory.__youphemismRooms ??= new Map());
  const read = (code: string) => {
    const hit = rooms.get(code);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      rooms.delete(code);
      return null;
    }
    return JSON.parse(hit.json) as GameState;
  };
  return {
    async get(code) {
      return read(code);
    },
    async getRev(code) {
      return read(code)?.rev ?? null;
    },
    async compareAndSet(state, expectedRev) {
      const current = read(state.code);
      const currentRev = current ? current.rev : -1;
      if (currentRev !== expectedRev) return false;
      rooms.set(state.code, {
        json: JSON.stringify(state),
        expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000,
      });
      return true;
    },
    async delete(code) {
      rooms.delete(code);
    },
  };
}

/* ------------------------------------------------------------------ */

let cached: RoomStore | null = null;

export function getStore(): RoomStore {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(new Redis({ url, token })) : memoryStore();
  return cached;
}

export const isPersistent = () =>
  Boolean(
    (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN),
  );
