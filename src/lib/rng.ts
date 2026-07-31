/**
 * Deterministic PRNG (mulberry32) so game state transitions are reproducible
 * and unit-testable. The seed lives in `GameState.seed` and advances with use.
 */

export interface Rng {
  next(): number;
  seed: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const out = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      this.seed = s;
      return out;
    },
    seed: s,
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 5-character, human-readable, unambiguous room code. */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length] as string,
  ).join("");
}

export function generateId(size = 12): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, size);
}
