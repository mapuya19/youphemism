/**
 * End-to-end smoke test against a running server.
 *
 *   npm run dev          # in one terminal
 *   npm run smoke        # or: node scripts/smoke.mjs http://localhost:3000
 *
 * Drives four simulated players through a complete game over the public HTTP
 * API — the same surface the browser uses — asserting every phase transition,
 * the secrecy rules, and the scoring.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const TOKEN_HEADER = "x-yph-token";
const PLAYERS = 4;

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
const look = (code, i) => api(`/api/rooms/${code}`, { token: token(i), method: "GET" });

const status = async (code, i, action) => {
  const response = await fetch(`${BASE}/api/rooms/${code}/action`, {
    method: "POST",
    headers: { "content-type": "application/json", [TOKEN_HEADER]: token(i) },
    body: JSON.stringify(action),
  });
  return response.status;
};

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT failed: ${message}`);
  console.log(`  ✓ ${message}`);
}

/** Index of the player whose token maps to the current judge. */
const judgeIndex = (view) =>
  view.players.findIndex((p) => p.id === view.judgeId);

async function playRoundOneTurn(code, turn) {
  let state = await look(code, 0);
  const judge = judgeIndex(state);
  assert(judge !== -1, `turn ${turn}: a judge is assigned`);
  assert(Boolean(state.category), `turn ${turn}: a category card is revealed`);

  // The judge must not be able to pitch.
  const judgeView = await look(code, judge);
  const blocked = await status(code, judge, {
    type: "submit_pitch",
    cardId: judgeView.you.hand[0].id,
    definition: "the judge should not be able to do this",
  });
  assert(blocked === 409, `turn ${turn}: judge is blocked from pitching`);

  for (let i = 0; i < PLAYERS; i++) {
    if (i === judge) continue;
    const mine = await look(code, i);
    assert(
      mine.you.hand.length === 5,
      `turn ${turn}: player ${i} holds 5 cards`,
    );
    state = await act(code, i, {
      type: "submit_pitch",
      cardId: mine.you.hand[0].id,
      definition: `Bot ${i}'s take on ${mine.category.text}.`,
    });
  }

  assert(state.phase === "judging", `turn ${turn}: advanced to judging`);
  const board = (await look(code, judge)).pitchBoard;
  assert(board.length === PLAYERS - 1, `turn ${turn}: every non-judge pitched`);
  assert(
    board.every((p) => p.authorId === null),
    `turn ${turn}: pitch authorship hidden from the judge`,
  );

  const notJudge = (judge + 1) % PLAYERS;
  const stolen = await status(code, notJudge, {
    type: "judge_pick",
    pitchId: board[0].id,
  });
  assert(stolen === 409, `turn ${turn}: non-judges can't decide`);

  state = await act(code, judge, { type: "judge_pick", pitchId: board[0].id });
  assert(state.phase === "category_result", `turn ${turn}: winner resolved`);
  assert(
    state.pitchBoard.filter((p) => p.won).length === 1,
    `turn ${turn}: exactly one winner`,
  );

  return act(code, hostIndex, { type: "advance" });
}

let hostIndex = 0;

async function playUseItRound(code, round) {
  let state = await look(code, 0);
  assert(state.phase === "useit", `use it ${round}: writing phase`);
  assert(state.useItCards.length === 4, `use it ${round}: four USE IT! cards`);
  assert(state.useItRound === round, `use it ${round}: correct round number`);

  const handSizes = [];
  for (let i = 0; i < PLAYERS; i++) {
    const mine = await look(code, i);
    handSizes.push(mine.you.slangHand.length);
    state = await act(code, i, {
      type: "submit_story",
      slangId: mine.you.slangHand[0].id,
      useItId: mine.useItCards[i % mine.useItCards.length].id,
      text: `Bot ${i} here. It all started with ${mine.you.slangHand[0].term}, and nobody has recovered since.`,
    });
  }
  assert(new Set(handSizes).size === 1, `use it ${round}: pile dealt out evenly`);
  assert(state.phase === "useit_vote", `use it ${round}: advanced to voting`);
  assert(
    state.storyBoard.every((s) => s.authorId === null && s.voteCount === null),
    `use it ${round}: authorship and tallies hidden while voting`,
  );

  const own = await look(code, 0);
  const selfVote = await status(code, 0, {
    type: "vote",
    targetId: own.you.story.id,
  });
  assert(selfVote === 409, `use it ${round}: self-votes rejected`);

  for (let i = 0; i < PLAYERS; i++) {
    const mine = await look(code, i);
    const target = mine.storyBoard.find((s) => s.id !== mine.you.story.id);
    state = await act(code, i, { type: "vote", targetId: target.id });
  }
  assert(state.phase === "useit_result", `use it ${round}: scored`);
  assert(
    state.storyBoard.every((s) => s.authorId !== null && s.coinerId !== null),
    `use it ${round}: authorship and coiner revealed`,
  );
  assert(
    state.lastDeltas.some((d) => d.reason.includes("won the vote")) &&
      state.lastDeltas.some((d) => d.reason.includes("coined")),
    `use it ${round}: storyteller and coiner both scored`,
  );
  assert(
    state.lastDeltas.every((d) => d.points === 1),
    `use it ${round}: every award is worth exactly one point`,
  );

  return act(code, hostIndex, { type: "advance" });
}

const run = async () => {
  console.log(`Smoke testing ${BASE}`);

  const { code } = await api("/api/rooms");
  console.log(`\nRoom ${code}`);

  for (let i = 0; i < PLAYERS; i++) {
    await act(code, i, { type: "join", name: `Bot${i}`, avatar: i });
  }
  let state = await look(code, 0);
  assert(state.players.length === PLAYERS, `${PLAYERS} players joined`);
  assert(state.phase === "lobby", "in lobby");
  hostIndex = state.players.findIndex((p) => p.isHost);
  assert(hostIndex === 0, "first player is host");

  console.log("\nRound 1 — Category");
  state = await act(code, hostIndex, { type: "start_game" });
  assert(state.phase === "category", "round 1 started");
  assert(state.totalTurns === PLAYERS, "one turn per player");

  const judgesSeen = new Set();
  for (let turn = 1; turn <= PLAYERS; turn++) {
    judgesSeen.add((await look(code, 0)).judgeId);
    state = await playRoundOneTurn(code, turn);
  }
  assert(judgesSeen.size === PLAYERS, "every player judged exactly once");

  console.log("\nRound 2 — Use It!");
  const slangbook = (await look(code, 0)).slangbook;
  assert(
    slangbook.length === PLAYERS * (PLAYERS - 1),
    `slangbook holds all ${PLAYERS * (PLAYERS - 1)} played cards`,
  );
  const p0 = await look(code, 0);
  assert(
    p0.you.slangHand.every((card) => card.authorId !== p0.you.id),
    "you aren't dealt your own slang",
  );

  for (let round = 1; round <= 2; round++) {
    state = await playUseItRound(code, round);
  }

  console.log("\nWrap-up");
  assert(state.phase === "game_over", "game over after two Use It! rounds");
  const total = state.players.reduce((sum, p) => sum + p.score, 0);
  assert(total > 0, `points were awarded (${total} total)`);
  assert(
    state.slangbook.length === PLAYERS * (PLAYERS - 1),
    "full slangbook shown at the end",
  );

  state = await act(code, hostIndex, { type: "restart" });
  assert(state.phase === "lobby", "restart returns to lobby");
  assert(state.players.every((p) => p.score === 0), "scores reset");

  console.log("\nAuth & validation");
  const unauthenticated = await fetch(`${BASE}/api/rooms/${code}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "start_game" }),
  });
  assert(unauthenticated.status === 401, "unauthenticated writes rejected");
  const malformed = await status(code, 0, { type: "submit_pitch" });
  assert(malformed === 400, "malformed payloads rejected");
  const notHost = await status(code, 1, { type: "start_game" });
  assert(notHost === 409, "non-hosts can't start the game");
  const missingRoom = await fetch(`${BASE}/api/rooms/ZZZZZ`);
  assert(missingRoom.status === 404, "unknown rooms 404");

  console.log("\n✅ All smoke checks passed.");
};

run().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
