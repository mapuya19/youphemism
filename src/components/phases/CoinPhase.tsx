"use client";

import { useEffect, useState } from "react";
import { CharCount, WaitingFor } from "@/components/ui";
import { MAX_DEFINITION_LENGTH, MAX_SLANG_LENGTH } from "@/lib/types";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

/** Round 1: pick a category, coin a term, write its absurd definition. */
export function CoinPhase({ view, send }: PhaseProps) {
  const hand = view.you.hand;
  const submitted = view.you.slang;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [busy, setBusy] = useState(false);

  // Restore a previous submission so edits are possible until the round ends.
  useEffect(() => {
    if (!submitted || !hand) return;
    setTerm((t) => t || submitted.term);
    setDefinition((d) => d || submitted.definition);
    setCategoryId(
      (c) => c ?? hand.categories.find((x) => x.text === submitted.category)?.id ?? null,
    );
  }, [submitted, hand]);

  if (!hand) {
    return (
      <div className="surface p-8 text-center text-paper/60">
        Sitting this round out — hang tight.
      </div>
    );
  }

  const valid = categoryId !== null && term.trim().length >= 2 && definition.trim().length >= 5;
  const pending = view.players.filter((p) => p.connected && !p.ready);

  const submit = async () => {
    if (!valid || !categoryId) return;
    setBusy(true);
    try {
      await send({ type: "submit_slang", categoryId, term: term.trim(), definition: definition.trim() });
    } catch {
      /* toast handles it */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-5">
        <article className="surface relative overflow-hidden p-6 md:p-8">
          <span className="label text-lime">Your phrase</span>
          <h2 className="mt-2 font-display text-4xl leading-tight font-black md:text-5xl">
            “{hand.phrase.text}”
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/60">
            Forget what it actually means. Coin a new word or phrase for it —
            filtered through one of the categories below.
          </p>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime/20 blur-3xl"
          />
        </article>

        <div className="grid gap-3 sm:grid-cols-2">
          {hand.categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setCategoryId(category.id)}
              aria-pressed={categoryId === category.id}
              className={cn(
                "surface flex flex-col items-start gap-2 p-5 text-left transition",
                categoryId === category.id
                  ? "border-lime/70 bg-lime/10 ring-2 ring-lime/30"
                  : "hover:bg-white/[0.07]",
              )}
            >
              <span className="label">Category</span>
              <span className="font-display text-xl font-bold leading-snug">
                {category.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      <aside className="surface flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="term" className="label">
            Your slang
          </label>
          <input
            id="term"
            className="field font-display text-lg"
            placeholder="e.g. gremlin o'clock"
            value={term}
            maxLength={MAX_SLANG_LENGTH}
            onChange={(e) => setTerm(e.target.value)}
          />
          <div className="flex justify-end">
            <CharCount value={term} max={MAX_SLANG_LENGTH} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="definition" className="label">
            What it means
          </label>
          <textarea
            id="definition"
            className="field min-h-32 resize-y leading-relaxed"
            placeholder="Define it like a dictionary that's had a rough night."
            value={definition}
            maxLength={MAX_DEFINITION_LENGTH}
            onChange={(e) => setDefinition(e.target.value)}
          />
          <div className="flex justify-end">
            <CharCount value={definition} max={MAX_DEFINITION_LENGTH} />
          </div>
        </div>

        <button className="btn-primary" disabled={!valid || busy} onClick={() => void submit()}>
          {submitted ? "Update my slang" : "Lock it in"}
        </button>

        {submitted && (
          <p className="text-sm text-lime">
            ✓ Submitted. You can keep editing until the timer runs out.
          </p>
        )}
        <WaitingFor players={pending} />
      </aside>
    </div>
  );
}
