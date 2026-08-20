import { beforeEach, describe, expect, it } from "vitest";
import { mountGame } from "./render";

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
  mountGame(root);
});

function click(selector: string) {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no element matches ${selector}`);
  el.click();
}

describe("mountGame — initial render", () => {
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
});

describe("stock interaction", () => {
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
});

describe("selection", () => {
  it("toggles the selected class on the waste card when clicked twice", () => {
    click(".pile.stock"); // draw a card so the waste has something to select
    click(".pile.waste");
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(true);

    click(".pile.waste");
    expect(root.querySelector(".pile.waste .card")?.classList.contains("selected")).toBe(false);
  });

  it("selects a face-up tableau card on click", () => {
    // Column 0 has exactly one card in a fresh deal, and it's always face up.
    click(".tableau-row .column:first-child .card");
    expect(
      root.querySelector(".tableau-row .column:first-child .card")?.classList.contains("selected"),
    ).toBe(true);
  });

  it("clears the selection after attempting a move to a different column", () => {
    click(".tableau-row .column:first-child .card");
    click(".tableau-row .column:nth-child(2) .card");

    expect(root.querySelectorAll(".card.selected")).toHaveLength(0);
  });
});

describe("New Game", () => {
  it("resets the waste to empty and the stock to full", () => {
    click(".pile.stock");
    click(".pile.stock");
    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(false);

    click(".new-game");

    expect(root.querySelector(".pile.waste")?.classList.contains("empty")).toBe(true);
    expect(root.querySelector(".pile.stock")?.classList.contains("empty")).toBe(false);
    expect(root.querySelector(".win-banner")).toBeNull();
  });
});
