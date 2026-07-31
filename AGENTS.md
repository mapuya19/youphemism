# AGENTS.md

Guidance for AI agents and new contributors.

## Golden rules

1. **All game rules live in `src/lib/engine.ts`.** It must stay pure — no
   `Date.now()`, no `Math.random()`, no I/O. `now` is a parameter; randomness
   comes from the seeded PRNG in `src/lib/rng.ts`. This is what makes the
   ruleset unit-testable and replayable.
2. **Never widen the client payload by hand.** Anything a player is allowed to
   see must flow through `projectForPlayer()` in `src/lib/projection.ts`. If you
   add a field to `GameState`, decide explicitly whether it belongs in
   `ClientView` — and add a test asserting it stays hidden if it doesn't.
3. **The client is not trusted.** It may only POST validated `Action`s. Scores,
   reveals and phase transitions are computed server-side.
4. **Every write goes through `mutateRoom()`** so it gets compare-and-set
   retries. Never call `store.compareAndSet()` from a route handler.
5. **No background jobs.** Phase deadlines are enforced by `tick()` on every
   read and write. If you need new time-based behaviour, put it in `tick()`.

## Layout

```
src/app/api/rooms/…        HTTP surface (create, snapshot, action, SSE stream)
src/app/room/[code]/       Room page (server component -> RoomClient)
src/components/phases/     One component per phase, props = { view, send }
src/lib/engine.ts          Rules (pure)
src/lib/projection.ts      Secrecy boundary
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
`advancePhase()`, decide its readiness condition in `maybeAutoAdvance()` and
`hasSubmitted()`, set a deadline via `setPhase()`, add a label to `PHASE_LABEL`
in `src/lib/ui.ts`, and route it in `PhaseView` inside `RoomClient.tsx`.

## Conventions

- Tailwind v4 with a CSS-first theme in `src/app/globals.css` (no
  `tailwind.config.ts`). Shared classes: `.surface`, `.btn-primary`,
  `.btn-ghost`, `.field`, `.label`, `.chip`. Note: Tailwind v4 cannot `@apply`
  another custom component class — inline the utilities instead.
- No component library. Compose with the primitives in `src/components/ui.tsx`.
- `strict` + `noUncheckedIndexedAccess` are on; prefer non-null assertions only
  in tests.
- Keep server-only imports (`storage.ts`, `rooms.ts`) out of client components.
  Pure helpers shared by both belong in `src/lib/code.ts` or `src/lib/ui.ts`.

## Checks before you finish

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run dev & node scripts/smoke.mjs   # if you touched the API or engine
```

## Known constraints

- SSE streams are capped at ~50s by `maxDuration` on the stream route; the
  client reconnects transparently. Don't raise this past your Vercel plan limit.
- Without Redis env vars the store is per-process, so multiplayer only works
  locally. Never "fix" this by putting state in a module-level variable in a
  route handler.
- Rooms expire after 6 hours (`ROOM_TTL_SECONDS`), refreshed on every write.
