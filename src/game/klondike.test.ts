import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import {
  canPlaceOnFoundation,
  canPlaceOnTableau,
  dealNewGame,
  drawFromStock,
  type GameState,
  isWon,
  moveFoundationToTableau,
  moveTableauToFoundation,
  moveTableauToTableau,
  moveWasteToFoundation,
  moveWasteToTableau,
} from "./klondike";

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

describe("dealNewGame", () => {
  it("deals 7 tableau columns of increasing size with only the top card face up", () => {
    const state = dealNewGame();

    state.tableau.forEach((column, i) => {
      expect(column).toHaveLength(i + 1);
      column.forEach((c, idx) => {
        expect(c.faceUp).toBe(idx === column.length - 1);
      });
    });
  });

  it("puts the remaining 24 cards face down in the stock and leaves waste empty", () => {
    const state = dealNewGame();
    expect(state.stock).toHaveLength(24);
    expect(state.stock.every((c) => !c.faceUp)).toBe(true);
    expect(state.waste).toHaveLength(0);
  });

  it("deals all 52 cards exactly once", () => {
    const state = dealNewGame();
    const all = [
      ...state.tableau.flat(),
      ...state.stock,
      ...state.waste,
      ...Object.values(state.foundations).flat(),
    ];
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
  });
});

describe("canPlaceOnTableau", () => {
  it("allows only a King on an empty column", () => {
    expect(canPlaceOnTableau(card("hearts", 13), [])).toBe(true);
    expect(canPlaceOnTableau(card("hearts", 12), [])).toBe(false);
  });

  it("allows descending rank with alternating color", () => {
    const column = [card("clubs", 8)];
    expect(canPlaceOnTableau(card("hearts", 7), column)).toBe(true);
    expect(canPlaceOnTableau(card("diamonds", 7), column)).toBe(true);
  });

  it("rejects same color even if rank descends correctly", () => {
    const column = [card("clubs", 8)];
    expect(canPlaceOnTableau(card("spades", 7), column)).toBe(false);
  });

  it("rejects wrong rank even if color alternates correctly", () => {
    const column = [card("clubs", 8)];
    expect(canPlaceOnTableau(card("hearts", 6), column)).toBe(false);
  });

  it("rejects placing on a face-down top card", () => {
    const column = [card("clubs", 8, false)];
    expect(canPlaceOnTableau(card("hearts", 7), column)).toBe(false);
  });
});

describe("canPlaceOnFoundation", () => {
  it("only accepts an Ace on an empty foundation", () => {
    const state = emptyState();
    expect(canPlaceOnFoundation(card("spades", 1), state)).toBe(true);
    expect(canPlaceOnFoundation(card("spades", 2), state)).toBe(false);
  });

  it("requires the next sequential rank of the same suit", () => {
    const state = emptyState();
    state.foundations.spades = [card("spades", 1), card("spades", 2)];
    expect(canPlaceOnFoundation(card("spades", 3), state)).toBe(true);
    expect(canPlaceOnFoundation(card("spades", 4), state)).toBe(false);
    expect(canPlaceOnFoundation(card("hearts", 3), state)).toBe(false);
  });
});

describe("drawFromStock", () => {
  it("moves the top stock card to the waste, face up", () => {
    const state = emptyState();
    state.stock = [card("spades", 5, false), card("hearts", 9, false)];

    drawFromStock(state);

    expect(state.stock).toHaveLength(1);
    expect(state.waste).toHaveLength(1);
    expect(state.waste[0].id).toBe("hearts-9");
    expect(state.waste[0].faceUp).toBe(true);
  });

  it("redeals the waste back into the stock, face down, when the stock is empty", () => {
    const state = emptyState();
    state.waste = [card("spades", 5), card("hearts", 9), card("clubs", 2)];

    drawFromStock(state);

    expect(state.waste).toHaveLength(0);
    expect(state.stock).toHaveLength(3);
    expect(state.stock.every((c) => !c.faceUp)).toBe(true);
    // Redeal preserves draw order: the last card drawn to waste is drawn first again.
    expect(state.stock.map((c) => c.id)).toEqual(["clubs-2", "hearts-9", "spades-5"]);
  });
});

describe("moveWasteToTableau", () => {
  it("moves a legal card and removes it from the waste", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 8)];

    expect(moveWasteToTableau(state, 0)).toBe(true);
    expect(state.waste).toHaveLength(0);
    expect(state.tableau[0].map((c) => c.id)).toEqual(["clubs-8", "hearts-7"]);
  });

  it("rejects an illegal move and leaves state unchanged", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 4)];

    expect(moveWasteToTableau(state, 0)).toBe(false);
    expect(state.waste).toHaveLength(1);
    expect(state.tableau[0]).toHaveLength(1);
  });

  it("returns false when the waste is empty", () => {
    const state = emptyState();
    expect(moveWasteToTableau(state, 0)).toBe(false);
  });
});

describe("moveWasteToFoundation", () => {
  it("moves an Ace from waste to its foundation", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 1)];

    expect(moveWasteToFoundation(state)).toBe(true);
    expect(state.waste).toHaveLength(0);
    expect(state.foundations.diamonds.map((c) => c.id)).toEqual(["diamonds-1"]);
  });

  it("rejects an out-of-sequence card", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 3)];

    expect(moveWasteToFoundation(state)).toBe(false);
    expect(state.waste).toHaveLength(1);
  });
});

describe("moveFoundationToTableau", () => {
  it("moves the top foundation card back onto a legal tableau column", () => {
    const state = emptyState();
    state.foundations.hearts = [card("hearts", 1), card("hearts", 2)];
    state.tableau[0] = [card("clubs", 3)];

    expect(moveFoundationToTableau(state, "hearts", 0)).toBe(true);
    expect(state.foundations.hearts).toHaveLength(1);
    expect(state.tableau[0].map((c) => c.id)).toEqual(["clubs-3", "hearts-2"]);
  });

  it("rejects an illegal destination", () => {
    const state = emptyState();
    state.foundations.hearts = [card("hearts", 1), card("hearts", 2)];
    state.tableau[0] = [card("clubs", 9)];

    expect(moveFoundationToTableau(state, "hearts", 0)).toBe(false);
    expect(state.foundations.hearts).toHaveLength(2);
  });

  it("returns false when the foundation is empty", () => {
    const state = emptyState();
    expect(moveFoundationToTableau(state, "hearts", 0)).toBe(false);
  });
});

describe("moveTableauToTableau", () => {
  it("moves a face-up run and flips the newly exposed card", () => {
    const state = emptyState();
    state.tableau[0] = [card("spades", 10, false), card("clubs", 8), card("hearts", 7)];
    state.tableau[1] = [card("diamonds", 9)];

    expect(moveTableauToTableau(state, 0, 1, 1)).toBe(true);
    expect(state.tableau[0]).toHaveLength(1);
    expect(state.tableau[0][0].faceUp).toBe(true);
    expect(state.tableau[1].map((c) => c.id)).toEqual(["diamonds-9", "clubs-8", "hearts-7"]);
  });

  it("rejects moving a face-down card", () => {
    const state = emptyState();
    state.tableau[0] = [card("clubs", 8, false)];
    state.tableau[1] = [card("diamonds", 9)];

    expect(moveTableauToTableau(state, 0, 0, 1)).toBe(false);
  });

  it("rejects an illegal destination and leaves both columns unchanged", () => {
    const state = emptyState();
    state.tableau[0] = [card("clubs", 8)];
    state.tableau[1] = [card("diamonds", 2)];

    expect(moveTableauToTableau(state, 0, 0, 1)).toBe(false);
    expect(state.tableau[0]).toHaveLength(1);
    expect(state.tableau[1]).toHaveLength(1);
  });
});

describe("moveTableauToFoundation", () => {
  it("moves the top card to its foundation and flips the newly exposed card", () => {
    const state = emptyState();
    state.tableau[0] = [card("spades", 5, false), card("hearts", 1)];

    expect(moveTableauToFoundation(state, 0)).toBe(true);
    expect(state.foundations.hearts.map((c) => c.id)).toEqual(["hearts-1"]);
    expect(state.tableau[0]).toHaveLength(1);
    expect(state.tableau[0][0].faceUp).toBe(true);
  });

  it("rejects an out-of-sequence card", () => {
    const state = emptyState();
    state.tableau[0] = [card("hearts", 5)];

    expect(moveTableauToFoundation(state, 0)).toBe(false);
    expect(state.tableau[0]).toHaveLength(1);
  });
});

describe("isWon", () => {
  it("is false until all four foundations hold 13 cards", () => {
    const state = emptyState();
    expect(isWon(state)).toBe(false);

    for (const suit of ["spades", "hearts", "diamonds", "clubs"] as const) {
      state.foundations[suit] = Array.from({ length: 13 }, (_, i) => card(suit, i + 1));
    }
    expect(isWon(state)).toBe(true);
  });
});
