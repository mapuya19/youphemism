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

/**
 * Key namespace, derived from the deployment environment.
 *
 * The Vercel Redis integration attaches one database to every environment you
 * tick, so Production and Preview share storage. Namespacing keeps them apart:
 * a preview deployment running modified game logic can then never read or
 * overwrite a live room whose stored shape it no longer understands. Room codes
 * are also free to collide across environments.
 */
const NAMESPACE = (() => {
  const env = process.env.VERCEL_ENV; // "production" | "preview" | "development"
  if (!env || env === "production") return "youphemism";
  return `youphemism:${env}`;
})();

const key = (code: string) => `${NAMESPACE}:room:${code}`;
/**
 * A tiny companion key holding only the revision number. Stream subscribers
 * poll this instead of re-reading the whole room, which cuts streaming
 * bandwidth by orders of magnitude (a few bytes per poll instead of ~20KB).
 */
const revKey = (code: string) => `${NAMESPACE}:rev:${code}`;

/** Exposed for diagnostics and tests. */
export const keyNamespace = () => NAMESPACE;

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

/**
 * Locate Redis credentials. Vercel's Upstash integration injects
 * `KV_REST_API_URL` / `KV_REST_API_TOKEN`; a direct Upstash setup uses
 * `UPSTASH_REDIS_REST_*`. Connecting an integration with a custom prefix
 * produces e.g. `STORAGE_KV_REST_API_URL`, so we also scan for suffix matches
 * rather than silently degrading to the in-memory store.
 */
export function resolveCredentials(): {
  url?: string;
  token?: string;
  source: string | null;
} {
  const env = process.env;
  const pairs: [string, string][] = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];

  for (const [urlKey, tokenKey] of pairs) {
    if (env[urlKey] && env[tokenKey]) {
      return { url: env[urlKey], token: env[tokenKey], source: urlKey };
    }
  }

  // Prefixed variants, e.g. STORAGE_KV_REST_API_URL / STORAGE_KV_REST_API_TOKEN.
  for (const urlKey of Object.keys(env)) {
    if (!urlKey.endsWith("KV_REST_API_URL") && !urlKey.endsWith("REDIS_REST_URL")) {
      continue;
    }
    const tokenKey = urlKey.replace(/URL$/, "TOKEN");
    if (env[urlKey] && env[tokenKey]) {
      return { url: env[urlKey], token: env[tokenKey], source: urlKey };
    }
  }

  return { source: null };
}

export function getStore(): RoomStore {
  if (cached) return cached;
  const { url, token } = resolveCredentials();
  cached = url && token ? redisStore(new Redis({ url, token })) : memoryStore();
  return cached;
}

export const isPersistent = () => resolveCredentials().source !== null;

/** True when we're running on Vercel, where the in-memory store cannot work. */
export const requiresPersistence = () =>
  Boolean(process.env.VERCEL) && process.env.NODE_ENV === "production";

/**
 * Prove connectivity end to end: write a probe key, read it back, delete it.
 * Used by `/api/health` so a misconfiguration is one request away from being
 * diagnosed rather than showing up as a mysterious "room not found".
 */
export async function probe(): Promise<{ ok: boolean; error?: string }> {
  const { url, token } = resolveCredentials();
  if (!url || !token) return { ok: false, error: "No Redis credentials found." };
  try {
    const redis = new Redis({ url, token });
    const probeKey = `${NAMESPACE}:probe:${Math.random().toString(36).slice(2)}`;
    const stamp = String(Date.now());
    await redis.set(probeKey, stamp, { ex: 30 });
    const readBack = await redis.get<string | number>(probeKey);
    await redis.del(probeKey);
    if (String(readBack) !== stamp) {
      return { ok: false, error: "Probe key did not read back correctly." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
