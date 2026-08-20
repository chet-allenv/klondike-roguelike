import { beforeEach, describe, expect, it } from "vitest";
import type { Card, Suit } from "../game/cards";
import type { GameState } from "../game/klondike";
import { mountGame } from "./render";

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
});

function mount(initialState?: GameState) {
  mountGame(root, initialState);
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
