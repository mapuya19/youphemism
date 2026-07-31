import Link from "next/link";
import { JoinPanel } from "@/components/JoinPanel";
import { MIN_PLAYERS, MAX_PLAYERS } from "@/lib/types";

const steps = [
  {
    tag: "Round 1",
    title: "Coin it",
    body: "You get an everyday phrase and two absurd categories. Pick one and invent brand-new slang that redefines the phrase. Everyone votes, anonymously.",
    accent: "text-lime",
  },
  {
    tag: "Round 2",
    title: "Story time",
    body: "Every term goes into the Slangbook. You get a prompt and three of other people's terms — write the story that makes them land.",
    accent: "text-sky",
  },
  {
    tag: "Payoff",
    title: "Callbacks",
    body: "Votes score the storyteller, and the person who coined each term scores too. Great slang keeps paying you all game.",
    accent: "text-bubble",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-[min(96vw,72rem)] flex-col gap-14 px-4 py-10 md:py-16">
      <header className="flex flex-col items-start gap-6">
        <span className="chip">
          <span aria-hidden>✦</span> Free · No downloads · {MIN_PLAYERS}–{MAX_PLAYERS} players
        </span>
        <h1 className="font-display text-5xl leading-[0.92] font-black tracking-tight sm:text-7xl md:text-8xl">
          You
          <span className="bg-gradient-to-r from-lime via-sky to-bubble bg-clip-text text-transparent">
            phemism
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-paper/70 md:text-xl">
          The party game of absurd slang. Redefine ordinary phrases through
          ridiculous categories — then watch your inventions come back in
          everyone else&apos;s stories.
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <article
              key={step.title}
              className="surface flex flex-col gap-3 p-6 animate-float"
              style={{ ["--tilt" as string]: `${i % 2 ? 0.7 : -0.7}deg`, animationDelay: `${i * 0.6}s` }}
            >
              <span className={`label ${step.accent}`}>{step.tag}</span>
              <h2 className="font-display text-2xl font-bold">{step.title}</h2>
              <p className="text-sm leading-relaxed text-paper/65">{step.body}</p>
            </article>
          ))}
        </div>

        <JoinPanel />
      </section>

      <section className="surface p-6 md:p-8">
        <h2 className="font-display text-2xl font-bold">Playing on a call?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-paper/65">
          Everyone opens the same room link on their own phone or laptop. Writing
          happens privately, reveals happen together — so put someone&apos;s
          screen share up for the reveal, or just read them out loud. Rooms
          expire automatically after six hours of inactivity.
        </p>
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-paper/40">
        <p>
          An unofficial fan-made digital adaptation. Youphemism is created by
          Daniel Huang, Raymond Shi and Joanna Shan.
        </p>
        <Link
          href="https://www.kickstarter.com/projects/youphemism/youphemism-the-game-of-absurd-slang"
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-dotted hover:text-paper/70"
        >
          Support the original game →
        </Link>
      </footer>
    </main>
  );
}
