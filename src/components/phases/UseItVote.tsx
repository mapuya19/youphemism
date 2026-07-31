"use client";

import { motion } from "framer-motion";
import { Avatar, WaitingFor } from "@/components/ui";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

/** Round 2 — everyone votes for the funniest story that isn't their own. */
export function UseItVote({ view, send }: PhaseProps) {
  const mine = view.you.story?.id;
  const selected = view.you.votedFor;
  const pending = view.players.filter((p) => p.connected && !p.hasVoted);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-black">Vote for the funniest</h2>
          <p className="mt-1 text-paper/55">
            Anonymous, one vote each, not your own. The winner scores — and so
            does whoever coined the slang they used.
          </p>
        </div>
        <WaitingFor players={pending} />
      </header>

      <ul className="grid gap-4 lg:grid-cols-2">
        {view.storyBoard.map((story, index) => {
          const isMine = story.id === mine;
          const chosen = selected === story.id;
          return (
            <motion.li
              key={story.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
            >
              <button
                disabled={isMine}
                aria-pressed={chosen}
                onClick={() =>
                  void send(
                    chosen ? { type: "unvote" } : { type: "vote", targetId: story.id },
                  ).catch(() => {})
                }
                className={cn(
                  "surface flex h-full w-full flex-col gap-3 p-5 text-left transition",
                  chosen && "border-lime/70 bg-lime/10 ring-2 ring-lime/30",
                  isMine ? "cursor-default opacity-60" : "hover:bg-white/[0.07]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="label">
                    {isMine ? "Yours" : chosen ? "Your vote ✓" : `Story ${index + 1}`}
                  </span>
                  <span className="chip border-bubble/40 bg-bubble/15">
                    {story.useIt}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-paper/85">
                  {story.text}
                </p>
                <p className="mt-auto text-xs text-paper/40">
                  uses <span className="text-sky">{story.term}</span> — {story.definition}
                </p>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** Round 2 results: storyteller and original coiner each take a card. */
export function UseItResult({ view, send, secondsLeft }: PhaseProps) {
  const playerOf = (id: string | null) => view.players.find((p) => p.id === id);
  const nameOf = (id: string | null) => playerOf(id)?.name ?? "Someone";
  const stories = [...view.storyBoard].sort(
    (a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0),
  );
  const lastRound = view.useItRound >= view.useItRounds;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-black">
            Use It! round {view.useItRound} results
          </h2>
          <p className="mt-1 text-paper/55">
            The winning storyteller takes the USE IT! card, and whoever invented
            that slang in round 1 takes the Youphemism card.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {secondsLeft !== null && secondsLeft !== undefined && (
            <span className="chip tabular-nums">Continues in {secondsLeft}s</span>
          )}
          {view.you.isHost && (
            <button
              className="btn-primary"
              onClick={() => void send({ type: "advance" }).catch(() => {})}
            >
              {lastRound ? "See final scores" : "Next Use It! round"}
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
              transition={{ delay: i * 0.07 }}
              className="chip border-lime/40 bg-lime/10"
            >
              <span className="font-semibold">{nameOf(delta.playerId)}</span>
              <span className="text-lime">+{delta.points}</span>
              <span className="text-paper/50">{delta.reason}</span>
            </motion.li>
          ))}
        </ul>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {stories.map((story, index) => {
          const author = playerOf(story.authorId);
          const coiner = playerOf(story.coinerId);
          return (
            <motion.li
              key={story.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className={cn(
                "surface flex flex-col gap-3 p-5",
                story.won && "border-lime/60 bg-lime/[0.08]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {author && <Avatar index={author.avatar} name={author.name} size={26} />}
                  <span className="text-sm font-semibold">{nameOf(story.authorId)}</span>
                  {story.won && <span aria-label="winner">🏆</span>}
                </div>
                <span className="font-display text-lg tabular-nums text-lime">
                  {story.voteCount ?? 0} {story.voteCount === 1 ? "vote" : "votes"}
                </span>
              </div>

              <span className="chip w-fit border-bubble/40 bg-bubble/15">
                {story.useIt}
              </span>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-paper/85">
                {story.text}
              </p>
              <p className="mt-auto text-xs text-paper/45">
                <span className="text-sky">{story.term}</span> coined by{" "}
                {nameOf(story.coinerId)}
                {story.won && coiner ? " (+1)" : ""}
              </p>

              {story.voterIds && story.voterIds.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-paper/40">
                  Voted by
                  {story.voterIds.map((id) => {
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
