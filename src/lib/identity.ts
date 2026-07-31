/**
 * Player identity.
 *
 * The browser generates a high-entropy token once and keeps it in
 * localStorage. The public player id is `sha256(token)` truncated — so ids can
 * be shared with every client (needed to attribute votes and authorship) while
 * remaining impossible to forge. No session table required.
 */

const ID_LENGTH = 20;

export async function derivePlayerId(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(`youphemism:v1:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, ID_LENGTH);
}

export function createToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const TOKEN_HEADER = "x-yph-token";
