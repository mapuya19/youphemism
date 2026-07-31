"use client";

import { motion } from "framer-motion";
import { Avatar, WaitingFor } from "@/components/ui";
import { cn } from "@/lib/ui";
import { CategoryBanner } from "./CategoryPhase";
import type { PhaseProps } from "./types";

/**
 * Round 1 — Judging. Pitches are shown anonymously; only the judge can pick.
 * (Anonymity is an online adaptation: there's no table to read, so hiding
 * authorship keeps the judge honest.)
 */
export function JudgingPhase({ view, send }: PhaseProps) {
  const judge = view.players.find((p) => p.id === view.judgeId);
  const canPick = view.you.isJudge;

  return (
    <div className="flex flex-col gap-6">
      <CategoryBanner view={view} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-black">
            {canPick ? "Pick your favourite" : `${judge?.name ?? "The judge"} is deciding`}
          </h2>
          <p className="mt-1 text-paper/55">
            {canPick
              ? "One winner takes the category card — that's a point."
              : "Read along. Every card played is saved for round 2."}
          </p>
        </div>
        {!canPick && judge && (
          <WaitingFor players={[judge]} />
        )}
      </header>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {view.pitchBoard.map((pitch, index) => {
          const mine = pitch.id === view.you.pitch?.id;
          return (
            <motion.li
              key={pitch.id}
              initial={{ opacity: 0, y: 14, rotate: index % 2 ? 1 : -1 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: index * 0.07 }}
            >
              <button
                disabled={!canPick}
                onClick={() =>
                  void send({ type: "judge_pick", pitchId: pitch.id }).catch(() => {})
                }
                className={cn(
                  "surface flex h-full w-full flex-col gap-3 p-5 text-left transition",
                  canPick ? "hover:border-lime/60 hover:bg-lime/[0.08]" : "cursor-default",
                  mine && "border-sky/40",
                )}
              >
                <span className="label">{mine ? "Yours" : `Pitch ${index + 1}`}</span>
                <p className="font-display text-xl leading-snug font-bold">
                  <span className="text-sky">{pitch.term}</span>{" "}
                  <span className="text-paper/70">is {view.category?.text}</span>
                </p>
                <p className="text-sm leading-relaxed text-paper/80">{pitch.definition}</p>
                {canPick && (
                  <span className="mt-auto text-xs font-semibold text-lime">
                    Tap to crown →
                  </span>
                )}
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** Round 1 — the winner is revealed, then the judge rotates. */
export function CategoryResult({ view, send, secondsLeft }: PhaseProps) {
  const winner = view.pitchBoard.find((p) => p.won);
  const winningPlayer = view.players.find((p) => p.id === winner?.authorId);
  const lastTurn = view.turn >= view.totalTurns;

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="surface flex flex-col items-center gap-3 p-8 text-center"
      >
        <span className="label text-tangerine">{view.category?.text}</span>
        {winner ? (
          <>
            <span className="text-4xl" aria-hidden>
              🏆
            </span>
            <h2 className="font-display text-3xl font-black">
              {winningPlayer?.name ?? "Someone"} wins the card
            </h2>
            <p className="max-w-xl text-lg leading-snug">
              <span className="font-display text-sky">{winner.term}</span> —{" "}
              {winner.definition}
            </p>
          </>
        ) : (
          <h2 className="font-display text-2xl font-black">No winner this turn</h2>
        )}
      </motion.div>

      <div className="flex flex-wrap items-center gap-3">
        {secondsLeft !== null && secondsLeft !== undefined && (
          <span className="chip tabular-nums">Next up in {secondsLeft}s</span>
        )}
        {view.you.isHost && (
          <button
            className="btn-primary"
            onClick={() => void send({ type: "advance" }).catch(() => {})}
          >
            {lastTurn ? "Start round 2" : "Next judge"}
          </button>
        )}
      </div>

      <div>
        <p className="label mb-3">Everything played this turn is saved for round 2</p>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {view.pitchBoard.map((pitch) => {
            const author = view.players.find((p) => p.id === pitch.authorId);
            return (
              <li
                key={pitch.id}
                className={cn(
                  "surface flex flex-col gap-2 p-4",
                  pitch.won && "border-lime/60 bg-lime/[0.08]",
                )}
              >
                <div className="flex items-center gap-2">
                  {author && <Avatar index={author.avatar} name={author.name} size={24} />}
                  <span className="text-sm font-semibold">{author?.name ?? "Someone"}</span>
                  {pitch.won && <span aria-label="winner">🏆</span>}
                </div>
                <p className="font-display text-lg font-bold text-sky">{pitch.term}</p>
                <p className="text-sm leading-relaxed text-paper/70">{pitch.definition}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
