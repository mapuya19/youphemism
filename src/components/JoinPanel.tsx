"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AVATARS, avatarOf, cn } from "@/lib/ui";
import { MAX_NAME_LENGTH } from "@/lib/types";
import {
  createRoomRequest,
  loadProfile,
  saveProfile,
} from "@/lib/client/useRoom";
import { normalizeCode } from "@/lib/code";

/** Create-or-join card on the landing page. */
export function JoinPanel() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const profile = loadProfile();
    if (profile) {
      setName(profile.name);
      setAvatar(profile.avatar);
    } else {
      setAvatar(Math.floor(Math.random() * AVATARS.length));
    }
  }, []);

  const persist = () => saveProfile({ name: name.trim(), avatar });

  /** Carry the dev-only `?seat=` switch through to the room URL. */
  const roomHref = (roomCode: string) => {
    if (typeof window === "undefined") return `/room/${roomCode}`;
    const seat = new URLSearchParams(window.location.search).get("seat");
    return seat ? `/room/${roomCode}?seat=${encodeURIComponent(seat)}` : `/room/${roomCode}`;
  };

  const handleCreate = async () => {
    if (!name.trim()) return setError("Pick a name first.");
    setBusy("create");
    setError(null);
    try {
      persist();
      const roomCode = await createRoomRequest();
      router.push(roomHref(roomCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a room.");
      setBusy(null);
    }
  };

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Pick a name first.");
    const target = normalizeCode(code);
    if (target.length < 4) return setError("Room codes are 5 characters.");
    setBusy("join");
    setError(null);
    persist();
    router.push(roomHref(target));
  };

  return (
    <form onSubmit={handleJoin} className="surface flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="label">
          Your name
        </label>
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {avatarOf(avatar).emoji}
          </span>
          <input
            id="name"
            className="field"
            placeholder="e.g. Bex"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">Pick a look</legend>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((option, index) => (
            <button
              key={option.emoji}
              type="button"
              aria-pressed={avatar === index}
              aria-label={`Avatar ${index + 1}`}
              onClick={() => setAvatar(index)}
              className={cn(
                "grid h-11 w-11 place-items-center rounded-2xl border text-xl transition",
                avatar === index
                  ? "border-lime bg-lime/15 scale-105"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/10",
              )}
            >
              <span aria-hidden>{option.emoji}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={handleCreate}
        disabled={busy !== null}
        className="btn-primary w-full text-base"
      >
        {busy === "create" ? "Opening room…" : "Start a new room"}
      </button>

      <div className="flex items-center gap-3 text-xs text-paper/35">
        <span className="h-px flex-1 bg-white/10" />
        or join one
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="flex gap-2">
        <label htmlFor="code" className="sr-only">
          Room code
        </label>
        <input
          id="code"
          className="field font-display text-center text-xl tracking-[0.3em] uppercase"
          placeholder="CODE"
          value={code}
          maxLength={5}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button type="submit" disabled={busy !== null} className="btn-ghost shrink-0">
          Join
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-bubble">
          {error}
        </p>
      )}
    </form>
  );
}
