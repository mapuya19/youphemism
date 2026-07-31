/**
 * Shared domain types for Youphemism.
 *
 * Used by the server-authoritative engine (`src/lib/engine.ts`) and the React
 * client. Anything a player is allowed to see is produced by
 * `projectForPlayer()` in `src/lib/projection.ts`.
 */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;

/** Youphemism cards in hand during round 1. */
export const HAND_SIZE = 5;
/** USE IT! cards revealed each round-2 turn. */
export const USE_IT_COUNT = 4;
/** How many times the USE IT! round is played. */
export const USE_IT_ROUNDS = 2;

export const MAX_DEFINITION_LENGTH = 240;
export const MAX_STORY_LENGTH = 700;
export const MAX_NAME_LENGTH = 16;

export type Phase =
  | "lobby"
  /** Round 1: the judge's category is up; everyone else plays a card + defines it. */
  | "category"
  /** Round 1: all pitches are in; the judge picks a winner. */
  | "judging"
  /** Round 1: the winner is revealed before the judge rotates. */
  | "category_result"
  /** Round 2: pick a slang card + a USE IT! card and write the story. */
  | "useit"
  /** Round 2: everyone votes on the funniest story that isn't their own. */
  | "useit_vote"
  /** Round 2: reveal, award points to storyteller and original coiner. */
  | "useit_result"
  | "game_over";

export interface Player {
  id: string;
  name: string;
  avatar: number;
  isHost: boolean;
  /** One point per card won, exactly as in the physical game. */
  score: number;
  connected: boolean;
  lastSeenAt: number;
}

export interface Card {
  id: string;
  text: string;
}

/**
 * A Youphemism card that has been played and given a meaning. These are the
 * cards saved into the "defined pile" for round 2 — their meanings carry over.
 */
export interface SlangCard {
  id: string;
  /** Who invented the meaning in round 1. */
  authorId: string;
  /** The Youphemism card text, e.g. "zoo exhibit". */
  term: string;
  /** The category it was defined against, e.g. "senior pranks". */
  category: string;
  /** The invented meaning. */
  definition: string;
  /** Which round-1 turn it came from (1-indexed), for display. */
  turn: number;
}

/** A round-1 pitch, before the judge has decided. */
export interface Pitch {
  id: string;
  authorId: string;
  cardId: string;
  term: string;
  definition: string;
}

/** A round-2 story. */
export interface Story {
  id: string;
  authorId: string;
  /** The slang card from the player's dealt round-2 hand. */
  slangId: string;
  /** The shared USE IT! card the story hangs off. */
  useItId: string;
  text: string;
  votes: string[];
}

export interface ScoreDelta {
  playerId: string;
  points: number;
  reason: string;
}

export interface GameSettings {
  /** Seconds for round-1 pitch writing. */
  pitchSeconds: number;
  /** Seconds for the judge to decide. */
  judgeSeconds: number;
  /** Seconds for round-2 story writing. */
  storySeconds: number;
  /** Seconds for round-2 voting. */
  voteSeconds: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  pitchSeconds: 150,
  judgeSeconds: 90,
  storySeconds: 240,
  voteSeconds: 120,
};

export interface GameState {
  code: string;
  /** Monotonic revision; bumped on every mutation. Drives SSE diffing + CAS. */
  rev: number;
  createdAt: number;
  updatedAt: number;
  phase: Phase;
  settings: GameSettings;
  players: Player[];
  /** Deterministic PRNG state, so transitions are reproducible. */
  seed: number;

  /* Draw piles (card ids). */
  youphemismDeck: string[];
  categoryDeck: string[];
  useItDeck: string[];

  /** Round-1 hands: playerId -> Youphemism card ids. Private. */
  hands: Record<string, string[]>;

  /* Round 1 turn tracking. */
  /** Seat order; each player judges exactly once. */
  turnOrder: string[];
  /** Index into `turnOrder` of the current judge. */
  turnIndex: number;
  /** The category card the judge revealed this turn. */
  category: Card | null;
  /** This turn's pitches, keyed by author. */
  pitches: Record<string, Pitch>;
  /** Pitch id the judge chose this turn. */
  judgePick: string | null;

  /** Every card played in round 1, meanings intact. */
  definedPile: SlangCard[];

  /* Round 2 state. */
  /** Which USE IT! round we're on (1..USE_IT_ROUNDS). */
  useItRound: number;
  /** playerId -> slang card ids dealt from the defined pile. Private. */
  slangHands: Record<string, string[]>;
  /** Slang ids already spent this game, so a card can't be reused. */
  spentSlang: string[];
  /** The four shared USE IT! cards on the table. */
  useItCards: Card[];
  /** This turn's stories, keyed by author. */
  stories: Record<string, Story>;

  /** Epoch ms when the phase auto-advances; null = untimed. */
  deadline: number | null;
  lastDeltas: ScoreDelta[];
  log: { at: number; text: string }[];
}

/* ------------------------------------------------------------------ */
/* Client -> server actions                                           */
/* ------------------------------------------------------------------ */

export type Action =
  | { type: "join"; name: string; avatar: number }
  | { type: "leave" }
  | { type: "heartbeat" }
  | { type: "update_settings"; settings: Partial<GameSettings> }
  | { type: "start_game" }
  | { type: "submit_pitch"; cardId: string; definition: string }
  | { type: "judge_pick"; pitchId: string }
  | { type: "submit_story"; slangId: string; useItId: string; text: string }
  | { type: "vote"; targetId: string }
  | { type: "unvote" }
  | { type: "advance" }
  | { type: "restart" }
  | { type: "kick"; playerId: string };

/* ------------------------------------------------------------------ */
/* Server -> client projection                                        */
/* ------------------------------------------------------------------ */

export interface PublicPlayer extends Omit<Player, "lastSeenAt"> {
  /** Submitted for the current writing phase. */
  ready: boolean;
  hasVoted: boolean;
  isJudge: boolean;
  /** Cards left in hand (count only — contents are private). */
  handCount: number;
}

/** A pitch as shown to clients; `authorId` is null until the judge decides. */
export interface RevealedPitch {
  id: string;
  term: string;
  definition: string;
  authorId: string | null;
  won: boolean;
}

/** A story as shown to clients; `authorId` is null until votes are counted. */
export interface RevealedStory {
  id: string;
  useIt: string;
  term: string;
  definition: string;
  text: string;
  authorId: string | null;
  /** Who coined the slang used — revealed with the results. */
  coinerId: string | null;
  voteCount: number | null;
  voterIds: string[] | null;
  won: boolean;
}

export interface ClientView {
  code: string;
  rev: number;
  phase: Phase;
  settings: GameSettings;
  players: PublicPlayer[];

  /** Round 1 progress: turn `turn` of `totalTurns`. */
  turn: number;
  totalTurns: number;
  /** Round 2 progress. */
  useItRound: number;
  useItRounds: number;

  judgeId: string | null;
  category: Card | null;
  useItCards: Card[];

  you: {
    id: string;
    isHost: boolean;
    isJudge: boolean;
    /** Round-1 Youphemism cards in hand. */
    hand: Card[];
    /** Round-2 slang cards in hand (unspent). */
    slangHand: SlangCard[];
    pitch: Pitch | null;
    story: Story | null;
    votedFor: string | null;
  };

  pitchBoard: RevealedPitch[];
  storyBoard: RevealedStory[];

  /** The defined pile, revealed from round 2 onward — the group's Slangbook. */
  slangbook: SlangCard[];

  deadline: number | null;
  /** Server clock at projection time, so clients can correct drift. */
  serverNow: number;
  lastDeltas: ScoreDelta[];
  log: { at: number; text: string }[];
}
