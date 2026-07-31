"use client";

import { motion } from "framer-motion";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

/** Results beat for either round: reveal authors, tallies and score deltas. */
export function ResultsPhase({ view, send, secondsLeft }: PhaseProps) {
  const isCoin = view.phase === "coin_results";
  const nameOf = (id: string | null) =>
    view.players.find((p) => p.id === id)?.name ?? "Someone";
  const playerOf = (id: string | null) => view.players.find((p) => p.id === id);

  const entries = (
    isCoin
      ? view.slangBoard.map((entry) => ({
          id: entry.id,
          authorId: entry.authorId,
          votes: entry.voteCount ?? 0,
          voterIds: entry.voterIds ?? [],
          heading: entry.term,
          sub: `“${entry.phrase}” as ${entry.category}`,
          body: entry.definition,
          credits: [] as { term: string; authorId: string | null }[],
        }))
      : view.storyBoard.map((story) => ({
          id: story.id,
          authorId: story.authorId,
          votes: story.voteCount ?? 0,
          voterIds: story.voterIds ?? [],
          heading: story.prompt,
          sub: "",
          body: story.text,
          credits: story.slang.map((s) => ({ term: s.term, authorId: s.authorId })),
        }))
  ).sort((a, b) => b.votes - a.votes);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-black">
            {isCoin ? "Round 1 results" : "Round 2 results"}
          </h2>
          <p className="mt-1 text-paper/55">
            {isCoin
              ? "These terms are now the Slangbook — you'll be writing with them next."
              : "Callbacks paid out to whoever coined the slang."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {secondsLeft !== null && secondsLeft !== undefined && (
            <span className="chip tabular-nums">Auto-continues in {secondsLeft}s</span>
          )}
          {view.you.isHost && (
            <button
              className="btn-primary"
              onClick={() => void send({ type: "advance" }).catch(() => {})}
            >
              {isCoin ? "Start round 2" : "See final scores"}
            </button>
          )}
        </div>
      </header>

      {view.lastDeltas.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {view.lastDeltas.map((delta, i) => (
            <motion.li
              key={`${delta.playerId}-${i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              className="chip border-lime/40 bg-lime/10"
            >
              <span className="font-semibold">{nameOf(delta.playerId)}</span>
              <span className="text-lime">+{delta.points}</span>
              <span className="text-paper/50">{delta.reason}</span>
            </motion.li>
          ))}
        </ul>
      )}

      <ul className={cn("grid gap-4", isCoin ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2")}>
        {entries.map((entry, index) => {
          const author = playerOf(entry.authorId);
          return (
            <motion.li
              key={entry.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "surface flex flex-col gap-3 p-5",
                index === 0 && entry.votes > 0 && "border-lime/60 bg-lime/[0.07]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {author && <Avatar index={author.avatar} name={author.name} size={28} />}
                  <span className="text-sm font-semibold">{nameOf(entry.authorId)}</span>
                  {index === 0 && entry.votes > 0 && <span title="Top pick">🏆</span>}
                </div>
                <span className="font-display text-lg tabular-nums text-lime">
                  {entry.votes} {entry.votes === 1 ? "vote" : "votes"}
                </span>
              </div>

              <h3
                className={cn(
                  "font-display font-bold leading-snug",
                  isCoin ? "text-2xl" : "text-base text-paper/75",
                )}
              >
                {entry.heading}
              </h3>
              {entry.sub && <p className="text-xs text-paper/40">{entry.sub}</p>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/80">
                {entry.body}
              </p>

              {entry.credits.length > 0 && (
                <p className="mt-auto text-xs text-paper/45">
                  Slang by{" "}
                  {entry.credits
                    .map((c) => `${c.term} (${nameOf(c.authorId)})`)
                    .join(", ")}
                </p>
              )}

              {entry.voterIds.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-paper/40">
                  Voted by
                  {entry.voterIds.map((id) => {
                    const voter = playerOf(id);
                    return voter ? (
                      <Avatar key={id} index={voter.avatar} name={voter.name} size={20} />
                    ) : null;
                  })}
                </div>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
