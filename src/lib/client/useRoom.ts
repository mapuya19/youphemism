"use client";

/**
 * Client-side room transport.
 *
 * - Identity: a token in localStorage, sent as a header (never in the URL).
 * - Realtime: SSE consumed via `fetch` (so we can send headers) with
 *   exponential-backoff reconnect and automatic resubscription.
 * - Presence: a heartbeat action every 8s keeps the player marked connected.
 * - Optimistic reads: action responses return the fresh projected view, so the
 *   UI never waits a full poll interval after you click something.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { TOKEN_HEADER, createToken, derivePlayerId } from "@/lib/identity";
import type { Action, ClientView } from "@/lib/types";

const TOKEN_KEY = "youphemism:token";
const PROFILE_KEY = "youphemism:profile";
const HEARTBEAT_MS = 8_000;

export interface Profile {
  name: string;
  avatar: number;
}

export function getToken(): string {
  if (typeof window === "undefined") return "";
  let token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = createToken();
    window.localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Profile;
    if (typeof parsed.name !== "string") return null;
    return { name: parsed.name, avatar: Number(parsed.avatar) || 0 };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function myPlayerId(): Promise<string> {
  return derivePlayerId(getToken());
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      [TOKEN_HEADER]: getToken(),
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as
    | T
    | { error?: string };
  if (!response.ok) {
    const message =
      (payload as { error?: string }).error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function createRoomRequest(): Promise<string> {
  const { code } = await request<{ code: string }>("/api/rooms", { method: "POST" });
  return code;
}

export type ConnectionStatus = "connecting" | "live" | "retrying" | "gone";

export interface UseRoomResult {
  view: ClientView | null;
  status: ConnectionStatus;
  error: string | null;
  /** Server-time-corrected seconds left in the current phase, or null. */
  secondsLeft: number | null;
  send: (action: Action) => Promise<void>;
  clearError: () => void;
}

export function useRoom(code: string): UseRoomResult {
  const [view, setView] = useState<ClientView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const revRef = useRef(-1);
  const clockOffsetRef = useRef(0);
  const deadlineRef = useRef<number | null>(null);

  const accept = useCallback((next: ClientView) => {
    // Ignore stale frames that arrive out of order.
    if (next.rev < revRef.current) return;
    revRef.current = next.rev;
    clockOffsetRef.current = next.serverNow - Date.now();
    deadlineRef.current = next.deadline;
    setView(next);
  }, []);

  const send = useCallback(
    async (action: Action) => {
      try {
        const next = await request<ClientView>(
          `/api/rooms/${encodeURIComponent(code)}/action`,
          { method: "POST", body: JSON.stringify(action) },
        );
        accept(next);
        if (action.type !== "heartbeat") setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        if (action.type !== "heartbeat") setError(message);
        throw err;
      }
    },
    [code, accept],
  );

  /* ---------------- SSE subscription with backoff ---------------- */
  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    let cancelled = false;
    let attempt = 0;

    const consume = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(
            `/api/rooms/${encodeURIComponent(code)}/stream`,
            {
              headers: { [TOKEN_HEADER]: getToken(), accept: "text/event-stream" },
              signal: controller.signal,
              cache: "no-store",
            },
          );

          if (response.status === 404) {
            setStatus("gone");
            setError("That room doesn't exist any more.");
            return;
          }
          if (!response.ok || !response.body) throw new Error("stream failed");

          attempt = 0;
          setStatus("live");

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const chunk = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              boundary = buffer.indexOf("\n\n");

              const eventLine = chunk
                .split("\n")
                .find((l) => l.startsWith("event:"));
              const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
              if (!eventLine || !dataLine) continue;
              const event = eventLine.slice(6).trim();
              const data = JSON.parse(dataLine.slice(5).trim());

              if (event === "state") accept(data as ClientView);
              if (event === "gone") {
                setStatus("gone");
                setError("That room no longer exists.");
                return;
              }
            }
          }
        } catch {
          if (cancelled) return;
          setStatus("retrying");
        }
        if (cancelled) return;
        // Jittered backoff, capped at 5s.
        const delay = Math.min(5000, 300 * 2 ** attempt++) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, delay));
      }
    };

    void consume();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [code, accept]);

  /* ---------------- Heartbeat ---------------- */
  useEffect(() => {
    if (!view?.you.id) return;
    const id = setInterval(() => {
      void send({ type: "heartbeat" }).catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [view?.you.id, send]);

  /* ---------------- Countdown (drift corrected) ---------------- */
  useEffect(() => {
    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) {
        setSecondsLeft(null);
        return;
      }
      const serverNow = Date.now() + clockOffsetRef.current;
      setSecondsLeft(Math.max(0, Math.round((deadline - serverNow) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [view?.deadline, view?.phase]);

  return {
    view,
    status,
    error,
    secondsLeft,
    send,
    clearError: () => setError(null),
  };
}
