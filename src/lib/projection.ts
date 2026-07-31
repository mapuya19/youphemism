/**
 * Server -> client projection.
 *
 * The full `GameState` contains information players must not see (other
 * players' hands, who wrote which anonymous entry, unrevealed votes). Every
 * response goes through `projectForPlayer` so secrecy is enforced in exactly
 * one place.
 */

import { hasSubmitted, votedFor } from "./engine";
import {
  ClientView,
  GameState,
  PublicPlayer,
  RevealedSlang,
  RevealedStory,
  SlangEntry,
} from "./types";

/** Authorship and vote tallies only become public at the results screens. */
function coinRevealed(phase: GameState["phase"]) {
  return phase === "coin_results" || phase === "story" || phase === "story_vote" ||
    phase === "story_results" || phase === "game_over";
}

function storyRevealed(phase: GameState["phase"]) {
  return phase === "story_results" || phase === "game_over";
}

export function projectForPlayer(
  state: GameState,
  playerId: string | null,
  now: number,
): ClientView {
  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.isHost,
    score: p.score,
    connected: p.connected,
    ready: hasSubmitted(state, p.id),
    hasVoted: votedFor(state, p.id) !== null,
  }));

  const me = playerId ? state.players.find((p) => p.id === playerId) : undefined;
  const slangById = new Map(Object.values(state.slang).map((s) => [s.id, s]));

  const showCoinAuthors = coinRevealed(state.phase);
  const showStoryAuthors = storyRevealed(state.phase);

  const slangBoard: RevealedSlang[] =
    state.phase === "coin_vote" || showCoinAuthors
      ? sortStable(Object.values(state.slang)).map((entry) => ({
          id: entry.id,
          phrase: entry.phrase,
          category: entry.category,
          term: entry.term,
          definition: entry.definition,
          authorId: showCoinAuthors ? entry.authorId : null,
          voteCount: showCoinAuthors ? entry.votes.length : null,
          voterIds: showCoinAuthors ? entry.votes : null,
        }))
      : [];

  const storyBoard: RevealedStory[] =
    state.phase === "story_vote" || showStoryAuthors
      ? sortStable(Object.values(state.stories)).map((story) => ({
          id: story.id,
          prompt: story.prompt,
          text: story.text,
          slang: story.slangIds.map((id) => {
            const entry = slangById.get(id);
            return {
              term: entry?.term ?? "?",
              definition: entry?.definition ?? "",
              authorId: showStoryAuthors ? (entry?.authorId ?? null) : null,
            };
          }),
          authorId: showStoryAuthors ? story.authorId : null,
          voteCount: showStoryAuthors ? story.votes.length : null,
          voterIds: showStoryAuthors ? story.votes : null,
        }))
      : [];

  const assignedSlang: SlangEntry[] = me
    ? (state.assignments[me.id] ?? [])
        .map((id) => slangById.get(id))
        .filter((s): s is SlangEntry => Boolean(s))
        .map((s) => ({
          ...s,
          // Hide who wrote the slang you're being asked to use until results.
          authorId: showCoinAuthors ? s.authorId : "",
          votes: [],
        }))
    : [];

  return {
    code: state.code,
    rev: state.rev,
    phase: state.phase,
    settings: state.settings,
    players,
    you: {
      id: me?.id ?? "",
      isHost: me?.isHost ?? false,
      hand: me && state.phase === "coin" ? (state.hands[me.id] ?? null) : null,
      slang: me ? (state.slang[me.id] ?? null) : null,
      assignedSlang,
      prompt: me ? (state.prompts[me.id] ?? null) : null,
      story: me ? (state.stories[me.id] ?? null) : null,
      votedFor: me ? votedFor(state, me.id) : null,
    },
    slangBoard,
    storyBoard,
    deadline: state.deadline,
    serverNow: now,
    lastDeltas: state.lastDeltas,
    log: state.log.slice(-12),
  };
}

/** Stable, id-based ordering so the anonymous board doesn't hint at authorship. */
function sortStable<T extends { id: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
