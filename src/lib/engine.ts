/**
 * Authoritative, pure game engine for Youphemism.
 *
 * Every mutation goes through `applyAction`. The engine never touches I/O,
 * `Date.now()`, or `Math.random()` (except via an injected seed), which makes
 * the whole ruleset deterministic and unit-testable.
 *
 * ---------------------------------------------------------------------------
 * RULES (digital adaptation)
 * ---------------------------------------------------------------------------
 * Round 1 — "Coin It"
 *   Each player is dealt one common Phrase and two absurd Category cards.
 *   They pick a category and invent a new slang term + definition that
 *   redefines the phrase through that category. Everything is revealed at
 *   once, anonymously, and everyone votes for their favourite (not their own).
 *   Each vote is worth `coinVotePoints`.
 *
 * Round 2 — "Story Time"
 *   Every slang term created in round 1 goes into the Slangbook. Each player
 *   receives a story prompt plus three slang entries written by *other*
 *   players, and must write a short story that uses all of them. Stories are
 *   revealed anonymously and voted on. Each vote is worth `storyVotePoints`
 *   to the storyteller, plus `callbackPoints` to the author of every slang
 *   term the story used — so inventing memorable slang keeps paying off.
 *
 * Most points wins.
 */

import { DECK, getCategory, getPhrase, getPrompt } from "./cards";
import { createRng, generateId, shuffle } from "./rng";
import {
  Action,
  CATEGORIES_PER_PLAYER,
  DEFAULT_SETTINGS,
  GameSettings,
  GameState,
  MAX_DEFINITION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_SLANG_LENGTH,
  MAX_STORY_LENGTH,
  MIN_PLAYERS,
  Player,
  ScoreDelta,
  SLANG_PER_STORY,
  SlangEntry,
  StoryEntry,
} from "./types";

/** Seconds a results/scoreboard screen stays up before auto-advancing. */
const RESULTS_SECONDS = 45;
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
  const state: GameState = {
    code,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    phase: "lobby",
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    seed: rng.seed,
    phraseDeck: shuffle(DECK.phrases, rng).map((c) => c.id),
    categoryDeck: shuffle(DECK.categories, rng).map((c) => c.id),
    promptDeck: shuffle(DECK.prompts, rng).map((c) => c.id),
    hands: {},
    slang: {},
    assignments: {},
    prompts: {},
    stories: {},
    deadline: null,
    lastDeltas: [],
    log: [],
  };
  state.seed = rng.seed;
  return state;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function log(state: GameState, now: number, text: string) {
  state.log = [...state.log, { at: now, text }].slice(-40);
}

function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

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

/** Draw `count` ids from a deck, reshuffling from the full source if empty. */
function draw(
  deck: string[],
  count: number,
  source: readonly { id: string }[],
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

function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function setPhase(
  state: GameState,
  phase: GameState["phase"],
  now: number,
  seconds: number | null,
) {
  state.phase = phase;
  state.deadline = seconds === null ? null : now + seconds * 1000;
}

/** Ensure exactly one connected host exists. */
function reassignHost(state: GameState) {
  if (state.players.some((p) => p.isHost && p.connected)) return;
  const next = state.players.find((p) => p.connected) ?? state.players[0];
  if (!next) return;
  state.players = state.players.map((p) => ({ ...p, isHost: p.id === next.id }));
}

function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.connected);
}

/* ------------------------------------------------------------------ */
/* Phase transitions                                                   */
/* ------------------------------------------------------------------ */

function beginCoinPhase(state: GameState, now: number) {
  state.hands = {};
  state.slang = {};
  state.assignments = {};
  state.prompts = {};
  state.stories = {};
  state.lastDeltas = [];

  for (const player of state.players) {
    const phrasePick = draw(state.phraseDeck, 1, DECK.phrases, state.seed);
    state.phraseDeck = phrasePick.deck;
    const catPick = draw(
      state.categoryDeck,
      CATEGORIES_PER_PLAYER,
      DECK.categories,
      phrasePick.seed,
    );
    state.categoryDeck = catPick.deck;
    state.seed = catPick.seed;

    const phraseId = phrasePick.drawn[0] as string;
    state.hands[player.id] = {
      phrase: { id: phraseId, text: getPhrase(phraseId)?.text ?? phraseId },
      categories: catPick.drawn.map((id) => ({
        id,
        text: getCategory(id)?.text ?? id,
      })),
    };
  }

  setPhase(state, "coin", now, state.settings.coinSeconds);
  log(state, now, "Round 1 — Coin It. Redefine your phrase!");
}

function beginCoinVote(state: GameState, now: number) {
  const entries = Object.values(state.slang);
  if (entries.length < 2) {
    // Not enough material to vote on — skip straight to results.
    scoreCoinRound(state, now);
    return;
  }
  for (const entry of entries) entry.votes = [];
  setPhase(state, "coin_vote", now, state.settings.voteSeconds);
  log(state, now, "Everything's revealed — vote for your favourite slang.");
}

function scoreCoinRound(state: GameState, now: number) {
  const deltas: ScoreDelta[] = [];
  for (const entry of Object.values(state.slang)) {
    const points = entry.votes.length * state.settings.coinVotePoints;
    if (points > 0) {
      deltas.push({
        playerId: entry.authorId,
        points,
        reason: `${entry.votes.length} vote${entry.votes.length === 1 ? "" : "s"} for “${entry.term}”`,
      });
    }
  }
  applyDeltas(state, deltas);
  setPhase(state, "coin_results", now, RESULTS_SECONDS);
  log(state, now, "Round 1 scored.");
}

function beginStoryPhase(state: GameState, now: number) {
  const entries = Object.values(state.slang);
  if (entries.length < 2) {
    endGame(state, now);
    return;
  }

  state.stories = {};
  state.assignments = {};
  state.prompts = {};
  state.lastDeltas = [];

  // Rotate the slangbook so each player receives other people's terms and
  // every term gets roughly equal airtime.
  const rng = createRng(state.seed);
  const pool = shuffle(entries, rng);
  state.seed = rng.seed;

  const players = state.players;
  const perStory = Math.min(SLANG_PER_STORY, Math.max(1, pool.length - 1));

  players.forEach((player, playerIndex) => {
    const picked: string[] = [];
    for (let step = 0; step < pool.length && picked.length < perStory; step++) {
      const candidate = pool[(playerIndex * perStory + step) % pool.length] as SlangEntry;
      if (candidate.authorId === player.id) continue;
      if (picked.includes(candidate.id)) continue;
      picked.push(candidate.id);
    }
    state.assignments[player.id] = picked;

    const promptPick = draw(state.promptDeck, 1, DECK.prompts, state.seed);
    state.promptDeck = promptPick.deck;
    state.seed = promptPick.seed;
    const promptId = promptPick.drawn[0] as string;
    state.prompts[player.id] = getPrompt(promptId)?.text ?? promptId;
  });

  setPhase(state, "story", now, state.settings.storySeconds);
  log(state, now, "Round 2 — Story Time. Work the slang in!");
}

function beginStoryVote(state: GameState, now: number) {
  const stories = Object.values(state.stories);
  if (stories.length < 2) {
    scoreStoryRound(state, now);
    return;
  }
  for (const story of stories) story.votes = [];
  setPhase(state, "story_vote", now, state.settings.voteSeconds);
  log(state, now, "Stories are in — vote for the best one.");
}

function scoreStoryRound(state: GameState, now: number) {
  const deltas: ScoreDelta[] = [];
  for (const story of Object.values(state.stories)) {
    const voteCount = story.votes.length;
    if (voteCount === 0) continue;
    deltas.push({
      playerId: story.authorId,
      points: voteCount * state.settings.storyVotePoints,
      reason: `${voteCount} vote${voteCount === 1 ? "" : "s"} for their story`,
    });
    for (const slangId of story.slangIds) {
      const entry = Object.values(state.slang).find((s) => s.id === slangId);
      if (!entry || entry.authorId === story.authorId) continue;
      deltas.push({
        playerId: entry.authorId,
        points: voteCount * state.settings.callbackPoints,
        reason: `callback: “${entry.term}” used in a winning story`,
      });
    }
  }
  applyDeltas(state, deltas);
  setPhase(state, "story_results", now, RESULTS_SECONDS);
  log(state, now, "Round 2 scored.");
}

function applyDeltas(state: GameState, deltas: ScoreDelta[]) {
  const merged = new Map<string, number>();
  for (const d of deltas) merged.set(d.playerId, (merged.get(d.playerId) ?? 0) + d.points);
  state.players = state.players.map((p) => ({
    ...p,
    score: p.score + (merged.get(p.id) ?? 0),
  }));
  state.lastDeltas = deltas;
}

function endGame(state: GameState, now: number) {
  setPhase(state, "game_over", now, null);
  const winner = [...state.players].sort((a, b) => b.score - a.score)[0];
  log(state, now, winner ? `${winner.name} wins with ${winner.score} points!` : "Game over.");
}

/** Move the game forward one step from whatever phase it is in. */
function advancePhase(state: GameState, now: number) {
  switch (state.phase) {
    case "coin":
      beginCoinVote(state, now);
      break;
    case "coin_vote":
      scoreCoinRound(state, now);
      break;
    case "coin_results":
      beginStoryPhase(state, now);
      break;
    case "story":
      beginStoryVote(state, now);
      break;
    case "story_vote":
      scoreStoryRound(state, now);
      break;
    case "story_results":
      endGame(state, now);
      break;
    default:
      throw new RuleError("Nothing to advance right now.");
  }
}

/* ------------------------------------------------------------------ */
/* Readiness checks                                                    */
/* ------------------------------------------------------------------ */

export function isWritingPhase(phase: GameState["phase"]) {
  return phase === "coin" || phase === "story";
}

export function isVotingPhase(phase: GameState["phase"]) {
  return phase === "coin_vote" || phase === "story_vote";
}

export function hasSubmitted(state: GameState, playerId: string): boolean {
  if (state.phase === "coin") return Boolean(state.slang[playerId]);
  if (state.phase === "story") return Boolean(state.stories[playerId]);
  return false;
}

export function votedFor(state: GameState, playerId: string): string | null {
  const pool =
    state.phase === "coin_vote" || state.phase === "coin_results"
      ? Object.values(state.slang)
      : state.phase === "story_vote" || state.phase === "story_results"
        ? Object.values(state.stories)
        : [];
  const found = (pool as { id: string; votes: string[] }[]).find((e) =>
    e.votes.includes(playerId),
  );
  return found?.id ?? null;
}

/** Auto-advance when everyone who *can* act has acted. */
function maybeAutoAdvance(state: GameState, now: number) {
  const eligible = activePlayers(state);
  if (eligible.length === 0) return;

  if (isWritingPhase(state.phase)) {
    if (eligible.every((p) => hasSubmitted(state, p.id))) advancePhase(state, now);
    return;
  }

  if (isVotingPhase(state.phase)) {
    const entries =
      state.phase === "coin_vote"
        ? (Object.values(state.slang) as { authorId: string }[])
        : (Object.values(state.stories) as { authorId: string }[]);
    // A player can only vote if there is at least one entry that isn't theirs.
    const canVote = eligible.filter((p) => entries.some((e) => e.authorId !== p.id));
    if (canVote.length > 0 && canVote.every((p) => votedFor(state, p.id) !== null)) {
      advancePhase(state, now);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Timers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lazily enforce phase deadlines. Called on every read and write so no cron
 * job or long-lived process is required — a design that suits serverless.
 * Returns true if the state changed.
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

  // Deadlines can cascade (e.g. vote -> results), so loop with a bound.
  for (let guard = 0; guard < 6; guard++) {
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
      if (state.phase !== "lobby") {
        throw new RuleError("That game is already in progress.");
      }
      if (state.players.length >= MAX_PLAYERS) {
        throw new RuleError(`This room is full (${MAX_PLAYERS} players max).`);
      }
      if (
        state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())
      ) {
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
      delete state.slang[action.playerId];
      delete state.stories[action.playerId];
      log(state, now, `${target.name} was removed.`);
      reassignHost(state);
      break;
    }

    case "update_settings": {
      requireHost(state, playerId);
      if (state.phase !== "lobby") throw new RuleError("Settings are locked once the game starts.");
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
      beginCoinPhase(state, now);
      break;
    }

    case "submit_slang": {
      const player = requirePlayer(state, playerId);
      if (state.phase !== "coin") throw new RuleError("It's not time to write slang.");
      const hand = state.hands[playerId];
      if (!hand) throw new RuleError("You have no cards this round.");
      const category = hand.categories.find((c) => c.id === action.categoryId);
      if (!category) throw new RuleError("Pick one of your own category cards.");
      const term = clampText(action.term, MAX_SLANG_LENGTH);
      const definition = clampText(action.definition, MAX_DEFINITION_LENGTH);
      if (term.length < 2) throw new RuleError("Your slang needs at least 2 characters.");
      if (definition.length < 5) throw new RuleError("Give your slang a real definition.");

      state.slang[playerId] = {
        id: state.slang[playerId]?.id ?? `sl_${generateId(8)}`,
        authorId: playerId,
        phrase: hand.phrase.text,
        category: category.text,
        term,
        definition,
        votes: [],
      };
      log(state, now, `${player.name} coined something.`);
      maybeAutoAdvance(state, now);
      break;
    }

    case "submit_story": {
      const player = requirePlayer(state, playerId);
      if (state.phase !== "story") throw new RuleError("It's not story time.");
      const text = clampText(action.text, MAX_STORY_LENGTH);
      if (text.length < 20) throw new RuleError("Your story needs at least 20 characters.");
      const slangIds = state.assignments[playerId] ?? [];
      state.stories[playerId] = {
        id: state.stories[playerId]?.id ?? `st_${generateId(8)}`,
        authorId: playerId,
        prompt: state.prompts[playerId] ?? "",
        slangIds,
        text,
        votes: [],
      };
      log(state, now, `${player.name} filed a story.`);
      maybeAutoAdvance(state, now);
      break;
    }

    case "vote": {
      requirePlayer(state, playerId);
      if (!isVotingPhase(state.phase)) throw new RuleError("There's nothing to vote on.");
      const entries: (SlangEntry | StoryEntry)[] =
        state.phase === "coin_vote"
          ? Object.values(state.slang)
          : Object.values(state.stories);
      const target = entries.find((e) => e.id === action.targetId);
      if (!target) throw new RuleError("That entry doesn't exist.");
      if (target.authorId === playerId) throw new RuleError("You can't vote for your own.");
      for (const entry of entries) {
        entry.votes = entry.votes.filter((v) => v !== playerId);
      }
      target.votes.push(playerId);
      maybeAutoAdvance(state, now);
      break;
    }

    case "unvote": {
      requirePlayer(state, playerId);
      if (!isVotingPhase(state.phase)) throw new RuleError("There's nothing to vote on.");
      const entries: (SlangEntry | StoryEntry)[] =
        state.phase === "coin_vote"
          ? Object.values(state.slang)
          : Object.values(state.stories);
      for (const entry of entries) {
        entry.votes = entry.votes.filter((v) => v !== playerId);
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
      state.slang = {};
      state.stories = {};
      state.assignments = {};
      state.prompts = {};
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
    coinSeconds: clamp(input.coinSeconds, 30, 600, DEFAULT_SETTINGS.coinSeconds),
    storySeconds: clamp(input.storySeconds, 60, 900, DEFAULT_SETTINGS.storySeconds),
    voteSeconds: clamp(input.voteSeconds, 20, 600, DEFAULT_SETTINGS.voteSeconds),
    coinVotePoints: clamp(input.coinVotePoints, 1, 10, DEFAULT_SETTINGS.coinVotePoints),
    storyVotePoints: clamp(input.storyVotePoints, 1, 10, DEFAULT_SETTINGS.storyVotePoints),
    callbackPoints: clamp(input.callbackPoints, 0, 10, DEFAULT_SETTINGS.callbackPoints),
  };
}
