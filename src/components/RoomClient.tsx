"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PlayerRail, Timer, Toast } from "@/components/ui";
import { Lobby } from "@/components/phases/Lobby";
import { CategoryPhase } from "@/components/phases/CategoryPhase";
import { CategoryResult, JudgingPhase } from "@/components/phases/JudgingPhase";
import { UseItPhase } from "@/components/phases/UseItPhase";
import { UseItResult, UseItVote } from "@/components/phases/UseItVote";
import { GameOver } from "@/components/phases/GameOver";
import { getToken, loadProfile, useRoom } from "@/lib/client/useRoom";
import { PHASE_LABEL, cn } from "@/lib/ui";

/**
 * Room shell: owns the connection, the header/HUD, and phase routing.
 * Each phase view is a dumb component driven by the projected `ClientView`.
 */
export function RoomClient({ code }: { code: string }) {
  const { view, status, error, secondsLeft, send, clearError } = useRoom(code);
  const joinAttempted = useRef(false);
  const joinRejected = useRef(false);
  const [needsName, setNeedsName] = useState(false);

  // Auto-join with the stored profile as soon as we know the room exists.
  useEffect(() => {
    if (!view || joinAttempted.current || joinRejected.current) return;
    const alreadyIn = view.players.some((p) => p.id === view.you.id) && view.you.id !== "";
    if (alreadyIn) {
      joinAttempted.current = true;
      return;
    }
    const profile = loadProfile();
    if (!profile?.name) {
      setNeedsName(true);
      return;
    }
    joinAttempted.current = true;
    void send({ type: "join", name: profile.name, avatar: profile.avatar }).catch(
      () => {
        // Don't retry in a loop — the room is full, mid-game, or the name clashes.
        joinRejected.current = true;
      },
    );
  }, [view, send]);

  // Politely announce departure when the tab closes.
  useEffect(() => {
    const onHide = () => {
      if (!view?.you.id) return;
      void fetch(`/api/rooms/${code}/action`, {
        method: "POST",
        keepalive: true,
        headers: {
          "content-type": "application/json",
          "x-yph-token": getToken(),
        },
        body: JSON.stringify({ type: "leave" }),
      }).catch(() => {});
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [code, view?.you.id]);

  const totalForPhase = useMemo(() => {
    if (!view) return undefined;
    switch (view.phase) {
      case "category":
        return view.settings.pitchSeconds;
      case "judging":
        return view.settings.judgeSeconds;
      case "useit":
        return view.settings.storySeconds;
      case "useit_vote":
        return view.settings.voteSeconds;
      default:
        return undefined;
    }
  }, [view]);

  if (status === "gone") {
    return (
      <CenteredMessage
        title="Room not found"
        body="Rooms disappear after six hours of quiet. Start a fresh one?"
      />
    );
  }

  if (!view) {
    return <CenteredMessage title="Connecting…" body={`Joining room ${code}`} pulse />;
  }

  if (needsName) {
    return (
      <NamePrompt
        code={code}
        onSubmit={(name, avatar) => {
          setNeedsName(false);
          joinAttempted.current = true;
          void send({ type: "join", name, avatar }).catch(() => {
            joinRejected.current = true;
          });
        }}
      />
    );
  }

  const inRoom = view.players.some((p) => p.id === view.you.id);

  return (
    <main className="mx-auto flex min-h-dvh w-[min(96vw,76rem)] flex-col gap-6 px-3 py-6 md:px-4">
      <header className="surface flex flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/" className="font-display text-xl font-black tracking-tight">
          You<span className="text-lime">phemism</span>
        </Link>
        <RoomCodeBadge code={code} />
        <span className="chip">
          {PHASE_LABEL[view.phase] ?? view.phase}
          {view.phase === "category" ||
          view.phase === "judging" ||
          view.phase === "category_result"
            ? ` · ${view.turn}/${view.totalTurns}`
            : view.phase === "useit" ||
                view.phase === "useit_vote" ||
                view.phase === "useit_result"
              ? ` · ${view.useItRound}/${view.useItRounds}`
              : ""}
        </span>
        <div className="ml-auto flex items-center gap-4">
          <Timer secondsLeft={secondsLeft} total={totalForPhase} />
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              status === "live" ? "bg-lime" : "bg-tangerine animate-pulse",
            )}
            title={status === "live" ? "Live" : "Reconnecting…"}
            role="status"
            aria-label={status === "live" ? "Connected" : "Reconnecting"}
          />
        </div>
      </header>

      <PlayerRail
        players={view.players}
        youId={view.you.id}
        showReady={view.phase === "category" || view.phase === "useit"}
        showVoted={view.phase === "useit_vote"}
      />

      <AnimatePresence mode="wait">
        <motion.section
          key={view.phase}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22 }}
          className="flex-1"
        >
          {!inRoom && view.phase !== "lobby" ? (
            <div className="surface p-8 text-center">
              <h2 className="font-display text-2xl font-bold">Game in progress</h2>
              <p className="mt-2 text-paper/60">
                You&apos;re watching as a spectator. You&apos;ll be able to join
                when this game returns to the lobby.
              </p>
            </div>
          ) : (
            <PhaseView view={view} send={send} secondsLeft={secondsLeft} />
          )}
        </motion.section>
      </AnimatePresence>

      <Toast message={error} onDismiss={clearError} />
    </main>
  );
}

function PhaseView({
  view,
  send,
  secondsLeft,
}: {
  view: NonNullable<ReturnType<typeof useRoom>["view"]>;
  send: ReturnType<typeof useRoom>["send"];
  secondsLeft: number | null;
}) {
  switch (view.phase) {
    case "lobby":
      return <Lobby view={view} send={send} />;
    case "category":
      return <CategoryPhase view={view} send={send} />;
    case "judging":
      return <JudgingPhase view={view} send={send} />;
    case "category_result":
      return <CategoryResult view={view} send={send} secondsLeft={secondsLeft} />;
    case "useit":
      return <UseItPhase view={view} send={send} />;
    case "useit_vote":
      return <UseItVote view={view} send={send} />;
    case "useit_result":
      return <UseItResult view={view} send={send} secondsLeft={secondsLeft} />;
    case "game_over":
      return <GameOver view={view} send={send} />;
    default:
      return null;
  }
}

function RoomCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          // Share the clean room URL, never the dev-only ?seat= switch.
          const url = new URL(window.location.href);
          url.search = "";
          await navigator.clipboard.writeText(url.toString());
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="chip font-display text-base tracking-[0.25em] hover:bg-white/10"
      title="Copy the invite link"
    >
      {copied ? "Link copied!" : code}
    </button>
  );
}

function CenteredMessage({
  title,
  body,
  pulse,
}: {
  title: string;
  body: string;
  pulse?: boolean;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className={cn("surface max-w-md p-8 text-center", pulse && "animate-pulse")}>
        <h1 className="font-display text-3xl font-black">{title}</h1>
        <p className="mt-3 text-paper/60">{body}</p>
        <Link href="/" className="btn-primary mt-6">
          Back to the start
        </Link>
      </div>
    </main>
  );
}

function NamePrompt({
  code,
  onSubmit,
}: {
  code: string;
  onSubmit: (name: string, avatar: number) => void;
}) {
  const [name, setName] = useState("");
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <form
        className="surface w-full max-w-sm p-7"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim(), Math.floor(Math.random() * 10));
        }}
      >
        <h1 className="font-display text-2xl font-black">Joining {code}</h1>
        <p className="mt-2 text-sm text-paper/60">What should everyone call you?</p>
        <input
          className="field mt-4"
          placeholder="Your name"
          value={name}
          maxLength={16}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary mt-4 w-full">
          Join the room
        </button>
      </form>
    </main>
  );
}
