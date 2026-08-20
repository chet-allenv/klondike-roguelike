import { beforeEach, describe, expect, it } from "vitest";
import type { Card, Suit } from "../game/cards";
import type { GameState } from "../game/klondike";
import { type HandEndResult, mountGame, type MountOptions } from "./render";

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
});

function mount(initialState?: GameState, options: Omit<MountOptions, "initialState"> = {}) {
  mountGame(root, { initialState, ...options });
}

function click(selector: string) {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no element matches ${selector}`);
  el.click();
}

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

function scoreText(): string {
  return root.querySelector(".hud .score")?.textContent ?? "";
}

describe("mountGame — initial render", () => {
  beforeEach(() => mount());

  it("renders the stock, waste, 4 foundations, and 7 tableau columns", () => {
    expect(root.querySelectorAll(".pile.stock")).toHaveLength(1);
    expect(root.querySelectorAll(".pile.waste")).toHaveLength(1);
    expect(root.querySelectorAll(".pile.foundation")).toHaveLength(4);
    expect(root.querySelectorAll(".tableau-row .column")).toHaveLength(7);
  });

  it("starts with an empty waste and a full stock", () => {
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(false);
  });

  it("shows no win banner for a freshly dealt hand", () => {
    expect(root.querySelector(".win-banner")).toBeNull();
  });

  it("starts the score at 0 and the Undo button disabled", () => {
    expect(scoreText()).toBe("Score: 0");
    expect(root.querySelector<HTMLButtonElement>(".undo")?.disabled).toBe(true);
  });
});

describe("stock interaction", () => {
  beforeEach(() => mount());

  it("moves a card from stock to waste on click", () => {
    click(".pile.stock");
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.waste .card")?.classList.contains("face-up")).toBe(true);
  });

  it("empties the stock after drawing all 24 stock cards, then redeals on the next click", () => {
    for (let i = 0; i < 23; i++) click(".pile.stock");
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(false);

    click(".pile.stock"); // 24th draw empties the stock
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(true);

    click(".pile.stock"); // 25th click redeals waste back into stock
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
  });

  it("enables Undo after drawing", () => {
    click(".pile.stock");
    expect(root.querySelector<HTMLButtonElement>(".undo")?.disabled).toBe(false);
  });
});

describe("smart click (auto-move)", () => {
  it("sends a waste Ace straight to its foundation", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 1)];
    mount(state);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    expect(root.querySelector(".pile.foundation .card")?.textContent).toContain("A");
    expect(scoreText()).toBe("Score: 10");
  });

  it("sends a waste card to the single legal tableau column", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 8)];
    mount(state);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    const column0Cards = root.querySelectorAll(".tableau-row .column:first-child .card");
    expect(column0Cards).toHaveLength(2);
    expect(scoreText()).toBe("Score: 5");
  });

  it("does not auto-move when two tableau columns are both legal, and selects instead", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 8)];
    state.tableau[1] = [card("spades", 8)];
    mount(state);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(true);
  });

  it("does not auto-move a card with no legal destination, and selects instead", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 2)];
    mount(state);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(true);
  });

  it("auto-moves a tableau card to its foundation and awards a reveal bonus", () => {
    const state = emptyState();
    state.tableau[0] = [card("spades", 9, false), card("hearts", 1)];
    mount(state);

    click(".tableau-row .column:first-child .card:last-child");

    expect(root.querySelectorAll(".tableau-row .column:first-child .card")).toHaveLength(1);
    expect(root.querySelector(".tableau-row .column:first-child .card")?.classList.contains("face-up")).toBe(
      true,
    );
    // +10 foundation play, +5 reveal
    expect(scoreText()).toBe("Score: 15");
  });
});

describe("manual select-then-move (ambiguous destinations)", () => {
  it("moves the selected card to a chosen column after selecting", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 8)];
    state.tableau[1] = [card("spades", 8)];
    mount(state);

    click(".pile.waste"); // ambiguous -> selects
    click(".tableau-row .column:nth-child(2)"); // choose column 1

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    expect(root.querySelectorAll(".tableau-row .column:nth-child(2) .card")).toHaveLength(2);
  });

  it("toggles selection off on a second click of the same card", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 8)];
    state.tableau[1] = [card("spades", 8)];
    mount(state);

    click(".pile.waste");
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(true);

    click(".pile.waste");
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(false);
  });

  it("clears the selection after an attempted move that turns out illegal", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 8)];
    state.tableau[1] = [card("spades", 8)];
    state.tableau[2] = [card("clubs", 2)]; // illegal destination for hearts-7
    mount(state);

    click(".pile.waste"); // ambiguous -> selects
    click(".tableau-row .column:nth-child(3)"); // illegal target

    expect(root.querySelectorAll(".card.selected")).toHaveLength(0);
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
  });
});

describe("undo", () => {
  it("restores the previous state and score", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 1)];
    mount(state);

    click(".pile.waste"); // auto-moves to foundation, score -> 10
    expect(scoreText()).toBe("Score: 10");

    click(".undo");

    expect(scoreText()).toBe("Score: 0");
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector<HTMLButtonElement>(".undo")?.disabled).toBe(true);
  });
});

describe("animation cues", () => {
  it("does not mark initially face-up cards as revealing on first paint", () => {
    const state = emptyState();
    state.tableau[0] = [card("hearts", 7)];
    mount(state);

    expect(root.querySelector(".tableau-row .column:first-child .card.revealing")).toBeNull();
  });

  it("marks a card as revealing when a move exposes it", () => {
    const state = emptyState();
    state.tableau[0] = [card("spades", 9, false), card("hearts", 1)];
    mount(state);

    click(".tableau-row .column:first-child .card:last-child"); // Ace auto-moves to foundation, exposing spades-9

    const revealed = root.querySelector(".tableau-row .column:first-child .card");
    expect(revealed?.classList.contains("revealing")).toBe(true);
    expect(revealed?.getAttribute("data-card-id")).toBe("spades-9");
  });

  it("keeps the covered waste card rendered underneath the new top card, instead of dropping it", () => {
    const state = emptyState();
    state.stock = [card("clubs", 5), card("hearts", 9)]; // hearts-9 drawn first, then clubs-5
    mount(state);

    click(".pile.stock"); // waste: [hearts-9], visible top is hearts-9
    click(".pile.stock"); // waste: [hearts-9, clubs-5], visible top is now clubs-5

    const wasteCards = root.querySelectorAll(".pile.waste .card");
    expect(wasteCards).toHaveLength(2);
    expect(wasteCards[0].getAttribute("data-card-id")).toBe("hearts-9"); // covered, still present
    expect(wasteCards[1].getAttribute("data-card-id")).toBe("clubs-5"); // on top
  });

  it("keeps the covered foundation card rendered underneath the new top card", () => {
    const state = emptyState();
    state.foundations.hearts = [card("hearts", 1)];
    state.waste = [card("hearts", 2)];
    mount(state);

    click(".pile.waste"); // hearts-2 auto-moves onto the hearts foundation

    const foundationCards = root.querySelectorAll(".pile.foundation .card");
    expect(foundationCards).toHaveLength(2);
    expect(foundationCards[0].getAttribute("data-card-id")).toBe("hearts-1");
    expect(foundationCards[1].getAttribute("data-card-id")).toBe("hearts-2");
  });

  it("celebrates on the win banner and foundations when the hand is won", () => {
    const state = emptyState();
    for (const suit of ["spades", "hearts", "diamonds"] as const) {
      state.foundations[suit] = Array.from({ length: 13 }, (_, i) => card(suit, i + 1));
    }
    state.foundations.clubs = Array.from({ length: 12 }, (_, i) => card("clubs", i + 1));
    state.waste = [card("clubs", 13)];
    mount(state);

    click(".pile.waste");

    expect(root.querySelector(".win-banner.celebrating")).not.toBeNull();
    expect(root.querySelectorAll(".pile.foundation.celebrating")).toHaveLength(4);
  });
});

describe("roguelike mode", () => {
  it("shows the target and round info in the HUD", () => {
    const state = emptyState();
    mount(state, { target: 150, roundInfo: { round: 3, lives: 2 } });

    expect(scoreText()).toBe("Score: 0 / 150");
    const roundInfo = root.querySelector(".hud .round-info")?.textContent ?? "";
    expect(roundInfo).toContain("Round 3");
    expect(roundInfo).toContain("2");
  });

  it("shows the remaining undo count and blocks undo once it's exhausted", () => {
    const state = emptyState();
    state.waste = [card("hearts", 1), card("clubs", 1)];
    mount(state, { undosAllowed: 1 });

    expect(root.querySelector(".hud .undos-left")?.textContent).toContain("1");

    click(".pile.waste"); // clubs Ace -> foundation
    click(".pile.waste"); // hearts Ace -> foundation
    expect(root.querySelectorAll(".pile.foundation .card")).toHaveLength(2);

    click(".undo"); // allowed: undosUsed 0 -> 1
    expect(root.querySelectorAll(".pile.foundation .card")).toHaveLength(1);
    expect(root.querySelector(".hud .undos-left")?.textContent).toContain("0");
    expect(root.querySelector<HTMLButtonElement>(".undo")?.disabled).toBe(true);

    click(".undo"); // blocked: allotment exhausted, even though history isn't empty
    expect(root.querySelectorAll(".pile.foundation .card")).toHaveLength(1);
  });

  it("shows the remaining redeal count and blocks drawing once it's exhausted", () => {
    const state = emptyState();
    state.stock = [card("clubs", 2)];
    mount(state, { redealsAllowed: 0 });

    expect(root.querySelector(".hud .redeals")?.textContent).toContain("0");

    click(".pile.stock"); // draws the one stock card to waste
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(true);

    click(".pile.stock"); // stock empty, no redeals left -> blocked, no-op
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(true);
  });

  it("hides the New Game button when onHandEnd is provided", () => {
    mount(undefined, { onHandEnd: () => {} });
    expect(root.querySelector(".new-game")).toBeNull();
  });

  it("calls onHandEnd once with the final score when the hand is won", () => {
    const state = emptyState();
    for (const suit of ["spades", "hearts", "diamonds"] as const) {
      state.foundations[suit] = Array.from({ length: 13 }, (_, i) => card(suit, i + 1));
    }
    state.foundations.clubs = Array.from({ length: 12 }, (_, i) => card("clubs", i + 1));
    state.waste = [card("clubs", 13)];

    const results: HandEndResult[] = [];
    mount(state, { onHandEnd: (r) => results.push(r) });

    click(".pile.waste"); // smart-moves the King to complete the last foundation

    expect(root.querySelector(".win-banner")).not.toBeNull();
    expect(results).toEqual([{ won: true, score: 10 }]);
  });

  it("wins the round immediately on reaching the target, without finishing the hand", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 1)];
    state.tableau[0] = [card("clubs", 5)]; // left over on the board — hand is not won or stuck

    const results: HandEndResult[] = [];
    mount(state, { target: 10, onHandEnd: (r) => results.push(r) });

    click(".pile.waste"); // Ace -> foundation, score hits 10 (the target) but the hand isn't won

    expect(root.querySelector(".win-banner")).toBeNull();
    expect(results).toEqual([{ won: true, score: 10 }]);
  });

  it("calls onHandEnd once with won:false when the round is stuck from the start", () => {
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

    const results: HandEndResult[] = [];
    mount(state, { redealsAllowed: 0, onHandEnd: (r) => results.push(r) });

    expect(results).toEqual([{ won: false, score: 0 }]);
  });
});

describe("New Game", () => {
  beforeEach(() => mount());

  it("resets the waste to empty, the stock to full, the score, and history", () => {
    click(".pile.stock");
    click(".pile.stock");
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);

    click(".new-game");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".win-banner")).toBeNull();
    expect(scoreText()).toBe("Score: 0");
    expect(root.querySelector<HTMLButtonElement>(".undo")?.disabled).toBe(true);
  });
});
