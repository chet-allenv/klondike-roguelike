import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import type { GameState } from "./klondike";
import {
  BASE_TARGET,
  canDrawFromStock,
  canUndo,
  createRoundState,
  createRun,
  isRoundStuck,
  REDEALS_PER_ROUND,
  registerStockDraw,
  registerUndo,
  resolveRound,
  STARTING_LIVES,
  targetForRound,
  UNDOS_PER_ROUND,
} from "./roguelike";

function card(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}-${rank}`, suit, rank, faceUp };
}

function emptyState(): GameState {
  return {
    tableau: [[], [], [], [], [], [], []],
    foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
    stock: [],
    waste: [],
  };
}

describe("createRun", () => {
  it("starts at round 1 with starting lives and no rounds cleared", () => {
    expect(createRun()).toEqual({
      lives: STARTING_LIVES,
      round: 1,
      roundsCleared: 0,
      gameOver: false,
    });
  });
});

describe("targetForRound", () => {
  it("uses the base target for round 1", () => {
    expect(targetForRound(1)).toBe(BASE_TARGET);
  });

  it("grows by 25% each subsequent round, rounded", () => {
    expect(targetForRound(2)).toBe(Math.round(BASE_TARGET * 1.25));
    expect(targetForRound(3)).toBe(Math.round(BASE_TARGET * 1.25 ** 2));
  });
});

describe("resolveRound", () => {
  it("advances the round and rounds-cleared count on a win", () => {
    const run = createRun();
    const { run: next, result } = resolveRound(run, 120, 100);

    expect(result).toBe("won");
    expect(next.round).toBe(2);
    expect(next.roundsCleared).toBe(1);
    expect(next.lives).toBe(STARTING_LIVES);
    expect(next.gameOver).toBe(false);
  });

  it("treats hitting the target exactly as a win", () => {
    const { result } = resolveRound(createRun(), 100, 100);
    expect(result).toBe("won");
  });

  it("costs a life on a loss and doesn't advance the round", () => {
    const run = createRun();
    const { run: next, result } = resolveRound(run, 40, 100);

    expect(result).toBe("lost");
    expect(next.lives).toBe(STARTING_LIVES - 1);
    expect(next.round).toBe(1);
    expect(next.gameOver).toBe(false);
  });

  it("ends the run when lives reach 0", () => {
    let run = createRun();
    for (let i = 0; i < STARTING_LIVES - 1; i++) {
      run = resolveRound(run, 0, 100).run;
    }
    expect(run.gameOver).toBe(false);

    run = resolveRound(run, 0, 100).run;
    expect(run.lives).toBe(0);
    expect(run.gameOver).toBe(true);
  });
});

describe("createRoundState", () => {
  it("defaults to the standard redeal and undo allotments with none used", () => {
    expect(createRoundState()).toEqual({
      redealsUsed: 0,
      redealsAllowed: REDEALS_PER_ROUND,
      undosUsed: 0,
      undosAllowed: UNDOS_PER_ROUND,
    });
  });

  it("accepts custom allotments", () => {
    expect(createRoundState(0, 1)).toEqual({
      redealsUsed: 0,
      redealsAllowed: 0,
      undosUsed: 0,
      undosAllowed: 1,
    });
  });
});

describe("canDrawFromStock", () => {
  it("is true whenever the stock has cards, regardless of redeals", () => {
    const state = emptyState();
    state.stock = [card("clubs", 2)];
    expect(canDrawFromStock(state, createRoundState(0))).toBe(true);
  });

  it("is true on an empty stock if a redeal remains", () => {
    const state = emptyState();
    expect(canDrawFromStock(state, createRoundState(1))).toBe(true);
  });

  it("is false on an empty stock once redeals are exhausted", () => {
    const state = emptyState();
    const round = createRoundState(1);
    round.redealsUsed = 1;
    expect(canDrawFromStock(state, round)).toBe(false);
  });
});

describe("registerStockDraw", () => {
  it("does not consume a redeal when the stock still has cards", () => {
    const state = emptyState();
    state.stock = [card("clubs", 2)];
    const round = createRoundState();

    registerStockDraw(state, round);

    expect(round.redealsUsed).toBe(0);
  });

  it("consumes a redeal when the stock is empty (a redeal is about to happen)", () => {
    const state = emptyState();
    const round = createRoundState();

    registerStockDraw(state, round);

    expect(round.redealsUsed).toBe(1);
  });
});

describe("canUndo / registerUndo", () => {
  it("allows undo until the allotment is used up", () => {
    const round = createRoundState(REDEALS_PER_ROUND, 2);

    expect(canUndo(round)).toBe(true);
    registerUndo(round);
    expect(canUndo(round)).toBe(true);
    registerUndo(round);
    expect(canUndo(round)).toBe(false);
  });

  it("blocks undo entirely with a 0 allotment", () => {
    const round = createRoundState(REDEALS_PER_ROUND, 0);
    expect(canUndo(round)).toBe(false);
  });
});

describe("isRoundStuck", () => {
  it("is false when a legal move exists, even with no redeals left", () => {
    const state = emptyState();
    state.waste = [card("hearts", 1)];
    expect(isRoundStuck(state, createRoundState(0))).toBe(false);
  });

  it("is false with no legal move if the stock can still be drawn", () => {
    const state = emptyState();
    state.stock = [card("clubs", 2)];
    expect(isRoundStuck(state, createRoundState(0))).toBe(false);
  });

  it("is true with no legal move and no way to draw", () => {
    const state = emptyState();
    state.waste = [card("clubs", 7)];
    state.tableau = [
      [card("clubs", 8, false), card("spades", 5)],
      [card("spades", 9)],
      [card("clubs", 2)],
      [card("clubs", 4)],
      [card("spades", 6)],
      [card("clubs", 10)],
      [card("spades", 3)],
    ];
    expect(isRoundStuck(state, createRoundState(0))).toBe(true);
  });
});
