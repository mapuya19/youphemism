"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CharCount, WaitingFor } from "@/components/ui";
import { MAX_STORY_LENGTH } from "@/lib/types";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

/**
 * Round 2 — Use It! Pair one slang card from your dealt hand with one of the
 * four shared USE IT! cards and tell the story.
 */
export function UseItPhase({ view, send }: PhaseProps) {
  const { slangHand, story } = view.you;
  const [slangId, setSlangId] = useState<string | null>(null);
  const [useItId, setUseItId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!story) return;
    setSlangId((s) => s ?? story.slangId);
    setUseItId((u) => u ?? story.useItId);
    setText((t) => t || story.text);
  }, [story]);

  const slang = slangHand.find((card) => card.id === slangId);
  const useIt = view.useItCards.find((card) => card.id === useItId);
  const mentionsTerm = slang
    ? text.toLowerCase().includes(slang.term.toLowerCase())
    : false;
  const valid = Boolean(slangId && useItId) && text.trim().length >= 20;
  const pending = view.players.filter((p) => p.connected && !p.ready);

  const submit = async () => {
    if (!valid || !slangId || !useItId) return;
    setBusy(true);
    try {
      await send({ type: "submit_story", slangId, useItId, text: text.trim() });
    } catch {
      /* surfaced by the toast */
    } finally {
      setBusy(false);
    }
  };

  if (slangHand.length === 0) {
    return (
      <div className="surface p-8 text-center text-paper/60">
        You&apos;re out of slang cards — sit back and vote.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <span className="label text-bubble">
            Use It! round {view.useItRound} of {view.useItRounds}
          </span>
          <p className="mt-1 font-display text-xl font-bold">
            Pick a prompt, pick a card, tell the story
          </p>
        </div>
        <p className="max-w-sm text-sm text-paper/55">
          Meanings carry over exactly as they were defined in round 1. More than
          one person can use the same prompt.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="label">Use It! cards on the table</p>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {view.useItCards.map((card) => (
            <li key={card.id}>
              <button
                onClick={() => setUseItId(card.id)}
                aria-pressed={useItId === card.id}
                className={cn(
                  "flex aspect-[4/3] w-full items-center justify-center rounded-2xl border p-4 text-center transition",
                  useItId === card.id
                    ? "border-lime bg-bubble/30 ring-2 ring-lime/40"
                    : "border-white/12 bg-bubble/15 hover:bg-bubble/25",
                )}
              >
                <span className="font-display text-lg leading-tight font-bold">
                  {card.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <p className="label">
            Your slang ({slangHand.length} left — one per round)
          </p>
          <ul className="flex flex-col gap-3">
            {slangHand.map((card) => (
              <li key={card.id}>
                <motion.button
                  layout
                  onClick={() => setSlangId(card.id)}
                  aria-pressed={slangId === card.id}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition",
                    slangId === card.id
                      ? "border-lime bg-lime/12 ring-2 ring-lime/35"
                      : "border-white/12 bg-white/[0.04] hover:bg-white/[0.08]",
                  )}
                >
                  <p className="font-display text-lg font-bold text-sky">{card.term}</p>
                  <p className="mt-1 text-sm leading-relaxed text-paper/70">
                    {card.definition}
                  </p>
                  <p className="mt-1.5 text-xs text-paper/35">as {card.category}</p>
                </motion.button>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface flex flex-col gap-3 p-6">
          <p className="font-display text-xl leading-snug">
            <span className="text-bubble">{useIt?.text ?? "Pick a prompt"}</span>
            {slang && (
              <>
                {" "}
                <span className="text-paper/40">using</span>{" "}
                <span className="text-sky">{slang.term}</span>
              </>
            )}
          </p>
          <textarea
            className="field min-h-[18rem] flex-1 resize-y text-base leading-relaxed"
            placeholder="I went to the emergency room after the seniors pulled the zoo exhibit…"
            value={text}
            maxLength={MAX_STORY_LENGTH}
            onChange={(e) => setText(e.target.value)}
            aria-label="Your story"
          />
          {slang && !mentionsTerm && text.length > 20 && (
            <p className="text-xs text-tangerine">
              Heads up — your story doesn&apos;t mention “{slang.term}” yet.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <CharCount value={text} max={MAX_STORY_LENGTH} />
            <button
              className="btn-primary"
              disabled={!valid || busy}
              onClick={() => void submit()}
            >
              {story ? "Update story" : "Play it face down"}
            </button>
          </div>
          {story && <p className="text-sm text-lime">✓ Face down. Edit until time.</p>}
          <WaitingFor players={pending} />
        </div>
      </div>
    </div>
  );
}
