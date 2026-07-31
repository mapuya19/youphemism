/**
 * Shared domain types for Youphemism.
 *
 * These types are used by both the server-authoritative game engine
 * (`src/lib/engine.ts`) and the React client. Anything the client is allowed
 * to see is produced by `projectForPlayer()` in `src/lib/projection.ts`.
 */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const MAX_SLANG_LENGTH = 60;
export const MAX_DEFINITION_LENGTH = 220;
export const MAX_STORY_LENGTH = 700;
export const MAX_NAME_LENGTH = 16;

/** How many category cards a player may choose between in the coin phase. */
export const CATEGORIES_PER_PLAYER = 2;
/** How many other players' slang entries a player must work into their story. */
export const SLANG_PER_STORY = 3;

export type Phase =
  | "lobby"
  /** Round 1: everyone privately invents slang for their phrase + category. */
  | "coin"
  /** Round 1: submissions are revealed and voted on. */
  | "coin_vote"
  /** Round 1: results / scoreboard beat. */
  | "coin_results"
  /** Round 2: everyone privately writes a story using assigned slang. */
  | "story"
  /** Round 2: stories are revealed and voted on. */
  | "story_vote"
  /** Round 2: results, including callback points. */
  | "story_results"
  | "game_over";

export interface Player {
  id: string;
  name: string;
  /** Avatar seed index -> colour/emoji pair in the UI. */
  avatar: number;
  isHost: boolean;
  score: number;
  connected: boolean;
  /** Epoch ms of the last heartbeat/action we saw from this player. */
  lastSeenAt: number;
}

export interface PhraseCard {
  id: string;
  text: string;
}

export interface CategoryCard {
  id: string;
  text: string;
}

/** A player's private hand for the coin (round 1) phase. */
export interface CoinHand {
  phrase: PhraseCard;
  categories: CategoryCard[];
}

/** A slang term invented in round 1. */
export interface SlangEntry {
  id: string;
  authorId: string;
  /** The common phrase that was redefined. */
  phrase: string;
  /** The absurd category constraint the author picked. */
  category: string;
  /** The invented slang term. */
  term: string;
  /** The absurd definition. */
  definition: string;
  votes: string[];
}

export interface StoryEntry {
  id: string;
  authorId: string;
  prompt: string;
  /** Slang ids the author was required to use. */
  slangIds: string[];
  text: string;
  votes: string[];
}

export interface ScoreDelta {
  playerId: string;
  points: number;
  reason: string;
}

export interface GameSettings {
  /** Seconds allowed for the coin (writing slang) phase. */
  coinSeconds: number;
  /** Seconds allowed for the story writing phase. */
  storySeconds: number;
  /** Seconds allowed for each voting phase. */
  voteSeconds: number;
  /** Points awarded per vote in round 1. */
  coinVotePoints: number;
  /** Points awarded per vote in round 2. */
  storyVotePoints: number;
  /** Points an author earns per vote a story that used their slang receives. */
  callbackPoints: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  coinSeconds: 150,
  storySeconds: 240,
  voteSeconds: 120,
  coinVotePoints: 2,
  storyVotePoints: 3,
  callbackPoints: 1,
};

export interface GameState {
  /** Room code, e.g. `WOBBLE`. Also the storage key. */
  code: string;
  /** Monotonic revision; bumped on every mutation. Used for SSE diffing + CAS. */
  rev: number;
  createdAt: number;
  updatedAt: number;
  phase: Phase;
  settings: GameSettings;
  players: Player[];
  /** Deterministic PRNG state so replays/tests are reproducible. */
  seed: number;
  /** Remaining draw piles (ids into the decks). */
  phraseDeck: string[];
  categoryDeck: string[];
  promptDeck: string[];
  /** playerId -> private coin hand. Never sent to other players. */
  hands: Record<string, CoinHand>;
  /** Round 1 submissions, keyed by author id. */
  slang: Record<string, SlangEntry>;
  /** playerId -> the slang ids they must use in round 2. */
  assignments: Record<string, string[]>;
  /** playerId -> story prompt text for round 2. */
  prompts: Record<string, string>;
  /** Round 2 submissions, keyed by author id. */
  stories: Record<string, StoryEntry>;
  /** Epoch ms when the current phase auto-advances. `null` = untimed. */
  deadline: number | null;
  /** Score changes produced by the most recent scoring step. */
  lastDeltas: ScoreDelta[];
  /** Short human-readable log for the activity feed. */
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
  | { type: "submit_slang"; categoryId: string; term: string; definition: string }
  | { type: "submit_story"; text: string }
  | { type: "vote"; targetId: string }
  | { type: "unvote" }
  | { type: "advance" }
  | { type: "restart" }
  | { type: "kick"; playerId: string };

/* ------------------------------------------------------------------ */
/* Server -> client projection                                        */
/* ------------------------------------------------------------------ */

export interface PublicPlayer extends Omit<Player, "lastSeenAt"> {
  /** Whether this player has submitted for the current writing phase. */
  ready: boolean;
  /** Whether this player has cast a vote in the current voting phase. */
  hasVoted: boolean;
}

export interface ClientView {
  code: string;
  rev: number;
  phase: Phase;
  settings: GameSettings;
  players: PublicPlayer[];
  you: {
    id: string;
    isHost: boolean;
    /** Private coin hand — only present during the coin phase. */
    hand: CoinHand | null;
    /** Your own round 1 submission, if any. */
    slang: SlangEntry | null;
    /** Slang you must use in round 2 (with author names hidden until results). */
    assignedSlang: SlangEntry[];
    prompt: string | null;
    story: StoryEntry | null;
    votedFor: string | null;
  };
  /** Revealed round 1 entries (author hidden until results). */
  slangBoard: RevealedSlang[];
  /** Revealed round 2 entries (author hidden until results). */
  storyBoard: RevealedStory[];
  deadline: number | null;
  /** Server clock at projection time, so clients can correct drift. */
  serverNow: number;
  lastDeltas: ScoreDelta[];
  log: { at: number; text: string }[];
}

export interface RevealedSlang {
  id: string;
  phrase: string;
  category: string;
  term: string;
  definition: string;
  /** Null while authorship is still secret. */
  authorId: string | null;
  voteCount: number | null;
  voterIds: string[] | null;
}

export interface RevealedStory {
  id: string;
  prompt: string;
  text: string;
  slang: { term: string; definition: string; authorId: string | null }[];
  authorId: string | null;
  voteCount: number | null;
  voterIds: string[] | null;
}
