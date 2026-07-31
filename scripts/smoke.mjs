/**
 * End-to-end smoke test against a running server.
 *
 *   npm run dev          # in one terminal
 *   node scripts/smoke.mjs [http://localhost:3000]
 *
 * Drives four simulated players through a complete game via the public HTTP
 * API — the same surface the browser uses — and asserts each phase transition.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const TOKEN_HEADER = "x-yph-token";

const token = (i) => `smoke-token-${i}`.padEnd(40, "0");

async function api(path, { token: t, body, method = "POST" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(t ? { [TOKEN_HEADER]: t } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${payload.error ?? "?"}`);
  }
  return payload;
}

const act = (code, i, action) =>
  api(`/api/rooms/${code}/action`, { token: token(i), body: action });

const view = (code, i) =>
  api(`/api/rooms/${code}`, { token: token(i), method: "GET" });

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
  console.log(`  ✓ ${message}`);
}

const PLAYERS = 4;

const run = async () => {
  console.log(`Smoke testing ${BASE}`);

  const { code } = await api("/api/rooms");
  console.log(`\nRoom ${code}`);

  for (let i = 0; i < PLAYERS; i++) {
    await act(code, i, { type: "join", name: `Bot${i}`, avatar: i });
  }
  let state = await view(code, 0);
  assert(state.players.length === PLAYERS, `${PLAYERS} players joined`);
  assert(state.phase === "lobby", "in lobby");

  console.log("\nRound 1 — Coin It");
  state = await act(code, 0, { type: "start_game" });
  assert(state.phase === "coin", "coin phase started");
  assert(state.you.hand?.categories.length === 2, "dealt a phrase + 2 categories");

  for (let i = 0; i < PLAYERS; i++) {
    const mine = await view(code, i);
    state = await act(code, i, {
      type: "submit_slang",
      categoryId: mine.you.hand.categories[0].id,
      term: `bot${i}-slang`,
      definition: `The exact feeling bot ${i} gets on a Tuesday.`,
    });
  }
  assert(state.phase === "coin_vote", "auto-advanced to voting");
  assert(state.slangBoard.length === PLAYERS, "all entries revealed");
  assert(
    state.slangBoard.every((entry) => entry.authorId === null),
    "authorship hidden during voting",
  );

  for (let i = 0; i < PLAYERS; i++) {
    const mine = await view(code, i);
    const target = mine.slangBoard.find((entry) => entry.id !== mine.you.slang.id);
    state = await act(code, i, { type: "vote", targetId: target.id });
  }
  assert(state.phase === "coin_results", "scored round 1");
  assert(
    state.slangBoard.every((entry) => entry.authorId !== null),
    "authorship revealed at results",
  );
  assert(
    state.players.reduce((sum, p) => sum + p.score, 0) ===
      PLAYERS * state.settings.coinVotePoints,
    "round 1 points add up",
  );

  console.log("\nRound 2 — Story Time");
  state = await act(code, 0, { type: "advance" });
  assert(state.phase === "story", "story phase started");
  assert(state.you.assignedSlang.length === 3, "assigned 3 slang terms");
  assert(
    state.you.assignedSlang.every((entry) => entry.term !== `bot0-slang`),
    "never assigned your own slang",
  );

  for (let i = 0; i < PLAYERS; i++) {
    const mine = await view(code, i);
    const terms = mine.you.assignedSlang.map((entry) => entry.term).join(", then ");
    state = await act(code, i, {
      type: "submit_story",
      text: `It began with ${terms}, and honestly nobody has recovered since.`,
    });
  }
  assert(state.phase === "story_vote", "auto-advanced to story voting");

  for (let i = 0; i < PLAYERS; i++) {
    const mine = await view(code, i);
    const target = mine.storyBoard.find((story) => story.id !== mine.you.story.id);
    state = await act(code, i, { type: "vote", targetId: target.id });
  }
  assert(state.phase === "story_results", "scored round 2");
  assert(
    state.lastDeltas.some((delta) => delta.reason.startsWith("callback")),
    "callback points awarded",
  );

  console.log("\nWrap-up");
  state = await act(code, 0, { type: "advance" });
  assert(state.phase === "game_over", "game over");
  const top = Math.max(...state.players.map((p) => p.score));
  assert(top > 0, `someone scored (leader has ${top})`);

  state = await act(code, 0, { type: "restart" });
  assert(state.phase === "lobby", "restart returns to lobby");
  assert(state.players.every((p) => p.score === 0), "scores reset");

  console.log("\nRejection checks");
  await act(code, 0, { type: "start_game" });
  const p0 = await view(code, 0);
  const badVote = await fetch(`${BASE}/api/rooms/${code}/action`, {
    method: "POST",
    headers: { "content-type": "application/json", [TOKEN_HEADER]: token(0) },
    body: JSON.stringify({ type: "submit_slang", categoryId: "nope", term: "x", definition: "y" }),
  });
  assert(badVote.status === 400 || badVote.status === 409, "invalid submission rejected");
  const noAuth = await fetch(`${BASE}/api/rooms/${code}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "start_game" }),
  });
  assert(noAuth.status === 401, "unauthenticated write rejected");
  assert(p0.you.hand !== null, "player can see their own hand");

  console.log("\n✅ All smoke checks passed.");
};

run().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
