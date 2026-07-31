import { NextResponse } from "next/server";
import { MisconfiguredError, NotFoundError, RuleError } from "@/lib/rooms";
import { TOKEN_HEADER, derivePlayerId } from "@/lib/identity";

export const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

/** Map domain errors onto HTTP status codes in one place. */
export function toResponse(error: unknown) {
  if (error instanceof RuleError) return jsonError(error.message, 409);
  if (error instanceof NotFoundError) return jsonError(error.message, 404);
  if (error instanceof MisconfiguredError) {
    console.error("[youphemism] storage misconfigured", error.message);
    return jsonError(error.message, 503);
  }
  console.error("[youphemism] unhandled error", error);
  return jsonError("Something went wrong on our end.", 500);
}

/**
 * Resolve the caller's player id from their bearer token. Returns null when the
 * token is missing or malformed.
 */
export async function playerIdFromRequest(request: Request): Promise<string | null> {
  const token = request.headers.get(TOKEN_HEADER);
  if (!token || token.length < 16 || token.length > 128) return null;
  return derivePlayerId(token);
}
