import { describe, expect, it } from "vitest";
import { applyAction, createGame, currentJudgeId, tick } from "@/lib/engine";
import { projectForPlayer } from "@/lib/projection";
import { HAND_SIZE, USE_IT_COUNT, USE_IT_ROUNDS, type GameState } from "@/lib/types";

const T0 = 1_700_000_000_000;

function seat(count: number): GameState {
  let state = createGame("TEST1", 42, T0);
  for (let i = 0; i < count; i++) {
    state = applyAction(state, `p${i}`, { type: "join", name: `P${i}`, avatar: i }, T0);
  }
  return state;
}

const started = (count = 4): GameState =>
  applyAction(seat(count), "p0", { type: "start_game" }, T0);

/** Everyone except the judge plays their first card with a definition. */
function allPitch(state: GameState, now = T0 + 1000): GameState {
  let next = state;
  const judge = currentJudgeId(state);
  for (const player of state.players) {
    if (player.id === judge) continue;
    const hand = next.hands[player.id]!;
    next = applyAction(
      next,
      player.id,
      { type: "submit_pitch", cardId: hand[0]!, definition: `meaning from ${player.id}` },
      now,
    );
  }
  return next;
}

/** Play one full round-1 turn: pitches, judge picks, advance to the next turn. */
function playTurn(state: GameState, now = T0 + 1000): GameState {
  let next = allPitch(state, now);
  const judge = currentJudgeId(next)!;
  const first = Object.values(next.pitches)[0]!;
  next = applyAction(next, judge, { type: "judge_pick", pitchId: first.id }, now);
  return applyAction(next, next.players.find((p) => p.isHost)!.id, { type: "advance" }, now);
}

/** Run all of round 1 so the game lands in the first Use It! phase. */
function reachUseIt(count = 4): GameState {
  let state = started(count);
  for (let turn = 0; turn < count; turn++) state = playTurn(state);
  return state;
}

function allStories(state: GameState, now = T0 + 2000): GameState {
  let next = state;
  for (const player of state.players) {
    const hand = next.slangHands[player.id]!.filter(
      (id) => !next.spentSlang.includes(id),
    );
    next = applyAction(
      next,
      player.id,
      {
        type: "submit_story",
        slangId: hand[0]!,
        useItId: next.useItCards[0]!.id,
        text: `A perfectly serviceable story from ${player.id}.`,
      },
      now,
    );
  }
  return next;
}

/* ------------------------------------------------------------------ */

describe("lobby", () => {
  it("makes the first player host and rejects duplicate names", () => {
    const state = seat(2);
    expect(state.players[0]!.isHost).toBe(true);
    expect(state.players[1]!.isHost).toBe(false);
    expect(() =>
      applyAction(state, "px", { type: "join", name: "P0", avatar: 0 }, T0),
    ).toThrow(/already has that name/);
  });

  it("refuses to start below the minimum player count", () => {
    expect(() => applyAction(seat(2), "p0", { type: "start_game" }, T0)).toThrow(
      /at least 3/,
    );
  });

  it("only lets the host start", () => {
    expect(() => applyAction(seat(3), "p1", { type: "start_game" }, T0)).toThrow(
      /Only the host/,
    );
  });

  it("blocks joining a game in progress", () => {
    expect(() =>
      applyAction(started(3), "late", { type: "join", name: "Late", avatar: 1 }, T0),
    ).toThrow(/already in progress/);
  });
});

describe("round 1 — category", () => {
  it("deals five Youphemism cards and one shared category", () => {
    const state = started();
    expect(state.phase).toBe("category");
    expect(state.category?.text.length).toBeGreaterThan(0);
    for (const player of state.players) {
      expect(state.hands[player.id]).toHaveLength(HAND_SIZE);
    }
  });

  it("gives every player exactly one turn as judge", () => {
    const state = started(4);
    expect(state.turnOrder).toHaveLength(4);
    expect(new Set(state.turnOrder).size).toBe(4);
  });

  it("stops the judge from pitching", () => {
    const state = started();
    const judge = currentJudgeId(state)!;
    expect(() =>
      applyAction(
        state,
        judge,
        { type: "submit_pitch", cardId: state.hands[judge]![0]!, definition: "nope" },
        T0,
      ),
    ).toThrow(/judging this turn/);
  });

  it("rejects a card the player doesn't hold", () => {
    const state = started();
    const player = state.players.find((p) => p.id !== currentJudgeId(state))!;
    expect(() =>
      applyAction(
        state,
        player.id,
        { type: "submit_pitch", cardId: "y999", definition: "not my card" },
        T0,
      ),
    ).toThrow(/isn't in your hand/);
  });

  it("moves to judging once every non-judge has pitched", () => {
    const state = allPitch(started());
    expect(state.phase).toBe("judging");
    expect(Object.keys(state.pitches)).toHaveLength(3);
  });

  it("only lets the judge pick, and awards exactly one point", () => {
    const state = allPitch(started());
    const judge = currentJudgeId(state)!;
    const target = Object.values(state.pitches)[0]!;
    const notJudge = state.players.find((p) => p.id !== judge)!;

    expect(() =>
      applyAction(state, notJudge.id, { type: "judge_pick", pitchId: target.id }, T0),
    ).toThrow(/not the judge/);

    const after = applyAction(state, judge, { type: "judge_pick", pitchId: target.id }, T0);
    expect(after.phase).toBe("category_result");
    expect(after.players.find((p) => p.id === target.authorId)!.score).toBe(1);
    expect(after.players.reduce((sum, p) => sum + p.score, 0)).toBe(1);
  });

  it("saves every played card into the defined pile and rotates the judge", () => {
    const state = started(4);
    const firstJudge = currentJudgeId(state);
    const after = playTurn(state);
    expect(after.definedPile).toHaveLength(3);
    expect(currentJudgeId(after)).not.toBe(firstJudge);
    expect(after.turnIndex).toBe(1);
  });

  it("refills hands back to five between turns", () => {
    const after = playTurn(started(4));
    for (const player of after.players) {
      expect(after.hands[player.id]).toHaveLength(HAND_SIZE);
    }
  });

  it("preserves each card's meaning into the defined pile", () => {
    const after = playTurn(started(3));
    for (const card of after.definedPile) {
      expect(card.definition).toBe(`meaning from ${card.authorId}`);
      expect(card.category.length).toBeGreaterThan(0);
    }
  });
});

describe("round 2 — use it!", () => {
  it("starts after everyone has judged once", () => {
    const state = reachUseIt(4);
    expect(state.phase).toBe("useit");
    expect(state.useItRound).toBe(1);
    // 4 turns x 3 non-judge pitches.
    expect(state.definedPile).toHaveLength(12);
  });

  it("reveals four USE IT! cards and deals the pile out evenly", () => {
    const state = reachUseIt(4);
    expect(state.useItCards).toHaveLength(USE_IT_COUNT);
    const sizes = state.players.map((p) => state.slangHands[p.id]!.length);
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBe(3);
  });

  it("prefers not to deal a player their own slang", () => {
    const state = reachUseIt(4);
    const byId = new Map(state.definedPile.map((c) => [c.id, c]));
    let ownCards = 0;
    for (const player of state.players) {
      for (const id of state.slangHands[player.id]!) {
        if (byId.get(id)!.authorId === player.id) ownCards++;
      }
    }
    expect(ownCards).toBe(0);
  });

  it("rejects slang or prompts the player doesn't have", () => {
    const state = reachUseIt(3);
    const mine = state.slangHands.p0!;
    expect(() =>
      applyAction(
        state,
        "p0",
        { type: "submit_story", slangId: "nope", useItId: state.useItCards[0]!.id, text: "a".repeat(30) },
        T0,
      ),
    ).toThrow(/isn't in your hand/);
    expect(() =>
      applyAction(
        state,
        "p0",
        { type: "submit_story", slangId: mine[0]!, useItId: "u999", text: "a".repeat(30) },
        T0,
      ),
    ).toThrow(/four USE IT/);
  });

  it("scores the storyteller and the original coiner one point each", () => {
    let state = allStories(reachUseIt(4));
    expect(state.phase).toBe("useit_vote");

    const before = new Map(state.players.map((p) => [p.id, p.score]));
    const winning = state.stories.p0!;
    const coinerId = state.definedPile.find((c) => c.id === winning.slangId)!.authorId;

    state = applyAction(state, "p1", { type: "vote", targetId: winning.id }, T0);
    state = applyAction(state, "p2", { type: "vote", targetId: winning.id }, T0);
    state = applyAction(state, "p3", { type: "vote", targetId: winning.id }, T0);
    state = applyAction(state, "p0", { type: "vote", targetId: state.stories.p1!.id }, T0);

    expect(state.phase).toBe("useit_result");
    const scoreOf = (id: string) => state.players.find((p) => p.id === id)!.score;
    // One point for the story, regardless of how many votes it got.
    expect(scoreOf("p0")).toBe((before.get("p0") ?? 0) + 1);
    expect(scoreOf(coinerId)).toBe((before.get(coinerId) ?? 0) + 1);
    expect(coinerId).not.toBe("p0");
  });

  it("awards every tied story", () => {
    let state = allStories(reachUseIt(4));
    state = applyAction(state, "p0", { type: "vote", targetId: state.stories.p1!.id }, T0);
    state = applyAction(state, "p1", { type: "vote", targetId: state.stories.p0!.id }, T0);
    state = applyAction(state, "p2", { type: "vote", targetId: state.stories.p3!.id }, T0);
    state = applyAction(state, "p3", { type: "vote", targetId: state.stories.p2!.id }, T0);

    expect(state.phase).toBe("useit_result");
    const storyWinners = state.lastDeltas.filter((d) => d.reason.includes("won the vote"));
    expect(storyWinners).toHaveLength(4);
  });

  it("prevents voting for your own story", () => {
    const state = allStories(reachUseIt(3));
    expect(() =>
      applyAction(state, "p0", { type: "vote", targetId: state.stories.p0!.id }, T0),
    ).toThrow(/your own/);
  });

  it("spends a slang card so it can't be reused, then ends after two rounds", () => {
    let state = allStories(reachUseIt(4));
    const firstPick = state.stories.p0!.slangId;

    for (const [i, player] of state.players.entries()) {
      const other = state.players[(i + 1) % state.players.length]!;
      state = applyAction(
        state,
        player.id,
        { type: "vote", targetId: state.stories[other.id]!.id },
        T0,
      );
    }
    state = applyAction(state, state.players.find((p) => p.isHost)!.id, { type: "advance" }, T0);

    expect(state.useItRound).toBe(2);
    expect(state.spentSlang).toContain(firstPick);
    expect(() =>
      applyAction(
        state,
        "p0",
        { type: "submit_story", slangId: firstPick, useItId: state.useItCards[0]!.id, text: "a".repeat(30) },
        T0,
      ),
    ).toThrow(/isn't in your hand/);

    state = allStories(state);
    for (const [i, player] of state.players.entries()) {
      const other = state.players[(i + 1) % state.players.length]!;
      state = applyAction(
        state,
        player.id,
        { type: "vote", targetId: state.stories[other.id]!.id },
        T0,
      );
    }
    state = applyAction(state, state.players.find((p) => p.isHost)!.id, { type: "advance" }, T0);
    expect(state.useItRound).toBe(USE_IT_ROUNDS);
    expect(state.phase).toBe("game_over");
  });
});

describe("timers", () => {
  it("skips a turn where nobody pitched once the deadline passes", () => {
    const state = started();
    const past = state.deadline! + 1;
    for (const p of state.players) p.lastSeenAt = past;
    expect(tick(state, past)).toBe(true);
    // No pitches means nothing to judge, so the judge rotates on.
    expect(state.turnIndex).toBe(1);
    expect(state.phase).toBe("category");
    expect(state.deadline).toBeGreaterThan(past);
  });

  it("picks for a judge who runs out of time", () => {
    const state = allPitch(started());
    const past = state.deadline! + 1;
    for (const p of state.players) p.lastSeenAt = past;
    tick(state, past);
    expect(state.judgePick).not.toBeNull();
    expect(state.players.reduce((sum, p) => sum + p.score, 0)).toBe(1);
  });

  it("marks players disconnected after the presence timeout", () => {
    const state = seat(3);
    tick(state, T0 + 60_000);
    expect(state.players.every((p) => !p.connected)).toBe(true);
  });
});

describe("projection", () => {
  it("hides pitch authorship while the judge deliberates", () => {
    const state = allPitch(started());
    const view = projectForPlayer(state, "p0", T0);
    expect(view.phase).toBe("judging");
    expect(view.pitchBoard).toHaveLength(3);
    expect(view.pitchBoard.every((p) => p.authorId === null)).toBe(true);
  });

  it("never leaks another player's hand", () => {
    const state = started();
    const view = projectForPlayer(state, "p0", T0);
    const serialised = JSON.stringify(view);
    const otherHand = state.hands.p1!;
    // p0's own hand is fine; p1's cards must not appear unless p0 also holds them.
    const leaked = otherHand.filter((id) => !state.hands.p0!.includes(id));
    for (const id of leaked) {
      expect(serialised).not.toContain(`"${id}"`);
    }
  });

  it("reveals pitch authorship at the result screen", () => {
    let state = allPitch(started());
    const judge = currentJudgeId(state)!;
    state = applyAction(
      state,
      judge,
      { type: "judge_pick", pitchId: Object.values(state.pitches)[0]!.id },
      T0,
    );
    const view = projectForPlayer(state, "p0", T0);
    expect(view.pitchBoard.every((p) => p.authorId !== null)).toBe(true);
    expect(view.pitchBoard.filter((p) => p.won)).toHaveLength(1);
  });

  it("hides story authorship and tallies during voting", () => {
    const state = allStories(reachUseIt(4));
    const view = projectForPlayer(state, "p0", T0);
    expect(view.storyBoard).toHaveLength(4);
    expect(view.storyBoard.every((s) => s.authorId === null)).toBe(true);
    expect(view.storyBoard.every((s) => s.coinerId === null)).toBe(true);
    expect(view.storyBoard.every((s) => s.voteCount === null)).toBe(true);
  });

  it("keeps the slangbook hidden until round 2", () => {
    expect(projectForPlayer(started(), "p0", T0).slangbook).toHaveLength(0);
    expect(projectForPlayer(reachUseIt(3), "p0", T0).slangbook.length).toBeGreaterThan(0);
  });
});
