/**
 * Authoritative, pure game engine for Youphemism.
 *
 * Every mutation goes through `applyAction`. The engine never performs I/O,
 * reads the clock, or calls `Math.random()` — `now` is a parameter and
 * randomness comes from the seeded PRNG in `rng.ts`. That makes the entire
 * ruleset deterministic and unit-testable.
 *
 * ---------------------------------------------------------------------------
 * RULES (follows the retail game; adaptation notes marked ▲)
 * ---------------------------------------------------------------------------
 * Setup
 *   Each player holds five YOUPHEMISM cards (ordinary things: "hot dog",
 *   "Ikea", "clown car"). Seat order is randomised and each player judges
 *   exactly once.
 *
 * Round 1 — Category
 *   The judge reveals one CATEGORY card ("senior pranks"). Every other player
 *   plays a card from their hand and invents slang that fits the category
 *   ("Ikea is the senior prank where you take apart all the furniture").
 *   The judge picks a winner: that's one point. Every card played is saved,
 *   meaning intact, into the defined pile. The judge then rotates left.
 *   Round 1 ends once everybody has judged once.
 *   ▲ Pitches are shown to the judge anonymously, then attributed — online
 *     there's no table to read, so this removes judge favouritism.
 *   ▲ Hands refill to five between turns; with more than six players you'd
 *     otherwise run out of cards mid-round.
 *
 * Round 2 — Use It!
 *   Everyone discards their remaining hand. The defined pile is dealt out
 *   evenly; those meanings stay exactly as they were. Four USE IT! cards are
 *   revealed. Each player pairs one slang card with one USE IT! card and tells
 *   a story; several players may share a USE IT! card. Everyone then votes for
 *   the funniest story that isn't their own.
 *   The winning storyteller scores a point — and so does whoever originally
 *   invented that slang in round 1. Ties: every tied entry wins.
 *   The USE IT! round is played twice, with four new cards the second time.
 *   ▲ Stories are revealed simultaneously and voted anonymously.
 *
 * Most points wins. (The physical rulebook settles ties with a dance battle;
 * here a tie is simply reported as a tie.)
 */

import { Card as CardData, DECK, getCategory, getUseIt, getYouphemism } from "./cards";
import { createRng, generateId, shuffle } from "./rng";
import {
  Action,
  Card,
  DEFAULT_SETTINGS,
  GameSettings,
  GameState,
  HAND_SIZE,
  MAX_DEFINITION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_STORY_LENGTH,
  MIN_PLAYERS,
  Pitch,
  Player,
  ScoreDelta,
  SlangCard,
  USE_IT_COUNT,
  USE_IT_ROUNDS,
} from "./types";

/** Seconds a results screen stays up before auto-advancing. */
const RESULTS_SECONDS = 40;
/** A player is considered disconnected after this long without a heartbeat. */
export const PRESENCE_TIMEOUT_MS = 25_000;

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

export function createGame(code: string, seed: number, now: number): GameState {
  const rng = createRng(seed);
  const youphemismDeck = shuffle(DECK.youphemisms, rng).map((c) => c.id);
  const categoryDeck = shuffle(DECK.categories, rng).map((c) => c.id);
  const useItDeck = shuffle(DECK.useIts, rng).map((c) => c.id);

  return {
    code,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    phase: "lobby",
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    seed: rng.seed,
    youphemismDeck,
    categoryDeck,
    useItDeck,
    hands: {},
    turnOrder: [],
    turnIndex: 0,
    category: null,
    pitches: {},
    judgePick: null,
    definedPile: [],
    useItRound: 0,
    slangHands: {},
    spentSlang: [],
    useItCards: [],
    stories: {},
    deadline: null,
    lastDeltas: [],
    log: [],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function log(state: GameState, now: number, text: string) {
  state.log = [...state.log, { at: now, text }].slice(-40);
}

const findPlayer = (state: GameState, id: string): Player | undefined =>
  state.players.find((p) => p.id === id);

function requirePlayer(state: GameState, id: string): Player {
  const player = findPlayer(state, id);
  if (!player) throw new RuleError("You are not in this room.");
  return player;
}

function requireHost(state: GameState, id: string): Player {
  const player = requirePlayer(state, id);
  if (!player.isHost) throw new RuleError("Only the host can do that.");
  return player;
}

function nameOf(state: GameState, id: string): string {
  return findPlayer(state, id)?.name ?? "Someone";
}

/** Draw `count` ids, reshuffling the source pile if we run dry. */
function draw(
  deck: string[],
  count: number,
  source: readonly CardData[],
  seed: number,
): { drawn: string[]; deck: string[]; seed: number } {
  let remaining = deck.slice();
  const drawn: string[] = [];
  let s = seed;
  while (drawn.length < count) {
    if (remaining.length === 0) {
      const rng = createRng(s);
      remaining = shuffle(source, rng).map((c) => c.id);
      s = rng.seed;
    }
    drawn.push(remaining.shift() as string);
  }
  return { drawn, deck: remaining, seed: s };
}

const clampText = (value: unknown, max: number): string =>
  typeof value !== "string" ? "" : value.replace(/\s+/g, " ").trim().slice(0, max);

function setPhase(
  state: GameState,
  phase: GameState["phase"],
  now: number,
  seconds: number | null,
) {
  state.phase = phase;
  state.deadline = seconds === null ? null : now + seconds * 1000;
}

function reassignHost(state: GameState) {
  if (state.players.some((p) => p.isHost && p.connected)) return;
  const next = state.players.find((p) => p.connected) ?? state.players[0];
  if (!next) return;
  state.players = state.players.map((p) => ({ ...p, isHost: p.id === next.id }));
}

function award(state: GameState, deltas: ScoreDelta[]) {
  const merged = new Map<string, number>();
  for (const d of deltas) merged.set(d.playerId, (merged.get(d.playerId) ?? 0) + d.points);
  state.players = state.players.map((p) => ({
    ...p,
    score: p.score + (merged.get(p.id) ?? 0),
  }));
  state.lastDeltas = deltas;
}

export const currentJudgeId = (state: GameState): string | null =>
  state.turnOrder[state.turnIndex] ?? null;

/* ------------------------------------------------------------------ */
/* Round 1 — Category                                                  */
/* ------------------------------------------------------------------ */

function refillHands(state: GameState) {
  for (const player of state.players) {
    const hand = state.hands[player.id] ?? [];
    if (hand.length >= HAND_SIZE) {
      state.hands[player.id] = hand;
      continue;
    }
    const pick = draw(
      state.youphemismDeck,
      HAND_SIZE - hand.length,
      DECK.youphemisms,
      state.seed,
    );
    state.youphemismDeck = pick.deck;
    state.seed = pick.seed;
    state.hands[player.id] = [...hand, ...pick.drawn];
  }
}

function beginRoundOne(state: GameState, now: number) {
  const rng = createRng(state.seed);
  state.turnOrder = shuffle(state.players, rng).map((p) => p.id);
  state.seed = rng.seed;
  state.turnIndex = 0;
  state.hands = {};
  state.definedPile = [];
  state.slangHands = {};
  state.spentSlang = [];
  state.stories = {};
  state.useItRound = 0;
  state.useItCards = [];
  refillHands(state);
  beginTurn(state, now);
}

function beginTurn(state: GameState, now: number) {
  refillHands(state);
  state.pitches = {};
  state.judgePick = null;
  state.lastDeltas = [];

  const pick = draw(state.categoryDeck, 1, DECK.categories, state.seed);
  state.categoryDeck = pick.deck;
  state.seed = pick.seed;
  const categoryId = pick.drawn[0] as string;
  state.category = { id: categoryId, text: getCategory(categoryId)?.text ?? categoryId };

  setPhase(state, "category", now, state.settings.pitchSeconds);
  const judge = currentJudgeId(state);
  log(
    state,
    now,
    `Turn ${state.turnIndex + 1}/${state.turnOrder.length} — ${judge ? nameOf(state, judge) : "someone"} judges “${state.category.text}”.`,
  );
}

function beginJudging(state: GameState, now: number) {
  if (Object.keys(state.pitches).length === 0) {
    // Nobody pitched — nothing to judge, so skip to the next turn.
    log(state, now, "No pitches that turn.");
    finishTurn(state, now);
    return;
  }
  setPhase(state, "judging", now, state.settings.judgeSeconds);
  log(state, now, "Pitches are in — over to the judge.");
}

/** Resolve the judge's choice (or pick for them if they timed out). */
function resolveJudging(state: GameState, now: number) {
  const pitches = Object.values(state.pitches);
  if (pitches.length === 0) {
    finishTurn(state, now);
    return;
  }

  if (!state.judgePick) {
    const rng = createRng(state.seed);
    const fallback = pitches[Math.floor(rng.next() * pitches.length)] as Pitch;
    state.seed = rng.seed;
    state.judgePick = fallback.id;
    log(state, now, "The judge ran out of time, so the deck decided.");
  }

  const winner = pitches.find((p) => p.id === state.judgePick);
  if (winner) {
    award(state, [
      {
        playerId: winner.authorId,
        points: 1,
        reason: `won “${state.category?.text ?? "the category"}” with ${winner.term}`,
      },
    ]);
    log(state, now, `${nameOf(state, winner.authorId)} takes the category card.`);
  }

  setPhase(state, "category_result", now, RESULTS_SECONDS);
}

/** Save this turn's cards into the defined pile and rotate the judge. */
function finishTurn(state: GameState, now: number) {
  const turn = state.turnIndex + 1;
  for (const pitch of Object.values(state.pitches)) {
    state.definedPile.push({
      id: pitch.id,
      authorId: pitch.authorId,
      term: pitch.term,
      category: state.category?.text ?? "",
      definition: pitch.definition,
      turn,
    });
  }
  state.pitches = {};
  state.judgePick = null;
  state.category = null;

  state.turnIndex += 1;
  if (state.turnIndex >= state.turnOrder.length) {
    beginRoundTwo(state, now);
  } else {
    beginTurn(state, now);
  }
}

/* ------------------------------------------------------------------ */
/* Round 2 — Use It!                                                   */
/* ------------------------------------------------------------------ */

/**
 * Deal the defined pile out evenly. We prefer not to hand a player their own
 * slang — they'd otherwise collect both points for one story — but fall back to
 * it rather than leave anyone short.
 */
function dealDefinedPile(state: GameState) {
  const rng = createRng(state.seed);
  const pool = shuffle(state.definedPile, rng);
  state.seed = rng.seed;

  const ids = state.turnOrder.filter((id) => findPlayer(state, id));
  const hands: Record<string, string[]> = {};
  for (const id of ids) hands[id] = [];
  if (ids.length === 0) {
    state.slangHands = hands;
    return;
  }

  const perPlayer = Math.floor(pool.length / ids.length);
  const remaining = [...pool];

  for (let slot = 0; slot < perPlayer; slot++) {
    for (const playerId of ids) {
      // Prefer someone else's card; take any card if that's all that's left.
      let index = remaining.findIndex((card) => card.authorId !== playerId);
      if (index === -1) index = 0;
      const card = remaining.splice(index, 1)[0];
      if (card) hands[playerId]!.push(card.id);
    }
  }

  state.slangHands = hands;
}

function beginRoundTwo(state: GameState, now: number) {
  state.hands = {};
  dealDefinedPile(state);

  const shortest = Math.min(
    ...Object.values(state.slangHands).map((hand) => hand.length),
    Infinity,
  );
  if (!Number.isFinite(shortest) || shortest < 1) {
    endGame(state, now);
    return;
  }

  state.useItRound = 0;
  state.spentSlang = [];
  beginUseItRound(state, now);
}

function beginUseItRound(state: GameState, now: number) {
  state.useItRound += 1;
  state.stories = {};
  state.lastDeltas = [];

  const pick = draw(state.useItDeck, USE_IT_COUNT, DECK.useIts, state.seed);
  state.useItDeck = pick.deck;
  state.seed = pick.seed;
  state.useItCards = pick.drawn.map((id) => ({
    id,
    text: getUseIt(id)?.text ?? id,
  }));

  setPhase(state, "useit", now, state.settings.storySeconds);
  log(
    state,
    now,
    `Round 2 — Use It! (${state.useItRound}/${USE_IT_ROUNDS}). Pair a card with a prompt.`,
  );
}

function beginUseItVote(state: GameState, now: number) {
  const stories = Object.values(state.stories);
  if (stories.length === 0) {
    log(state, now, "No stories that round.");
    finishUseItRound(state, now);
    return;
  }
  if (stories.length === 1) {
    // A single story can't be voted on; award it and move on.
    scoreUseItRound(state, now);
    return;
  }
  for (const story of stories) story.votes = [];
  setPhase(state, "useit_vote", now, state.settings.voteSeconds);
  log(state, now, "Stories told — vote for the funniest.");
}

function scoreUseItRound(state: GameState, now: number) {
  const stories = Object.values(state.stories);
  const slangById = new Map(state.definedPile.map((card) => [card.id, card]));
  const top = Math.max(0, ...stories.map((s) => s.votes.length));
  const deltas: ScoreDelta[] = [];

  if (top > 0) {
    for (const story of stories.filter((s) => s.votes.length === top)) {
      deltas.push({
        playerId: story.authorId,
        points: 1,
        reason: "won the vote — takes the USE IT! card",
      });
      const coined = slangById.get(story.slangId);
      if (coined) {
        deltas.push({
          playerId: coined.authorId,
          points: 1,
          reason: `coined “${coined.term}”, used in the winning story`,
        });
      }
    }
  }

  award(state, deltas);
  setPhase(state, "useit_result", now, RESULTS_SECONDS);
  log(state, now, `Use It! round ${state.useItRound} scored.`);
}

function finishUseItRound(state: GameState, now: number) {
  for (const story of Object.values(state.stories)) {
    state.spentSlang = [...new Set([...state.spentSlang, story.slangId])];
  }
  state.stories = {};
  state.useItCards = [];

  const anyoneCanPlayAgain = Object.entries(state.slangHands).some(
    ([, hand]) => hand.filter((id) => !state.spentSlang.includes(id)).length > 0,
  );

  if (state.useItRound >= USE_IT_ROUNDS || !anyoneCanPlayAgain) {
    endGame(state, now);
  } else {
    beginUseItRound(state, now);
  }
}

function endGame(state: GameState, now: number) {
  setPhase(state, "game_over", now, null);
  const top = Math.max(0, ...state.players.map((p) => p.score));
  const winners = state.players.filter((p) => p.score === top && top > 0);
  log(
    state,
    now,
    winners.length === 1
      ? `${winners[0]!.name} wins with ${top} point${top === 1 ? "" : "s"}!`
      : winners.length > 1
        ? `Tie at ${top}: ${winners.map((w) => w.name).join(", ")}.`
        : "Game over.",
  );
}

/* ------------------------------------------------------------------ */
/* Phase progression                                                   */
/* ------------------------------------------------------------------ */

function advancePhase(state: GameState, now: number) {
  switch (state.phase) {
    case "category":
      beginJudging(state, now);
      break;
    case "judging":
      resolveJudging(state, now);
      break;
    case "category_result":
      finishTurn(state, now);
      break;
    case "useit":
      beginUseItVote(state, now);
      break;
    case "useit_vote":
      scoreUseItRound(state, now);
      break;
    case "useit_result":
      finishUseItRound(state, now);
      break;
    default:
      throw new RuleError("Nothing to advance right now.");
  }
}

export const isWritingPhase = (phase: GameState["phase"]) =>
  phase === "category" || phase === "useit";

export const isVotingPhase = (phase: GameState["phase"]) => phase === "useit_vote";

export function hasSubmitted(state: GameState, playerId: string): boolean {
  if (state.phase === "category") return Boolean(state.pitches[playerId]);
  if (state.phase === "useit") return Boolean(state.stories[playerId]);
  return false;
}

export function votedFor(state: GameState, playerId: string): string | null {
  if (state.phase !== "useit_vote" && state.phase !== "useit_result") return null;
  return (
    Object.values(state.stories).find((s) => s.votes.includes(playerId))?.id ?? null
  );
}

/** Players expected to act in the current phase. */
function pendingPlayers(state: GameState): Player[] {
  const connected = state.players.filter((p) => p.connected);
  if (state.phase === "category") {
    const judge = currentJudgeId(state);
    return connected.filter((p) => p.id !== judge && !hasSubmitted(state, p.id));
  }
  if (state.phase === "useit") {
    return connected.filter((p) => !hasSubmitted(state, p.id));
  }
  if (state.phase === "useit_vote") {
    const stories = Object.values(state.stories);
    return connected.filter(
      (p) =>
        stories.some((s) => s.authorId !== p.id) && votedFor(state, p.id) === null,
    );
  }
  return [];
}

export const pendingPlayerIds = (state: GameState): string[] =>
  pendingPlayers(state).map((p) => p.id);

/** Advance as soon as everyone who can act has acted. */
function maybeAutoAdvance(state: GameState, now: number) {
  if (!isWritingPhase(state.phase) && !isVotingPhase(state.phase)) return;

  const connected = state.players.filter((p) => p.connected);
  if (connected.length === 0) return;

  if (state.phase === "category") {
    const judge = currentJudgeId(state);
    const contenders = connected.filter((p) => p.id !== judge);
    if (contenders.length > 0 && contenders.every((p) => hasSubmitted(state, p.id))) {
      advancePhase(state, now);
    }
    return;
  }

  if (pendingPlayers(state).length === 0) advancePhase(state, now);
}

/* ------------------------------------------------------------------ */
/* Timers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lazily enforce presence and phase deadlines. Called on every read and write,
 * so no cron job or long-lived process is needed. Returns true if state changed.
 */
export function tick(state: GameState, now: number): boolean {
  let changed = false;

  for (const player of state.players) {
    const connected = now - player.lastSeenAt < PRESENCE_TIMEOUT_MS;
    if (connected !== player.connected) {
      player.connected = connected;
      changed = true;
    }
  }
  if (changed) reassignHost(state);

  // Deadlines can cascade (vote -> results -> next round), so loop with a bound.
  for (let guard = 0; guard < 8; guard++) {
    if (state.deadline === null || now < state.deadline) break;
    advancePhase(state, now);
    changed = true;
  }

  if (changed) {
    state.rev += 1;
    state.updatedAt = now;
  }
  return changed;
}

/* ------------------------------------------------------------------ */
/* Action dispatch                                                     */
/* ------------------------------------------------------------------ */

export function applyAction(
  state: GameState,
  playerId: string,
  action: Action,
  now: number,
): GameState {
  switch (action.type) {
    case "join": {
      const existing = findPlayer(state, playerId);
      const name = clampText(action.name, MAX_NAME_LENGTH) || "Anon";
      if (existing) {
        existing.name = name;
        existing.avatar = action.avatar;
        existing.connected = true;
        existing.lastSeenAt = now;
        break;
      }
      if (state.phase !== "lobby") throw new RuleError("That game is already in progress.");
      if (state.players.length >= MAX_PLAYERS) {
        throw new RuleError(`This room is full (${MAX_PLAYERS} players max).`);
      }
      if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new RuleError("Someone in the room already has that name.");
      }
      state.players.push({
        id: playerId,
        name,
        avatar: action.avatar,
        isHost: state.players.length === 0,
        score: 0,
        connected: true,
        lastSeenAt: now,
      });
      log(state, now, `${name} joined.`);
      reassignHost(state);
      break;
    }

    case "heartbeat": {
      const player = requirePlayer(state, playerId);
      player.lastSeenAt = now;
      player.connected = true;
      reassignHost(state);
      break;
    }

    case "leave": {
      const player = findPlayer(state, playerId);
      if (!player) return state;
      if (state.phase === "lobby") {
        state.players = state.players.filter((p) => p.id !== playerId);
      } else {
        player.connected = false;
        player.lastSeenAt = 0;
      }
      log(state, now, `${player.name} left.`);
      reassignHost(state);
      if (state.phase !== "lobby") maybeAutoAdvance(state, now);
      break;
    }

    case "kick": {
      requireHost(state, playerId);
      if (action.playerId === playerId) throw new RuleError("You can't kick yourself.");
      const target = findPlayer(state, action.playerId);
      if (!target) throw new RuleError("No such player.");
      state.players = state.players.filter((p) => p.id !== action.playerId);
      delete state.hands[action.playerId];
      delete state.pitches[action.playerId];
      delete state.stories[action.playerId];
      log(state, now, `${target.name} was removed.`);
      reassignHost(state);
      break;
    }

    case "update_settings": {
      requireHost(state, playerId);
      if (state.phase !== "lobby") throw new RuleError("Settings lock once the game starts.");
      state.settings = sanitizeSettings({ ...state.settings, ...action.settings });
      break;
    }

    case "start_game": {
      requireHost(state, playerId);
      if (state.phase !== "lobby") throw new RuleError("The game has already started.");
      if (state.players.length < MIN_PLAYERS) {
        throw new RuleError(`You need at least ${MIN_PLAYERS} players.`);
      }
      state.players = state.players.map((p) => ({ ...p, score: 0 }));
      beginRoundOne(state, now);
      break;
    }

    case "submit_pitch": {
      const player = requirePlayer(state, playerId);
      if (state.phase !== "category") throw new RuleError("It's not pitching time.");
      if (currentJudgeId(state) === playerId) {
        throw new RuleError("You're judging this turn — sit back and read.");
      }
      const hand = state.hands[playerId] ?? [];
      if (!hand.includes(action.cardId)) {
        throw new RuleError("That card isn't in your hand.");
      }
      const definition = clampText(action.definition, MAX_DEFINITION_LENGTH);
      if (definition.length < 5) throw new RuleError("Give your slang a real meaning.");

      state.pitches[playerId] = {
        id: state.pitches[playerId]?.id ?? `pi_${generateId(8)}`,
        authorId: playerId,
        cardId: action.cardId,
        term: getYouphemism(action.cardId)?.text ?? action.cardId,
        definition,
      };
      log(state, now, `${player.name} played a card.`);
      maybeAutoAdvance(state, now);
      break;
    }

    case "judge_pick": {
      requirePlayer(state, playerId);
      if (state.phase !== "judging") throw new RuleError("There's nothing to judge yet.");
      if (currentJudgeId(state) !== playerId) throw new RuleError("You're not the judge.");
      const pitch = Object.values(state.pitches).find((p) => p.id === action.pitchId);
      if (!pitch) throw new RuleError("That pitch doesn't exist.");
      state.judgePick = pitch.id;
      resolveJudging(state, now);
      break;
    }

    case "submit_story": {
      const player = requirePlayer(state, playerId);
      if (state.phase !== "useit") throw new RuleError("It's not Use It! time.");
      const hand = (state.slangHands[playerId] ?? []).filter(
        (id) => !state.spentSlang.includes(id),
      );
      if (!hand.includes(action.slangId)) {
        throw new RuleError("That slang card isn't in your hand.");
      }
      if (!state.useItCards.some((card) => card.id === action.useItId)) {
        throw new RuleError("Pick one of the four USE IT! cards on the table.");
      }
      const text = clampText(action.text, MAX_STORY_LENGTH);
      if (text.length < 20) throw new RuleError("Your story needs at least 20 characters.");

      state.stories[playerId] = {
        id: state.stories[playerId]?.id ?? `st_${generateId(8)}`,
        authorId: playerId,
        slangId: action.slangId,
        useItId: action.useItId,
        text,
        votes: [],
      };
      log(state, now, `${player.name} told a story.`);
      maybeAutoAdvance(state, now);
      break;
    }

    case "vote": {
      requirePlayer(state, playerId);
      if (state.phase !== "useit_vote") throw new RuleError("There's nothing to vote on.");
      const stories = Object.values(state.stories);
      const target = stories.find((s) => s.id === action.targetId);
      if (!target) throw new RuleError("That story doesn't exist.");
      if (target.authorId === playerId) throw new RuleError("You can't vote for your own.");
      for (const story of stories) story.votes = story.votes.filter((v) => v !== playerId);
      target.votes.push(playerId);
      maybeAutoAdvance(state, now);
      break;
    }

    case "unvote": {
      requirePlayer(state, playerId);
      if (state.phase !== "useit_vote") throw new RuleError("There's nothing to vote on.");
      for (const story of Object.values(state.stories)) {
        story.votes = story.votes.filter((v) => v !== playerId);
      }
      break;
    }

    case "advance": {
      requireHost(state, playerId);
      advancePhase(state, now);
      break;
    }

    case "restart": {
      requireHost(state, playerId);
      if (state.phase !== "game_over") throw new RuleError("Finish this game first.");
      state.players = state.players.map((p) => ({ ...p, score: 0 }));
      state.hands = {};
      state.pitches = {};
      state.stories = {};
      state.definedPile = [];
      state.slangHands = {};
      state.spentSlang = [];
      state.useItCards = [];
      state.useItRound = 0;
      state.turnIndex = 0;
      state.category = null;
      state.judgePick = null;
      state.lastDeltas = [];
      setPhase(state, "lobby", now, null);
      log(state, now, "Back to the lobby.");
      break;
    }

    default: {
      const never: never = action;
      throw new RuleError(`Unknown action: ${JSON.stringify(never)}`);
    }
  }

  state.rev += 1;
  state.updatedAt = now;
  return state;
}

export function sanitizeSettings(input: GameSettings): GameSettings {
  const clamp = (v: number, min: number, max: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
  return {
    pitchSeconds: clamp(input.pitchSeconds, 30, 600, DEFAULT_SETTINGS.pitchSeconds),
    judgeSeconds: clamp(input.judgeSeconds, 20, 600, DEFAULT_SETTINGS.judgeSeconds),
    storySeconds: clamp(input.storySeconds, 60, 900, DEFAULT_SETTINGS.storySeconds),
    voteSeconds: clamp(input.voteSeconds, 20, 600, DEFAULT_SETTINGS.voteSeconds),
  };
}

/** Convenience for the projection layer. */
export const handCards = (state: GameState, playerId: string): Card[] =>
  (state.hands[playerId] ?? []).map((id) => ({
    id,
    text: getYouphemism(id)?.text ?? id,
  }));

export const slangHandCards = (state: GameState, playerId: string): SlangCard[] => {
  const byId = new Map(state.definedPile.map((card) => [card.id, card]));
  return (state.slangHands[playerId] ?? [])
    .filter((id) => !state.spentSlang.includes(id))
    .map((id) => byId.get(id))
    .filter((card): card is SlangCard => Boolean(card));
};

export type { GameSettings };
