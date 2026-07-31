"use client";

import { useEffect, useMemo, useState } from "react";
import { CharCount, WaitingFor } from "@/components/ui";
import { MAX_STORY_LENGTH } from "@/lib/types";
import { cn } from "@/lib/ui";
import type { PhaseProps } from "./types";

/** Round 2: write a story that lands all of your assigned slang terms. */
export function StoryPhase({ view, send }: PhaseProps) {
  const { prompt, assignedSlang, story } = view.you;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (story) setText((t) => t || story.text);
  }, [story]);

  // Live "did you actually use it?" checklist — a nudge, never a hard gate.
  const used = useMemo(() => {
    const haystack = text.toLowerCase();
    return new Map(
      assignedSlang.map((entry) => [entry.id, haystack.includes(entry.term.toLowerCase())]),
    );
  }, [text, assignedSlang]);

  const usedCount = [...used.values()].filter(Boolean).length;
  const valid = text.trim().length >= 20;
  const pending = view.players.filter((p) => p.connected && !p.ready);

  if (!prompt) {
    return (
      <div className="surface p-8 text-center text-paper/60">
        Sitting this round out — hang tight.
      </div>
    );
  }

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await send({ type: "submit_story", text: text.trim() });
    } catch {
      /* toast handles it */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <article className="surface p-6">
          <span className="label text-sky">Your prompt</span>
          <h2 className="mt-2 font-display text-2xl leading-snug font-black">{prompt}</h2>
        </article>

        <div className="surface flex flex-col gap-3 p-6">
          <span className="label text-bubble">
            Use all {assignedSlang.length} · {usedCount} spotted
          </span>
          <ul className="flex flex-col gap-3">
            {assignedSlang.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded-2xl border p-3 transition",
                  used.get(entry.id)
                    ? "border-lime/60 bg-lime/10"
                    : "border-white/10 bg-black/20",
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-lg font-bold">{entry.term}</span>
                  {used.get(entry.id) && (
                    <span aria-label="used" className="text-lime">
                      ✓
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-paper/65">
                  {entry.definition}
                </p>
                <p className="mt-1.5 text-xs text-paper/35">
                  redefines “{entry.phrase}” as {entry.category}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="surface flex flex-col gap-3 p-6">
        <label htmlFor="story" className="label">
          Your story
        </label>
        <textarea
          id="story"
          className="field min-h-[22rem] flex-1 resize-y text-base leading-relaxed"
          placeholder="Once the gremlin o'clock alarm went off, there was no going back…"
          value={text}
          maxLength={MAX_STORY_LENGTH}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <CharCount value={text} max={MAX_STORY_LENGTH} />
          <button className="btn-primary" disabled={!valid || busy} onClick={() => void submit()}>
            {story ? "Update my story" : "File the story"}
          </button>
        </div>
        {story && <p className="text-sm text-lime">✓ Submitted — edit freely until time.</p>}
        <WaitingFor players={pending} />
      </div>
    </div>
  );
}
