import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const AVATARS = [
  { emoji: "🦩", color: "#ff5fa2" },
  { emoji: "🐸", color: "#b8ff4b" },
  { emoji: "🦝", color: "#4bd7ff" },
  { emoji: "🐙", color: "#ff8a3d" },
  { emoji: "🦄", color: "#c9a6ff" },
  { emoji: "🐝", color: "#ffd93d" },
  { emoji: "🦖", color: "#4bffa5" },
  { emoji: "🫠", color: "#ff6b6b" },
  { emoji: "👻", color: "#e9e4ff" },
  { emoji: "🐌", color: "#a3e635" },
] as const;

export function avatarOf(index: number) {
  return AVATARS[((index % AVATARS.length) + AVATARS.length) % AVATARS.length]!;
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const PHASE_LABEL: Record<string, string> = {
  lobby: "Lobby",
  category: "Round 1 · Category",
  judging: "Round 1 · Judging",
  category_result: "Round 1 · Winner",
  useit: "Round 2 · Use It!",
  useit_vote: "Round 2 · Vote",
  useit_result: "Round 2 · Results",
  game_over: "Final scores",
};
