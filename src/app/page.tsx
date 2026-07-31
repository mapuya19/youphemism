import Link from "next/link";
import { JoinPanel } from "@/components/JoinPanel";
import { MIN_PLAYERS, MAX_PLAYERS } from "@/lib/types";

const steps = [
  {
    tag: "Round 1",
    title: "Category",
    body: "You hold five Youphemism cards — ordinary things like hot dog, Ikea, clown car. The judge reveals a category, and you play a card and invent slang that fits it.",
    accent: "text-lime",
  },
  {
    tag: "The judge",
    title: "Picks a winner",
    body: "“Ikea is the senior prank where you take apart all the furniture in school.” Best pitch takes the card — that's a point. Everyone judges once.",
    accent: "text-tangerine",
  },
  {
    tag: "Round 2",
    title: "Use It!",
    body: "Every card played gets dealt back out, meanings intact. Pair one with a story prompt and tell it. The vote winner scores — and so does whoever coined the slang.",
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
          The witty party game where you re-invent the meanings of common
          things — then get to use them. Create the slang, then use it wisely.
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
          An unofficial fan-made digital adaptation of Youphemism, created by
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
