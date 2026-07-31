import { describe, expect, it } from "vitest";
import { applyAction, createGame, tick } from "@/lib/engine";
import { projectForPlayer } from "@/lib/projection";
import type { GameState } from "@/lib/types";

const T0 = 1_700_000_000_000;

function seat(count: number): GameState {
  let state = createGame("TEST1", 42, T0);
  for (let i = 0; i < count; i++) {
    state = applyAction(state, `p${i}`, { type: "join", name: `P${i}`, avatar: i }, T0);
  }
  return state;
}

function startedGame(count = 4): GameState {
  const state = seat(count);
  return applyAction(state, "p0", { type: "start_game" }, T0);
}

function everyoneCoins(state: GameState, now = T0 + 1000): GameState {
  let next = state;
  for (const player of state.players) {
    const hand = next.hands[player.id]!;
    next = applyAction(
      next,
      player.id,
      {
        type: "submit_slang",
        categoryId: hand.categories[0]!.id,
        term: `term-${player.id}`,
        definition: `definition for ${player.id}`,
      },
      now,
    );
  }
  return next;
}

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
    const state = seat(2);
    expect(() => applyAction(state, "p0", { type: "start_game" }, T0)).toThrow(
      /at least 3/,
    );
  });

  it("only lets the host start", () => {
    const state = seat(3);
    expect(() => applyAction(state, "p1", { type: "start_game" }, T0)).toThrow(
      /Only the host/,
    );
  });

  it("blocks joining a game in progress", () => {
    const state = startedGame(3);
    expect(() =>
      applyAction(state, "late", { type: "join", name: "Late", avatar: 1 }, T0),
    ).toThrow(/already in progress/);
  });
});

describe("round 1 — coin it", () => {
  it("deals a phrase and two categories to everyone", () => {
    const state = startedGame();
    expect(state.phase).toBe("coin");
    for (const player of state.players) {
      const hand = state.hands[player.id]!;
      expect(hand.phrase.text.length).toBeGreaterThan(0);
      expect(hand.categories).toHaveLength(2);
    }
  });

  it("rejects a category the player wasn't dealt", () => {
    const state = startedGame();
    expect(() =>
      applyAction(
        state,
        "p0",
        { type: "submit_slang", categoryId: "not-mine", term: "abc", definition: "means things" },
        T0,
      ),
    ).toThrow(/your own category/);
  });

  it("advances to voting once everyone has submitted", () => {
    const state = everyoneCoins(startedGame());
    expect(state.phase).toBe("coin_vote");
  });

  it("allows editing a submission before the round closes", () => {
    let state = startedGame();
    const hand = state.hands.p0!;
    state = applyAction(
      state,
      "p0",
      { type: "submit_slang", categoryId: hand.categories[0]!.id, term: "first", definition: "first def" },
      T0,
    );
    const firstId = state.slang.p0!.id;
    state = applyAction(
      state,
      "p0",
      { type: "submit_slang", categoryId: hand.categories[1]!.id, term: "second", definition: "second def" },
      T0,
    );
    expect(state.slang.p0!.term).toBe("second");
    expect(state.slang.p0!.id).toBe(firstId);
  });
});

describe("voting", () => {
  it("prevents voting for your own entry", () => {
    const state = everyoneCoins(startedGame());
    const mine = state.slang.p0!.id;
    expect(() =>
      applyAction(state, "p0", { type: "vote", targetId: mine }, T0),
    ).toThrow(/your own/);
  });

  it("replaces a previous vote rather than stacking", () => {
    let state = everyoneCoins(startedGame());
    state = applyAction(state, "p0", { type: "vote", targetId: state.slang.p1!.id }, T0);
    state = applyAction(state, "p0", { type: "vote", targetId: state.slang.p2!.id }, T0);
    expect(state.slang.p1!.votes).toHaveLength(0);
    expect(state.slang.p2!.votes).toEqual(["p0"]);
  });

  it("scores votes and moves to results when everyone has voted", () => {
    let state = everyoneCoins(startedGame(3));
    state = applyAction(state, "p0", { type: "vote", targetId: state.slang.p1!.id }, T0);
    state = applyAction(state, "p1", { type: "vote", targetId: state.slang.p2!.id }, T0);
    state = applyAction(state, "p2", { type: "vote", targetId: state.slang.p1!.id }, T0);

    expect(state.phase).toBe("coin_results");
    const byId = new Map(state.players.map((p) => [p.id, p.score]));
    expect(byId.get("p1")).toBe(2 * state.settings.coinVotePoints);
    expect(byId.get("p2")).toBe(1 * state.settings.coinVotePoints);
    expect(byId.get("p0")).toBe(0);
  });
});

describe("round 2 — story time", () => {
  function reachStoryPhase(count = 4): GameState {
    let state = everyoneCoins(startedGame(count));
    for (const player of state.players) {
      const target = Object.values(state.slang).find((s) => s.authorId !== player.id)!;
      state = applyAction(state, player.id, { type: "vote", targetId: target.id }, T0);
    }
    return applyAction(state, "p0", { type: "advance" }, T0);
  }

  it("never assigns a player their own slang", () => {
    const state = reachStoryPhase();
    for (const player of state.players) {
      const assigned = state.assignments[player.id]!;
      expect(assigned.length).toBeGreaterThan(0);
      for (const id of assigned) {
        const entry = Object.values(state.slang).find((s) => s.id === id)!;
        expect(entry.authorId).not.toBe(player.id);
      }
    }
  });

  it("pays callback points to the slang author", () => {
    let state = reachStoryPhase(3);
    for (const player of state.players) {
      state = applyAction(
        state,
        player.id,
        { type: "submit_story", text: `A perfectly serviceable story from ${player.id}.` },
        T0,
      );
    }
    expect(state.phase).toBe("story_vote");

    const scoresBefore = new Map(state.players.map((p) => [p.id, p.score]));
    const targetStory = state.stories.p0!;
    state = applyAction(state, "p1", { type: "vote", targetId: targetStory.id }, T0);
    state = applyAction(state, "p2", { type: "vote", targetId: targetStory.id }, T0);
    state = applyAction(state, "p0", { type: "vote", targetId: state.stories.p1!.id }, T0);

    expect(state.phase).toBe("story_results");
    // p0's story earned two votes.
    const storyPoints = state.lastDeltas
      .filter((d) => d.playerId === "p0" && d.reason.includes("their story"))
      .reduce((sum, d) => sum + d.points, 0);
    expect(storyPoints).toBe(2 * state.settings.storyVotePoints);
    expect(scoresBefore.get("p0")).toBeDefined();
    // The authors of the slang p0 used earn callbacks for those two votes.
    const callbackTotal = state.lastDeltas
      .filter((d) => d.reason.startsWith("callback"))
      .reduce((sum, d) => sum + d.points, 0);
    expect(callbackTotal).toBeGreaterThan(0);
  });
});

describe("timers", () => {
  it("advances the phase once the deadline passes", () => {
    const state = startedGame();
    const past = state.deadline! + 1;
    // Keep everyone alive so presence doesn't interfere.
    for (const p of state.players) p.lastSeenAt = past;
    expect(tick(state, past)).toBe(true);
    expect(state.phase).not.toBe("coin");
  });

  it("marks players disconnected after the presence timeout", () => {
    const state = seat(3);
    tick(state, T0 + 60_000);
    expect(state.players.every((p) => !p.connected)).toBe(true);
  });
});

describe("projection", () => {
  it("hides other players' hands and authorship during voting", () => {
    const state = everyoneCoins(startedGame());
    const view = projectForPlayer(state, "p0", T0);
    expect(view.slangBoard).toHaveLength(4);
    expect(view.slangBoard.every((e) => e.authorId === null)).toBe(true);
    expect(view.slangBoard.every((e) => e.voteCount === null)).toBe(true);
    // No route into anyone else's private hand.
    expect(JSON.stringify(view)).not.toContain('"hands"');
  });

  it("reveals authorship at the results screen", () => {
    let state = everyoneCoins(startedGame(3));
    for (const player of state.players) {
      const target = Object.values(state.slang).find((s) => s.authorId !== player.id)!;
      state = applyAction(state, player.id, { type: "vote", targetId: target.id }, T0);
    }
    const view = projectForPlayer(state, "p0", T0);
    expect(view.slangBoard.every((e) => e.authorId !== null)).toBe(true);
  });
});
