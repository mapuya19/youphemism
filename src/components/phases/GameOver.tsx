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
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? "Someone";

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
        {winners.length > 1 && (
          <p className="mt-2 text-sm text-paper/50">
            The rulebook says settle this with a dance battle. We can&apos;t help
            you there.
          </p>
        )}
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
              index === 0 && top > 0 && "border-lime/60 bg-lime/[0.08]",
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

      <section>
        <h3 className="font-display text-2xl font-bold">The Slangbook</h3>
        <p className="mt-1 text-sm text-paper/50">
          Everything this table invented tonight. Screenshot it.
        </p>
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {view.slangbook.map((card) => (
            <li key={card.id} className="surface flex flex-col gap-1.5 p-4">
              <p className="font-display text-lg font-bold text-sky">{card.term}</p>
              <p className="text-xs text-paper/35">as {card.category}</p>
              <p className="text-sm leading-relaxed text-paper/75">{card.definition}</p>
              <p className="mt-auto pt-2 text-xs text-paper/35">
                coined by {nameOf(card.authorId)} · turn {card.turn}
              </p>
            </li>
          ))}
        </ul>
      </section>

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
