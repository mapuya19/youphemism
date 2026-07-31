import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Storage keys must be namespaced per deployment environment. The Vercel Redis
 * integration attaches one database to Production and Preview alike, so without
 * this a preview deployment could overwrite a live game's state.
 */
async function namespaceFor(vercelEnv: string | undefined): Promise<string> {
  vi.resetModules();
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  const mod = await import("@/lib/storage");
  return mod.keyNamespace();
}

afterEach(() => {
  delete process.env.VERCEL_ENV;
  vi.resetModules();
});

describe("storage key namespacing", () => {
  it("uses the bare namespace in production", async () => {
    expect(await namespaceFor("production")).toBe("youphemism");
  });

  it("isolates preview deployments from production", async () => {
    const preview = await namespaceFor("preview");
    const production = await namespaceFor("production");
    expect(preview).toBe("youphemism:preview");
    expect(preview).not.toBe(production);
  });

  it("isolates the development environment too", async () => {
    expect(await namespaceFor("development")).toBe("youphemism:development");
  });

  it("falls back to the production namespace when unset (e.g. self-hosted)", async () => {
    expect(await namespaceFor(undefined)).toBe("youphemism");
  });
});

describe("in-memory fallback", () => {
  it("is selected when no Redis credentials are present", async () => {
    vi.resetModules();
    const saved = {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
      upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { getStore, isPersistent } = await import("@/lib/storage");
    expect(isPersistent()).toBe(false);

    // Round-trips through the fallback with working compare-and-set semantics.
    const store = getStore();
    const state = { code: "MEMTEST", rev: 0 } as never;
    expect(await store.compareAndSet(state, -1)).toBe(true);
    expect(await store.getRev("MEMTEST")).toBe(0);
    expect(await store.compareAndSet(state, -1)).toBe(false);
    await store.delete("MEMTEST");
    expect(await store.getRev("MEMTEST")).toBeNull();

    Object.assign(process.env, {
      ...(saved.url ? { KV_REST_API_URL: saved.url } : {}),
      ...(saved.token ? { KV_REST_API_TOKEN: saved.token } : {}),
      ...(saved.upstashUrl ? { UPSTASH_REDIS_REST_URL: saved.upstashUrl } : {}),
      ...(saved.upstashToken ? { UPSTASH_REDIS_REST_TOKEN: saved.upstashToken } : {}),
    });
  });
});
