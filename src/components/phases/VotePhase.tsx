"use client";

import { motion } from "framer-motion";
import { WaitingFor } from "@/components/ui";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

/**
 * Shared anonymous voting screen for both rounds. Entries are ordered by id,
 * never by author, and your own entry is visible but not selectable.
 */
export function VotePhase({ view, send }: PhaseProps) {
  const isCoin = view.phase === "coin_vote";
  const myEntryId = isCoin ? view.you.slang?.id : view.you.story?.id;
  const selected = view.you.votedFor;
  const pending = view.players.filter((p) => p.connected && !p.hasVoted);

  const entries = isCoin
    ? view.slangBoard.map((entry) => ({
        id: entry.id,
        heading: entry.term,
        sub: `redefines “${entry.phrase}” as ${entry.category}`,
        body: entry.definition,
      }))
    : view.storyBoard.map((story) => ({
        id: story.id,
        heading: story.prompt,
        sub: story.slang.map((s) => s.term).join(" · "),
        body: story.text,
      }));

  const vote = (id: string) => {
    if (id === myEntryId) return;
    void send(selected === id ? { type: "unvote" } : { type: "vote", targetId: id }).catch(
      () => {},
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-black">
            {isCoin ? "Vote for the best slang" : "Vote for the best story"}
          </h2>
          <p className="mt-1 text-paper/55">
            Everything&apos;s anonymous. One vote each — you can change it until
            the timer stops.
          </p>
        </div>
        <WaitingFor players={pending} />
      </header>

      <ul className={cn("grid gap-4", isCoin ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2")}>
        {entries.map((entry, index) => {
          const mine = entry.id === myEntryId;
          const chosen = selected === entry.id;
          return (
            <motion.li
              key={entry.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <button
                onClick={() => vote(entry.id)}
                disabled={mine}
                aria-pressed={chosen}
                className={cn(
                  "surface flex h-full w-full flex-col gap-2 p-5 text-left transition",
                  chosen && "border-lime/70 bg-lime/10 ring-2 ring-lime/30",
                  mine ? "cursor-default opacity-60" : "hover:bg-white/[0.07]",
                )}
              >
                <span className="label">
                  {mine ? "Yours" : chosen ? "Your vote ✓" : `Entry ${index + 1}`}
                </span>
                <h3
                  className={cn(
                    "font-display font-bold leading-snug",
                    isCoin ? "text-2xl" : "text-lg text-paper/80",
                  )}
                >
                  {entry.heading}
                </h3>
                <p className="text-xs text-paper/40">{entry.sub}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-paper/80">
                  {entry.body}
                </p>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
