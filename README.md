# Youphemism (unofficial online adaptation)

A real-time multiplayer web version of **Youphemism: The Witty Party Game** —
re-invent the meanings of common things, then get to use them. 3–10 players,
one link, no downloads.

Inspired by [the Kickstarter](https://www.kickstarter.com/projects/youphemism/youphemism-the-game-of-absurd-slang)
by Daniel Huang, Raymond Shi and Joanna Shan. This is a fan-made digital
adaptation with original card content — please buy the real deck.

## How it plays

**Setup.** Everyone holds five **Youphemism** cards — ordinary things like
*hot dog*, *Ikea*, *clown car*. Seat order is randomised, and each player will
judge exactly once.

**Round 1 · Category.** The judge reveals a **Category** card (*senior pranks*).
Everyone else plays one card from their hand and invents slang that fits:

> *Ikea* is the **senior prank** where you take apart all the furniture in school.

The judge picks a favourite — that's **one point**. Every card played is saved,
meaning intact, into the defined pile. Then the judge rotates. Round 1 ends when
everyone has judged once.

**Round 2 · Use It!** Discard your hand. The defined pile is dealt out evenly and
those meanings stay exactly as they were. Four **USE IT!** cards go on the table
(*"I went to the emergency room…"*). Pair one slang card with one prompt and tell
the story; several people can share a prompt. Everyone votes for the funniest
that isn't their own.

The winning storyteller scores a point — **and so does whoever originally coined
that slang**. Ties: every tied story wins. Played twice, with four new prompts
the second time.

**Most points wins.** Every card won is worth exactly one point.

### Adaptation notes

Faithful to the rulebook, with four deliberate changes for online play:

- **Pitches and stories are anonymous** while being judged or voted on. There's
  no table to read online, so hiding authorship removes judge favouritism.
- **Hands refill to five between turns.** With more than six players you'd
  otherwise run out of cards mid-round.
- **Everything is timed** (host-configurable). Writing phases end early once
  everyone has submitted; a judge who times out gets a random pick, so one idle
  player can't stall the table.
- **Ties are reported as ties.** The rulebook prescribes a dance battle; that
  part is on you.

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript strict) on Vercel
- **Tailwind CSS v4** (CSS-first theme) + **Framer Motion**
- **Upstash Redis** for room state, with compare-and-set concurrency control
- **Server-Sent Events** for realtime fan-out — no WebSocket server needed
- **Zod** request validation, **Vitest** for the rules engine

### Why SSE instead of WebSockets

Vercel's serverless functions can't hold WebSocket connections. This game's
update rate is a handful of events per minute, so each client opens a streaming
`GET` that tails the room's revision counter and pushes that caller's *projected*
view whenever it changes. Sub-second updates, zero extra infrastructure — and
action responses return fresh state, so the UI never waits for a poll.

### Architecture

```
Browser ──POST /api/rooms/[code]/action──▶ Route handler ──▶ mutateRoom()
        ◀──── projected ClientView ─────┘                      │
        ──GET  /api/rooms/[code]/stream─▶ SSE loop ────────────┤
                                                               ▼
                                             pure engine (applyAction/tick)
                                                               │
                                                    Upstash Redis (CAS on rev)
```

| File | Responsibility |
|---|---|
| `src/lib/engine.ts` | **All** game rules. Pure: no I/O, no clock, no `Math.random()`. |
| `src/lib/projection.ts` | Strips secrets per player (hands, authorship, tallies). |
| `src/lib/rooms.ts` | Engine + storage; CAS retries and lazy timer ticks. |
| `src/lib/storage.ts` | Upstash Redis adapter, with an in-memory dev fallback. |
| `src/lib/identity.ts` | Unforgeable player ids: public id = `sha256(secret token)`. |
| `src/lib/cards.ts` | The three decks: Youphemism, Category, USE IT!. |
| `src/lib/client/useRoom.ts` | SSE subscription, backoff reconnect, heartbeat, drift-corrected countdown. |
| `src/components/phases/*` | One component per phase, driven entirely by `ClientView`. |

Design notes worth knowing:

- **Server-authoritative.** Clients can only send `Action`s; they never compute
  score, reveals, or transitions.
- **No secrets on the wire.** Hands, authorship and vote tallies are withheld
  until reveal — enforced in one place (`projection.ts`) and covered by tests.
- **No cron, no worker.** Phase deadlines are enforced lazily via `tick()` on
  every read and write, which suits a serverless deployment.
- **Optimistic concurrency.** Simultaneous submissions can't clobber each other:
  a write only lands if the stored `rev` still matches, otherwise the action is
  replayed against fresh state.

## Local development

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Redis credentials the app uses a process-local store — fine for
single-instance local play. Open several browser tabs (each gets its own player
token) or point phones at your LAN address.

```bash
npm test               # rules engine + projection unit tests
npm run typecheck
npm run lint
npm run smoke          # drives 4 bots through a full game against a live server
```

## Deploy to Vercel

1. Push to GitHub and import at [vercel.com/new](https://vercel.com/new).
2. In the project's **Storage** tab, add an **Upstash for Redis** database and
   connect it. That injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   automatically — the app accepts either those or the `UPSTASH_REDIS_REST_*`
   pair.
3. Deploy. Nothing else to configure.

Optionally set `NEXT_PUBLIC_SITE_URL` so social share cards resolve absolutely.

> Without Redis the app still deploys and runs, but each serverless instance
> keeps its own copy of state and players will drift apart. Redis is required for
> real multiplayer.

Room state lives under `youphemism:room:<CODE>` with a rolling 6-hour TTL, so
there's nothing to clean up.

## Licence

MIT for this code. The game itself belongs to its creators.
