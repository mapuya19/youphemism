"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

export function GameOver({ view, send }: PhaseProps) {
  const standings = [...view.players].sort((a, b) => b.score - a.score);
  const top = standings[0]?.score ?? 0;
  const winners = standings.filter((p) => p.score === top && top > 0);

  const bestSlang = [...view.slangBoard].sort(
    (a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0),
  )[0];
  const bestStory = [...view.storyBoard].sort(
    (a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0),
  )[0];
  const nameOf = (id: string | null) =>
    view.players.find((p) => p.id === id)?.name ?? "Someone";

  return (
    <div className="flex flex-col gap-6">
      <header className="surface p-8 text-center">
        <p className="label">Final scores</p>
        <h2 className="mt-2 font-display text-4xl font-black md:text-5xl">
          {winners.length === 0
            ? "Nobody scored. Impressive."
            : winners.length === 1
              ? `${winners[0]!.name} wins!`
              : `Tie: ${winners.map((w) => w.name).join(" & ")}`}
        </h2>
      </header>

      <ol className="flex flex-col gap-2">
        {standings.map((player, index) => (
          <motion.li
            key={player.id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
            className={cn(
              "surface flex items-center gap-4 px-5 py-3.5",
              index === 0 && "border-lime/60 bg-lime/[0.08]",
            )}
          >
            <span className="font-display w-6 text-lg text-paper/40 tabular-nums">
              {index + 1}
            </span>
            <Avatar index={player.avatar} name={player.name} />
            <span className="flex-1 truncate font-semibold">
              {player.name}
              {player.id === view.you.id && <span className="text-paper/40"> (you)</span>}
            </span>
            <span className="font-display text-2xl tabular-nums">{player.score}</span>
          </motion.li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        {bestSlang && (
          <article className="surface p-6">
            <span className="label text-lime">Slang of the game</span>
            <h3 className="mt-2 font-display text-2xl font-black">{bestSlang.term}</h3>
            <p className="mt-2 text-sm leading-relaxed text-paper/70">
              {bestSlang.definition}
            </p>
            <p className="mt-3 text-xs text-paper/40">
              by {nameOf(bestSlang.authorId)} · {bestSlang.voteCount ?? 0} votes
            </p>
          </article>
        )}
        {bestStory && (
          <article className="surface p-6">
            <span className="label text-sky">Story of the game</span>
            <h3 className="mt-2 font-display text-lg font-bold text-paper/80">
              {bestStory.prompt}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-paper/70">
              {bestStory.text}
            </p>
            <p className="mt-3 text-xs text-paper/40">
              by {nameOf(bestStory.authorId)} · {bestStory.voteCount ?? 0} votes
            </p>
          </article>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {view.you.isHost ? (
          <button
            className="btn-primary"
            onClick={() => void send({ type: "restart" }).catch(() => {})}
          >
            Play again (same room)
          </button>
        ) : (
          <span className="chip">Waiting for the host to restart…</span>
        )}
        <Link href="/" className="btn-ghost">
          Leave room
        </Link>
      </div>
    </div>
  );
}
