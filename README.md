# Youphemism (unofficial online adaptation)

A real-time multiplayer party game for **3–10 players**: redefine everyday
phrases through absurd categories, then work everyone else's invented slang
into a story for the callback payoff.

Inspired by [Youphemism: The Game of Absurd Slang](https://www.kickstarter.com/projects/youphemism/youphemism-the-game-of-absurd-slang)
by Daniel Huang, Raymond Shi and Joanna Shan. This is a fan-made digital
adaptation with original card content — please support the physical game.

## How it plays

| Phase | What happens |
|---|---|
| **Lobby** | Host opens a room, shares a 5-character code, sets the timers. |
| **Round 1 · Coin It** | You get one common phrase and two absurd categories. Pick a category, invent a slang term, define it. Everything reveals anonymously. |
| **Round 1 · Vote** | One vote each, not for your own. Each vote = `coinVotePoints` (default 2). |
| **Round 2 · Story Time** | Every term joins the Slangbook. You get a story prompt plus three terms *other people* coined, and must land them all. |
| **Round 2 · Vote** | Each vote = `storyVotePoints` (default 3) to the storyteller **plus** `callbackPoints` (default 1) to whoever coined each term used. |
| **Final scores** | Most points wins. Host can replay in the same room. |

Writing phases end early once everyone has submitted; voting phases end early
once everyone has voted. Every phase also has a timer, so one idle player can
never stall the table.

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript strict) — deployed to Vercel
- **Tailwind CSS v4** (CSS-first theme) + **Framer Motion**
- **Upstash Redis** for room state, with compare-and-set concurrency control
- **Server-Sent Events** for realtime fan-out (no WebSocket server needed)
- **Zod** for request validation, **Vitest** for the rules engine

### Why SSE instead of WebSockets

Vercel's serverless functions can't hold WebSocket connections. This game's
update rate is a handful of events per minute, so each client opens a streaming
`GET` that tails the room's revision counter and pushes the caller's *projected*
view whenever it changes. Sub-second updates, zero extra infrastructure, and
action responses return fresh state so the UI never waits for a poll.

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
| `src/lib/projection.ts` | Strips secrets per-player (hands, authorship, tallies). |
| `src/lib/rooms.ts` | Combines engine + storage; CAS retries and lazy timer ticks. |
| `src/lib/storage.ts` | Upstash Redis adapter, with an in-memory dev fallback. |
| `src/lib/identity.ts` | Unforgeable player ids: public id = `sha256(secret token)`. |
| `src/lib/client/useRoom.ts` | SSE subscription, backoff reconnect, heartbeat, clock-drift-corrected countdown. |
| `src/components/phases/*` | One dumb component per phase, driven by `ClientView`. |

Design notes worth knowing:

- **Server-authoritative.** The client can only send `Action`s; it never
  computes score, reveals, or transitions.
- **No secrets on the wire.** Authorship and vote tallies are withheld until the
  results screen — enforced in one place (`projection.ts`), covered by tests.
- **No cron, no background worker.** Phase deadlines are enforced lazily on
  every read/write via `tick()`, which suits a serverless deployment.
- **Optimistic concurrency.** Simultaneous submissions can't clobber each other:
  writes only land if the stored `rev` still matches, otherwise the action is
  replayed against fresh state.

## Local development

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Redis credentials the app uses a process-local store — perfect for
single-instance local play. Open several browser tabs (each gets its own player
token) or point phones at your LAN address.

```bash
npm test               # rules engine unit tests
npm run typecheck
npm run lint
node scripts/smoke.mjs # drives 4 bots through a full game against a live server
```

## Deploy to Vercel

1. Push this repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. In the project's **Storage** tab, add a **Upstash for Redis** database and
   connect it. That injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   automatically — the app reads either those or the `UPSTASH_REDIS_REST_*`
   pair.
3. Deploy. No other configuration is required.

Optionally set `NEXT_PUBLIC_SITE_URL` so social share cards resolve absolutely.

> Without Redis the app still deploys and runs, but each serverless instance
> keeps its own copy of state, so players will drift apart. Redis is required for
> real multiplayer.

Room state is stored under `youphemism:room:<CODE>` with a rolling 6-hour TTL,
so nothing needs cleaning up.

## Licence

MIT for this code. Game concept belongs to its creators.
