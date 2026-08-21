import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

/**
 * Smart click and drop hints are opt-in assists now (see `Assists` in
 * render.ts) — off unless a hand asks for them. Tests that exercise those
 * assists, or that just lean on smart click to make a move in one step,
 * have to turn them on explicitly.
 */
const SMART_CLICK: MountOptions = { assists: { smartClick: true } };
const DROP_HINTS: MountOptions = { assists: { dropHints: true } };

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
  it("is off by default — an unambiguous card is only selected, not moved", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 1)];
    mount(state);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(true);
    expect(scoreText()).toBe("Score: 0");
  });

  it("sends a waste Ace straight to its foundation", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 1)];
    mount(state, SMART_CLICK);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    expect(root.querySelector(".pile.foundation .card")?.textContent).toContain("A");
    expect(scoreText()).toBe("Score: 10");
  });

  it("sends a waste card to the single legal tableau column", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 8)];
    mount(state, SMART_CLICK);

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
    mount(state, SMART_CLICK);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(true);
  });

  it("does not auto-move a card with no legal destination, and selects instead", () => {
    const state = emptyState();
    state.waste = [card("hearts", 7)];
    state.tableau[0] = [card("clubs", 2)];
    mount(state, SMART_CLICK);

    click(".pile.waste");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(true);
  });

  it("auto-moves a tableau card to its foundation and awards a reveal bonus", () => {
    const state = emptyState();
    state.tableau[0] = [card("spades", 9, false), card("hearts", 1)];
    mount(state, SMART_CLICK);

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
    mount(state, SMART_CLICK);

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
    mount(state, SMART_CLICK);

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
    mount(state, SMART_CLICK);

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
    mount(state, SMART_CLICK);

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
    mount(state, { ...SMART_CLICK, undosAllowed: 1 });

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
    mount(state, { ...SMART_CLICK, onHandEnd: (r) => results.push(r) });

    click(".pile.waste"); // smart-moves the King to complete the last foundation

    expect(root.querySelector(".win-banner")).not.toBeNull();
    expect(results).toEqual([{ won: true, score: 10 }]);
  });

  it("wins the round immediately on reaching the target, without finishing the hand", () => {
    const state = emptyState();
    state.waste = [card("diamonds", 1)];
    state.tableau[0] = [card("clubs", 5)]; // left over on the board — hand is not won or stuck

    const results: HandEndResult[] = [];
    mount(state, { ...SMART_CLICK, target: 10, onHandEnd: (r) => results.push(r) });

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

/*
 * Drag and drop. jsdom does no layout, so every getBoundingClientRect is
 * 0x0 and hit-testing a drop would be meaningless — these tests stub in a
 * synthetic layout that gives each `data-drop` zone its own 90x90 box in a
 * row, keyed by the zone name, and parks every card well clear of them.
 */
const ZONE_ORDER = [
  "foundation:spades",
  "foundation:hearts",
  "foundation:diamonds",
  "foundation:clubs",
  "tableau:0",
  "tableau:1",
  "tableau:2",
  "tableau:3",
  "tableau:4",
  "tableau:5",
  "tableau:6",
];

const CARD_ORIGIN: [number, number] = [10, 900];

function box(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  } as DOMRect;
}

function zoneCenter(drop: string): [number, number] {
  const index = ZONE_ORDER.indexOf(drop);
  if (index < 0) throw new Error(`unknown drop zone ${drop}`);
  return [index * 100 + 45, 45];
}

function pointerEvent(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1,
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
}

function press(selector: string) {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no element matches ${selector}`);
  el.dispatchEvent(pointerEvent("pointerdown", ...CARD_ORIGIN));
}

function moveOver(drop: string) {
  window.dispatchEvent(pointerEvent("pointermove", ...zoneCenter(drop)));
}

function release(drop: string) {
  window.dispatchEvent(pointerEvent("pointerup", ...zoneCenter(drop)));
}

function dragTo(selector: string, drop: string) {
  press(selector);
  moveOver(drop);
  release(drop);
}

function columnCards(col: number): string[] {
  const colEl = root.querySelector(`[data-drop="tableau:${col}"]`);
  return Array.from(colEl?.querySelectorAll("[data-card-id]") ?? []).map(
    (el) => (el as HTMLElement).dataset.cardId ?? "",
  );
}

describe("drag and drop", () => {
  const realRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const drop = this.dataset.drop;
      if (drop) return box(ZONE_ORDER.indexOf(drop) * 100, 0, 90, 90);
      return box(CARD_ORIGIN[0], CARD_ORIGIN[1], 80, 112);
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  it("drops the waste card onto a legal tableau column and scores the move", () => {
    const state = emptyState();
    state.waste = [card("hearts", 5)];
    state.tableau[2] = [card("spades", 6)];
    mount(state);

    dragTo('[data-card-id="hearts-5"]', "tableau:2");

    expect(columnCards(2)).toEqual(["spades-6", "hearts-5"]);
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    expect(scoreText()).toBe("Score: 5");
  });

  it("leaves the card where it was when dropped on an illegal column", () => {
    const state = emptyState();
    state.waste = [card("hearts", 5)];
    state.tableau[3] = [card("hearts", 6)]; // same color — can't stack
    mount(state);

    dragTo('[data-card-id="hearts-5"]', "tableau:3");

    expect(columnCards(3)).toEqual(["hearts-6"]);
    expect(root.querySelector('.pile.waste [data-card-id="hearts-5"]')).not.toBeNull();
    expect(scoreText()).toBe("Score: 0");
  });

  it("drags a whole face-up run, revealing the card underneath it", () => {
    const state = emptyState();
    state.tableau[0] = [card("clubs", 9, false), card("hearts", 8), card("spades", 7)];
    state.tableau[1] = [card("spades", 9)];
    mount(state);

    dragTo('[data-card-id="hearts-8"]', "tableau:1");

    expect(columnCards(1)).toEqual(["spades-9", "hearts-8", "spades-7"]);
    expect(columnCards(0)).toEqual(["clubs-9"]);
    expect(root.querySelector('[data-card-id="clubs-9"]')?.classList.contains("face-up")).toBe(true);
  });

  it("drops onto the card's own foundation", () => {
    const state = emptyState();
    state.waste = [card("hearts", 1)];
    mount(state);

    dragTo('[data-card-id="hearts-1"]', "foundation:hearts");

    expect(
      root.querySelector('[data-drop="foundation:hearts"] [data-card-id="hearts-1"]'),
    ).not.toBeNull();
    expect(scoreText()).toBe("Score: 10");
  });

  it("routes a foundation drop to the card's own suit, whichever pile it lands on", () => {
    const state = emptyState();
    state.waste = [card("hearts", 1)];
    mount(state);

    dragTo('[data-card-id="hearts-1"]', "foundation:clubs");

    expect(
      root.querySelector('[data-drop="foundation:hearts"] [data-card-id="hearts-1"]'),
    ).not.toBeNull();
    expect(root.querySelector('[data-drop="foundation:clubs"]')?.classList.contains("empty")).toBe(
      true,
    );
    expect(scoreText()).toBe("Score: 10");
  });

  it("still rejects a foundation drop the card can't legally make", () => {
    const state = emptyState();
    state.waste = [card("hearts", 5)]; // no Ace-through-4 below it yet
    mount(state);

    dragTo('[data-card-id="hearts-5"]', "foundation:hearts");

    expect(root.querySelector('.pile.waste [data-card-id="hearts-5"]')).not.toBeNull();
    expect(root.querySelector('[data-drop="foundation:hearts"]')?.classList.contains("empty")).toBe(
      true,
    );
  });

  it("highlights the destination foundation, not the pile under the pointer", () => {
    const state = emptyState();
    state.waste = [card("hearts", 1)];
    mount(state, DROP_HINTS);

    press('[data-card-id="hearts-1"]');
    moveOver("foundation:clubs");

    expect(root.querySelector('[data-drop="foundation:hearts"]')?.classList.contains("drop-active")).toBe(
      true,
    );
    expect(root.querySelector('[data-drop="foundation:clubs"]')?.classList.contains("drop-active")).toBe(
      false,
    );
    // Only the pile it can actually land on is offered, not all four.
    expect(root.querySelectorAll(".drop-legal")).toHaveLength(1);
  });

  it("refuses to drop a run onto a foundation, even a matching one", () => {
    const state = emptyState();
    state.tableau[0] = [card("hearts", 1), card("spades", 5)];
    mount(state);

    dragTo('[data-card-id="hearts-1"]', "foundation:hearts");

    expect(columnCards(0)).toEqual(["hearts-1", "spades-5"]);
    expect(root.querySelector('[data-drop="foundation:hearts"]')?.classList.contains("empty")).toBe(
      true,
    );
  });

  it("honors the drop target instead of the smart-click destination", () => {
    const state = emptyState();
    state.waste = [card("hearts", 1)];
    state.tableau[2] = [card("spades", 2)];
    mount(state, SMART_CLICK);

    // With smart click on, clicking this Ace would send it straight to its
    // foundation; dragging it onto a column has to win over that shortcut.
    dragTo('[data-card-id="hearts-1"]', "tableau:2");

    expect(columnCards(2)).toEqual(["spades-2", "hearts-1"]);
    expect(root.querySelector('[data-drop="foundation:hearts"]')?.classList.contains("empty")).toBe(
      true,
    );
  });

  it("drags a card back off a foundation onto a legal column", () => {
    const state = emptyState();
    state.foundations.hearts = [card("hearts", 1), card("hearts", 2)];
    state.tableau[3] = [card("spades", 3)];
    mount(state);

    dragTo('[data-card-id="hearts-2"]', "tableau:3");

    expect(columnCards(3)).toEqual(["spades-3", "hearts-2"]);
    expect(scoreText()).toBe("Score: -15");
  });

  it("shows no drop highlights by default, but still lands the drop", () => {
    const state = emptyState();
    state.waste = [card("hearts", 5)];
    state.tableau[2] = [card("spades", 6)];
    mount(state);

    press('[data-card-id="hearts-5"]');
    moveOver("tableau:2");
    expect(root.querySelectorAll(".drop-legal, .drop-active")).toHaveLength(0);

    release("tableau:2");
    expect(columnCards(2)).toEqual(["spades-6", "hearts-5"]);
  });

  it("highlights every legal zone, and the one under the pointer, with the assist on", () => {
    const state = emptyState();
    state.waste = [card("hearts", 5)];
    state.tableau[2] = [card("spades", 6)];
    state.tableau[4] = [card("clubs", 6)];
    mount(state, DROP_HINTS);

    press('[data-card-id="hearts-5"]');
    moveOver("tableau:2");

    expect(root.querySelectorAll(".drop-legal")).toHaveLength(2);
    expect(root.querySelector('[data-drop="tableau:2"]')?.classList.contains("drop-active")).toBe(
      true,
    );
    expect(root.querySelector('[data-drop="tableau:4"]')?.classList.contains("drop-active")).toBe(
      false,
    );

    moveOver("tableau:4");
    expect(root.querySelector('[data-drop="tableau:2"]')?.classList.contains("drop-active")).toBe(
      false,
    );
    expect(root.querySelector('[data-drop="tableau:4"]')?.classList.contains("drop-active")).toBe(
      true,
    );

    release("tableau:4");
    expect(root.querySelectorAll(".drop-legal, .drop-active")).toHaveLength(0);
  });

  it("cancels the drag on Escape without moving anything", () => {
    const state = emptyState();
    state.waste = [card("hearts", 5)];
    state.tableau[2] = [card("spades", 6)];
    mount(state);

    press('[data-card-id="hearts-5"]');
    moveOver("tableau:2");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    release("tableau:2");

    expect(columnCards(2)).toEqual(["spades-6"]);
    expect(root.querySelector('.pile.waste [data-card-id="hearts-5"]')).not.toBeNull();
    expect(root.querySelectorAll(".drag-layer")).toHaveLength(0);
  });

  it("still lets a press that never moves fall through to a click", () => {
    const state = emptyState();
    state.waste = [card("hearts", 1)];
    mount(state, SMART_CLICK);

    press('[data-card-id="hearts-1"]');
    window.dispatchEvent(pointerEvent("pointerup", ...CARD_ORIGIN));
    click(".pile.waste");

    expect(
      root.querySelector('[data-drop="foundation:hearts"] [data-card-id="hearts-1"]'),
    ).not.toBeNull();
  });
});
