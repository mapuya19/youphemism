"use client";

import { motion } from "framer-motion";
import { avatarOf, cn, formatClock } from "@/lib/ui";
import type { PublicPlayer } from "@/lib/types";

export function Avatar({
  index,
  name,
  size = 40,
  dim,
}: {
  index: number;
  name?: string;
  size?: number;
  dim?: boolean;
}) {
  const avatar = avatarOf(index);
  return (
    <span
      aria-label={name}
      title={name}
      className={cn(
        "inline-grid place-items-center rounded-2xl border border-white/20 transition",
        dim && "opacity-40 saturate-0",
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `linear-gradient(140deg, ${avatar.color}44, ${avatar.color}18)`,
      }}
    >
      <span aria-hidden>{avatar.emoji}</span>
    </span>
  );
}

export function Timer({
  secondsLeft,
  total,
}: {
  secondsLeft: number | null;
  total?: number;
}) {
  if (secondsLeft === null) return null;
  const urgent = secondsLeft <= 15;
  const pct = total ? Math.max(0, Math.min(1, secondsLeft / total)) : null;
  return (
    <div className="flex items-center gap-3">
      {pct !== null && (
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              urgent ? "bg-bubble" : "bg-lime",
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
      <span
        role="timer"
        aria-live="off"
        className={cn(
          "font-display text-lg tabular-nums",
          urgent ? "text-bubble" : "text-paper/80",
        )}
      >
        {formatClock(secondsLeft)}
      </span>
    </div>
  );
}

export function PlayerRail({
  players,
  showReady,
  showVoted,
  youId,
}: {
  players: PublicPlayer[];
  showReady?: boolean;
  showVoted?: boolean;
  youId: string;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return (
    <ul className="flex flex-wrap gap-2">
      {sorted.map((player) => {
        const done = (showReady && player.ready) || (showVoted && player.hasVoted);
        return (
          <li key={player.id}>
            <motion.div
              layout
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-sm",
                done
                  ? "border-lime/60 bg-lime/10"
                  : "border-white/10 bg-white/[0.04]",
                !player.connected && "opacity-45",
              )}
            >
              <Avatar index={player.avatar} name={player.name} size={26} dim={!player.connected} />
              <span className="max-w-28 truncate font-medium">
                {player.name}
                {player.id === youId && <span className="text-paper/40"> (you)</span>}
              </span>
              {player.isHost && <span title="Host" aria-label="Host">👑</span>}
              <span className="font-display tabular-nums text-paper/60">{player.score}</span>
              {done && <span aria-hidden className="text-lime">✓</span>}
            </motion.div>
          </li>
        );
      })}
    </ul>
  );
}

export function Toast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-6 z-50 mx-auto w-[min(92vw,32rem)] animate-pop"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-bubble/40 bg-bubble/15 px-4 py-3 backdrop-blur-xl">
        <span aria-hidden>⚠️</span>
        <p className="flex-1 text-sm">{message}</p>
        <button
          onClick={onDismiss}
          className="rounded-full px-2 text-paper/60 hover:text-paper"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function CharCount({ value, max }: { value: string; max: number }) {
  const remaining = max - value.length;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        remaining < 25 ? "text-bubble" : "text-paper/40",
      )}
    >
      {value.length}/{max}
    </span>
  );
}

export function WaitingFor({ players }: { players: PublicPlayer[] }) {
  if (players.length === 0) return null;
  return (
    <p className="text-sm text-paper/50">
      Waiting on{" "}
      <span className="text-paper/80">{players.map((p) => p.name).join(", ")}</span>
      …
    </p>
  );
}
