"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CharCount, WaitingFor } from "@/components/ui";
import { MAX_DEFINITION_LENGTH } from "@/lib/types";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

/**
 * Round 1 — Category. The judge watches; everyone else plays one Youphemism
 * card from their hand of five and invents slang that fits the category.
 */
export function CategoryPhase({ view, send }: PhaseProps) {
  const { hand, pitch, isJudge } = view.you;
  const [cardId, setCardId] = useState<string | null>(null);
  const [definition, setDefinition] = useState("");
  const [busy, setBusy] = useState(false);

  // Restore an existing pitch so it can be edited until the timer runs out.
  useEffect(() => {
    if (!pitch) return;
    setCardId((c) => c ?? pitch.cardId);
    setDefinition((d) => d || pitch.definition);
  }, [pitch]);

  const judge = view.players.find((p) => p.id === view.judgeId);
  const pending = view.players.filter(
    (p) => p.connected && !p.isJudge && !p.ready,
  );
  const chosen = hand.find((card) => card.id === cardId);
  const valid = Boolean(cardId) && definition.trim().length >= 5;

  const submit = async () => {
    if (!valid || !cardId) return;
    setBusy(true);
    try {
      await send({ type: "submit_pitch", cardId, definition: definition.trim() });
    } catch {
      /* surfaced by the toast */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <CategoryBanner view={view} />

      {isJudge ? (
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <span className="text-4xl" aria-hidden>
            👑
          </span>
          <h3 className="font-display text-2xl font-black">You&apos;re the judge</h3>
          <p className="max-w-md text-paper/60">
            Everyone else is inventing slang for{" "}
            <strong className="text-paper">{view.category?.text}</strong>. You&apos;ll
            pick your favourite when the pitches land.
          </p>
          <WaitingFor players={pending} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex flex-col gap-3">
            <p className="label">
              Your hand — play one ({hand.length} card{hand.length === 1 ? "" : "s"})
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {hand.map((card) => (
                <li key={card.id}>
                  <motion.button
                    layout
                    onClick={() => setCardId(card.id)}
                    aria-pressed={cardId === card.id}
                    className={cn(
                      "flex aspect-[3/4] w-full flex-col justify-between rounded-2xl border p-3 text-left transition",
                      cardId === card.id
                        ? "border-lime bg-lime/15 ring-2 ring-lime/40"
                        : "border-white/12 bg-white/[0.04] hover:bg-white/[0.09]",
                    )}
                  >
                    <span className="text-[0.6rem] uppercase tracking-widest text-paper/30">
                      Youphemism
                    </span>
                    <span className="font-display text-lg leading-tight font-bold text-sky">
                      {card.text}
                    </span>
                  </motion.button>
                </li>
              ))}
            </ul>
          </div>

          <aside className="surface flex flex-col gap-4 p-6">
            <div>
              <span className="label">Your pitch</span>
              <p className="mt-2 font-display text-lg leading-snug">
                <span className="text-sky">{chosen?.text ?? "___"}</span> is{" "}
                {view.category?.text ?? "…"} where…
              </p>
            </div>

            <textarea
              className="field min-h-40 resize-y leading-relaxed"
              placeholder="…you take apart all the furniture in school."
              value={definition}
              maxLength={MAX_DEFINITION_LENGTH}
              onChange={(e) => setDefinition(e.target.value)}
              aria-label="Your definition"
            />
            <div className="flex items-center justify-between">
              <CharCount value={definition} max={MAX_DEFINITION_LENGTH} />
              <button
                className="btn-primary"
                disabled={!valid || busy}
                onClick={() => void submit()}
              >
                {pitch ? "Update pitch" : "Play it face down"}
              </button>
            </div>

            {pitch && (
              <p className="text-sm text-lime">
                ✓ Face down. Edit freely until {judge?.name ?? "the judge"} reads them.
              </p>
            )}
            <WaitingFor players={pending} />
          </aside>
        </div>
      )}
    </div>
  );
}

export function CategoryBanner({ view }: { view: PhaseProps["view"] }) {
  const judge = view.players.find((p) => p.id === view.judgeId);
  return (
    <div className="surface relative flex flex-wrap items-center gap-5 overflow-hidden p-6">
      <div className="rounded-2xl bg-tangerine px-5 py-4 text-ink shadow-lg">
        <span className="block text-[0.6rem] font-bold uppercase tracking-[0.2em] opacity-70">
          Category
        </span>
        <span className="font-display text-2xl font-black leading-tight">
          {view.category?.text ?? "—"}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-paper/50">
          Turn {view.turn} of {view.totalTurns}
        </p>
        <p className="font-display text-xl font-bold">
          {judge ? `${judge.name} is judging` : "Judging"}
        </p>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-tangerine/20 blur-3xl"
      />
    </div>
  );
}
