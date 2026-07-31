# AGENTS.md

Guidance for AI agents and new contributors.

## Golden rules

1. **All game rules live in `src/lib/engine.ts`.** It must stay pure — no
   `Date.now()`, no `Math.random()`, no I/O. `now` is a parameter; randomness
   comes from the seeded PRNG in `src/lib/rng.ts`. This is what makes the
   ruleset unit-testable and replayable.
2. **Never widen the client payload by hand.** Anything a player may see flows
   through `projectForPlayer()` in `src/lib/projection.ts`. If you add a field to
   `GameState`, decide explicitly whether it belongs in `ClientView` — and add a
   test asserting it stays hidden if it doesn't.
3. **The client is not trusted.** It may only POST validated `Action`s. Scores,
   reveals and phase transitions are computed server-side.
4. **Every write goes through `mutateRoom()`** so it gets compare-and-set
   retries. Never call `store.compareAndSet()` from a route handler.
5. **No background jobs.** Phase deadlines are enforced by `tick()` on every read
   and write. New time-based behaviour belongs in `tick()`.

## The rules, precisely

Round 1 runs one turn per player (`turnOrder` / `turnIndex`). Each turn:
`category` (non-judges pitch) → `judging` (judge alone picks) → `category_result`
→ pitches move into `definedPile`, judge rotates. When `turnIndex` passes the end
of `turnOrder`, round 2 begins.

Round 2 runs `USE_IT_ROUNDS` (2) times: `useit` (pair a dealt slang card with one
of four USE IT! cards and write) → `useit_vote` (everyone, not their own) →
`useit_result`. A vote win awards **one** point to the storyteller and **one** to
the slang's original author; ties award every tied story. Used slang goes into
`spentSlang` so it can't be replayed.

Scoring is strictly one point per card won — don't introduce weighted points.

Deliberate deviations from the physical rulebook (keep them, they're documented in
the README): anonymous pitches/stories, hands refilling to five between turns,
timed phases with a random fallback pick for an AFK judge.

## Layout

```
src/app/api/rooms/…        HTTP surface (create, snapshot, action, SSE stream)
src/app/room/[code]/       Room page (server component -> RoomClient)
src/components/phases/     One component per phase, props = { view, send }
src/lib/engine.ts          Rules (pure)
src/lib/projection.ts      Secrecy boundary
src/lib/cards.ts           Youphemism / Category / USE IT! decks
src/lib/rooms.ts           Engine + storage orchestration
src/lib/storage.ts         Redis adapter + in-memory dev fallback
src/lib/client/useRoom.ts  SSE transport, heartbeat, countdown
tests/engine.test.ts       Rules + projection tests
scripts/smoke.mjs          Full-game E2E against a running server
```

## Adding a new action

1. Add the variant to `Action` in `src/lib/types.ts`.
2. Add a matching branch to `actionSchema` in `src/lib/schema.ts`.
3. Handle it in the `switch` in `applyAction()`; throw `RuleError` for anything
   the player isn't allowed to do (it maps to HTTP 409).
4. Add tests, including at least one rejection case.

## Adding or changing a phase

`Phase` is a string union in `types.ts`. Wire the transition into
`advancePhase()`, set its readiness condition in `pendingPlayers()` and
`hasSubmitted()`, give it a deadline via `setPhase()`, add a label to
`PHASE_LABEL` in `src/lib/ui.ts`, and route it in `PhaseView` inside
`RoomClient.tsx`.

## Conventions

- Tailwind v4 with a CSS-first theme in `src/app/globals.css` (no
  `tailwind.config.ts`). Shared classes: `.surface`, `.btn-primary`,
  `.btn-ghost`, `.field`, `.label`, `.chip`. Note: Tailwind v4 cannot `@apply`
  another custom component class — inline the utilities instead.
- No component library. Compose with the primitives in `src/components/ui.tsx`.
- `strict` + `noUncheckedIndexedAccess` are on; reserve non-null assertions for
  tests.
- Keep server-only imports (`storage.ts`, `rooms.ts`) out of client components.
  Pure helpers shared by both belong in `src/lib/code.ts` or `src/lib/ui.ts`.

## Checks before you finish

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run dev & npm run smoke    # if you touched the API or the engine
```

The smoke script asserts the real rules (one judge per turn, judge can't pitch,
non-judges can't decide, even deal, coiner callbacks, one point per card). If you
change the ruleset, update it.

## Known constraints

- SSE streams are capped at ~50s by `maxDuration` on the stream route; the client
  reconnects transparently. Don't raise it past your Vercel plan limit.
- Without Redis env vars the store is per-process, so multiplayer only works
  locally. Never "fix" this by putting state in a module-level variable inside a
  route handler.
- Rooms expire after 6 hours (`ROOM_TTL_SECONDS`), refreshed on every write.
- Storage keys are namespaced by `VERCEL_ENV` (`src/lib/storage.ts`). One Redis
  database can therefore serve Production and Preview safely. Don't remove the
  namespacing — a preview branch that changes `GameState`'s shape would
  otherwise corrupt live rooms.
- The SSE loop polls a small `<namespace>:rev:<CODE>` key and only reads the full
  room when the revision moves, a deadline elapses, or the keepalive is due. Both
  keys are written by the same atomic Lua script, so they can't drift. If you add
  another write path, keep them together.
- Cost dials, if ever needed: `POLL_MS` in the stream route and `HEARTBEAT_MS` in
  `useRoom.ts`. Doubling both roughly halves Redis command usage at the cost of
  responsiveness.
- The defined pile must give each player at least `USE_IT_ROUNDS` cards. With
  3+ players it always does (`N × (N−1)` cards, `N−1` each); if you change hand
  or round counts, re-check `beginRoundTwo()`.
