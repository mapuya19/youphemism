/**
 * Server -> client projection.
 *
 * `GameState` holds information players must not see: other people's hands,
 * who wrote which anonymous pitch or story, and running vote tallies. Every
 * response passes through `projectForPlayer`, so secrecy is enforced in exactly
 * one place and is covered by tests.
 */

import {
  currentJudgeId,
  handCards,
  hasSubmitted,
  slangHandCards,
  votedFor,
} from "./engine";
import {
  ClientView,
  GameState,
  PublicPlayer,
  RevealedPitch,
  RevealedStory,
  SlangCard,
  USE_IT_ROUNDS,
} from "./types";

/** Pitch authorship is secret while the judge deliberates. */
const pitchesRevealed = (phase: GameState["phase"]) => phase === "category_result";

/** Story authorship and tallies are secret until the round is scored. */
const storiesRevealed = (phase: GameState["phase"]) =>
  phase === "useit_result" || phase === "game_over";

/** The defined pile becomes common knowledge once round 2 begins. */
const slangbookVisible = (phase: GameState["phase"]) =>
  phase === "useit" || phase === "useit_vote" || phase === "useit_result" ||
  phase === "game_over";

export function projectForPlayer(
  state: GameState,
  playerId: string | null,
  now: number,
): ClientView {
  const judgeId = currentJudgeId(state);
  const inRoundOne =
    state.phase === "category" ||
    state.phase === "judging" ||
    state.phase === "category_result";

  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.isHost,
    score: p.score,
    connected: p.connected,
    ready: hasSubmitted(state, p.id),
    hasVoted: votedFor(state, p.id) !== null,
    isJudge: inRoundOne && p.id === judgeId,
    handCount: inRoundOne
      ? (state.hands[p.id] ?? []).length
      : slangHandCards(state, p.id).length,
  }));

  const me = playerId ? state.players.find((p) => p.id === playerId) : undefined;
  const showPitchAuthors = pitchesRevealed(state.phase);
  const showStoryAuthors = storiesRevealed(state.phase);

  const pitchBoard: RevealedPitch[] =
    state.phase === "judging" || showPitchAuthors
      ? stable(Object.values(state.pitches)).map((pitch) => ({
          id: pitch.id,
          term: pitch.term,
          definition: pitch.definition,
          authorId: showPitchAuthors ? pitch.authorId : null,
          won: showPitchAuthors && state.judgePick === pitch.id,
        }))
      : [];

  const slangById = new Map(state.definedPile.map((card) => [card.id, card]));
  const topVotes = Math.max(
    0,
    ...Object.values(state.stories).map((s) => s.votes.length),
  );

  const storyBoard: RevealedStory[] =
    state.phase === "useit_vote" || showStoryAuthors
      ? stable(Object.values(state.stories)).map((story) => {
          const slang = slangById.get(story.slangId);
          return {
            id: story.id,
            useIt:
              state.useItCards.find((card) => card.id === story.useItId)?.text ?? "",
            term: slang?.term ?? "?",
            definition: slang?.definition ?? "",
            text: story.text,
            authorId: showStoryAuthors ? story.authorId : null,
            coinerId: showStoryAuthors ? (slang?.authorId ?? null) : null,
            voteCount: showStoryAuthors ? story.votes.length : null,
            voterIds: showStoryAuthors ? story.votes : null,
            won: showStoryAuthors && topVotes > 0 && story.votes.length === topVotes,
          };
        })
      : [];

  // The slangbook is shared knowledge in round 2, but never attributed early.
  const slangbook: SlangCard[] = slangbookVisible(state.phase)
    ? state.definedPile.map((card) => ({ ...card }))
    : [];

  return {
    code: state.code,
    rev: state.rev,
    phase: state.phase,
    settings: state.settings,
    players,

    turn: state.turnIndex + 1,
    totalTurns: state.turnOrder.length,
    useItRound: state.useItRound,
    useItRounds: USE_IT_ROUNDS,

    judgeId: inRoundOne ? judgeId : null,
    category: state.category,
    useItCards: state.useItCards,

    you: {
      id: me?.id ?? "",
      isHost: me?.isHost ?? false,
      isJudge: Boolean(me && inRoundOne && me.id === judgeId),
      hand: me && inRoundOne ? handCards(state, me.id) : [],
      slangHand: me && !inRoundOne ? slangHandCards(state, me.id) : [],
      pitch: me ? (state.pitches[me.id] ?? null) : null,
      story: me ? (state.stories[me.id] ?? null) : null,
      votedFor: me ? votedFor(state, me.id) : null,
    },

    pitchBoard,
    storyBoard,
    slangbook,

    deadline: state.deadline,
    serverNow: now,
    lastDeltas: state.lastDeltas,
    log: state.log.slice(-12),
  };
}

/** Order by id, never by author, so the board can't hint at authorship. */
function stable<T extends { id: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
