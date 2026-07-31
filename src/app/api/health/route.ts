import { NextResponse } from "next/server";
import { isPersistent, keyNamespace, probe, requiresPersistence } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health — deployment diagnostic.
 *
 * Answers the only question that matters after deploying: is durable storage
 * actually wired up? Without it, rooms are created in one serverless instance
 * and invisible to the next, which looks like "room not found" immediately after
 * creating a room.
 *
 * Reports which environment variable supplied the credentials and whether a
 * real write/read/delete round-trip succeeds. Never returns secret values.
 */
export async function GET() {
  const persistent = isPersistent();
  const required = requiresPersistence();
  const result = persistent ? await probe() : { ok: false, error: "No credentials." };

  const healthy = persistent && result.ok;

  return NextResponse.json(
    {
      ok: healthy || !required,
      storage: {
        persistent,
        required,
        roundTrip: result.ok,
        ...(result.error ? { error: result.error } : {}),
        namespace: keyNamespace(),
        // Names only — never values.
        credentialSource: credentialSource(),
      },
      environment: {
        vercelEnv: process.env.VERCEL_ENV ?? null,
        nodeEnv: process.env.NODE_ENV,
        region: process.env.VERCEL_REGION ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
      ...(healthy
        ? {}
        : {
            hint: persistent
              ? "Credentials found but the round-trip failed — check the database is running and the token is current."
              : "No Redis credentials in this build. Connect a database, then REDEPLOY: environment variables only apply to new builds.",
          }),
    },
    {
      status: healthy || !required ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}

/** Which env var names are present, without exposing their values. */
function credentialSource() {
  const candidates = Object.keys(process.env).filter(
    (name) =>
      name.endsWith("KV_REST_API_URL") ||
      name.endsWith("REDIS_REST_URL") ||
      name.endsWith("KV_REST_API_TOKEN") ||
      name.endsWith("REDIS_REST_TOKEN"),
  );
  return candidates.sort();
}
