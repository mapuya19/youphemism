"use client";

import { Avatar } from "@/components/ui";
import {
  HAND_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  USE_IT_COUNT,
  USE_IT_ROUNDS,
} from "@/lib/types";
import type { PhaseProps } from "./types";

export function Lobby({ view, send }: PhaseProps) {
  const missing = MIN_PLAYERS - view.players.length;
  const enough = missing <= 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="surface p-6 md:p-8">
        <h2 className="font-display text-3xl font-black">Waiting room</h2>
        <p className="mt-2 text-paper/60">
          Share the room code in the header — anyone with the link can hop in.{" "}
          {enough
            ? "You're good to go."
            : `Need ${missing} more player${missing === 1 ? "" : "s"}.`}
        </p>

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {view.players.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              <Avatar index={player.avatar} name={player.name} dim={!player.connected} />
              <span className="flex-1 truncate font-medium">{player.name}</span>
              {player.isHost && <span title="Host">👑</span>}
              {view.you.isHost && player.id !== view.you.id && (
                <button
                  className="rounded-full px-2 text-paper/40 hover:text-bubble"
                  aria-label={`Remove ${player.name}`}
                  onClick={() =>
                    void send({ type: "kick", playerId: player.id }).catch(() => {})
                  }
                >
                  ✕
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, missing) }).map((_, i) => (
            <li
              key={`empty-${i}`}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-3 py-2.5 text-paper/30"
            >
              <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10">
                ?
              </span>
              Empty seat
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            disabled={!view.you.isHost || !enough}
            onClick={() => void send({ type: "start_game" }).catch(() => {})}
          >
            {view.you.isHost ? "Start the game" : "Waiting for the host…"}
          </button>
          <span className="text-xs text-paper/40">
            {view.players.length}/{MAX_PLAYERS} players
          </span>
        </div>
      </div>

      <aside className="surface flex flex-col gap-4 p-6">
        <h3 className="font-display text-xl font-bold">Timers</h3>
        {view.you.isHost ? (
          <>
            <Slider
              label="Round 1 pitching"
              value={view.settings.pitchSeconds}
              min={60}
              max={360}
              step={30}
              onChange={(pitchSeconds) =>
                void send({ type: "update_settings", settings: { pitchSeconds } }).catch(
                  () => {},
                )
              }
            />
            <Slider
              label="Judge decision"
              value={view.settings.judgeSeconds}
              min={30}
              max={300}
              step={15}
              onChange={(judgeSeconds) =>
                void send({ type: "update_settings", settings: { judgeSeconds } }).catch(
                  () => {},
                )
              }
            />
            <Slider
              label="Round 2 story writing"
              value={view.settings.storySeconds}
              min={90}
              max={600}
              step={30}
              onChange={(storySeconds) =>
                void send({ type: "update_settings", settings: { storySeconds } }).catch(
                  () => {},
                )
              }
            />
            <Slider
              label="Round 2 voting"
              value={view.settings.voteSeconds}
              min={30}
              max={300}
              step={15}
              onChange={(voteSeconds) =>
                void send({ type: "update_settings", settings: { voteSeconds } }).catch(
                  () => {},
                )
              }
            />
          </>
        ) : (
          <p className="text-sm text-paper/50">
            The host sets the clocks. Pitching {view.settings.pitchSeconds}s ·
            judging {view.settings.judgeSeconds}s · stories{" "}
            {view.settings.storySeconds}s · voting {view.settings.voteSeconds}s
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 rounded-2xl bg-black/25 p-4 text-xs leading-relaxed text-paper/55">
          <p>
            <strong className="text-paper/85">Round 1 · Category.</strong> You
            hold {HAND_SIZE} Youphemism cards. The judge reveals a category;
            everyone else plays a card and invents slang that fits. The judge
            picks a winner — that&apos;s a point. Everyone judges once.
          </p>
          <p>
            <strong className="text-paper/85">Round 2 · Use It!</strong> Every
            card played gets dealt back out, meanings intact. Pair one with one of{" "}
            {USE_IT_COUNT} prompts and tell a story. The vote winner scores, and
            so does whoever coined the slang. Played {USE_IT_ROUNDS} times.
          </p>
          <p className="text-paper/40">Most points wins.</p>
        </div>
      </aside>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="font-display tabular-nums text-paper/70">{value}s</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-lime"
      />
    </label>
  );
}
