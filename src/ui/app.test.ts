import { beforeEach, describe, expect, it } from "vitest";
import { SUITS, type Suit } from "../game/cards";
import { STARTING_MONEY } from "../game/economy";
import { JOKERS } from "../game/jokers";
import type { GameState } from "../game/klondike";
import { BASE_TARGET, STARTING_LIVES, UNDOS_PER_ROUND } from "../game/roguelike";
import { JOKER_LIMIT, REROLL_BASE_COST } from "../game/shop";
import { mountApp, type AppOptions } from "./app";

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
});

function mount(options: AppOptions = {}) {
  mountApp(root, options);
}

/**
 * A target of 0 is already met by the opening score of 0, so a round with one
 * is won the instant it mounts — that's how these tests reach the shop
 * without playing a hand out.
 */
const INSTANT_WIN: AppOptions = { targetFor: (round) => (round === 1 ? 0 : 500) };

/**
 * A board with all four foundations complete. `mountGame` ends a hand the
 * moment it sees one, so dealing this finishes a round on mount with a score
 * of 0 — a loss against any target above zero.
 */
function finishedBoard(): GameState {
  const foundations = {} as Record<Suit, GameState["stock"]>;
  for (const suit of SUITS) {
    foundations[suit] = Array.from({ length: 13 }, (_, i) => ({
      id: `${suit}-${i + 1}`,
      suit,
      rank: i + 1,
      faceUp: true,
    }));
  }
  return { tableau: [[], [], [], [], [], [], []], foundations, stock: [], waste: [] };
}

const LOSING_RUN: AppOptions = { deal: finishedBoard, targetFor: () => 500 };

function text(selector: string): string {
  return root.querySelector(selector)?.textContent ?? "";
}

function shopItems(kind?: string): HTMLButtonElement[] {
  const selector = kind ? `.shop-item[data-item-kind="${kind}"]` : ".shop-item";
  return Array.from(root.querySelectorAll<HTMLButtonElement>(selector));
}

function clickButton(selector: string) {
  const el = root.querySelector<HTMLButtonElement>(selector);
  if (!el) throw new Error(`no button matches ${selector}`);
  el.click();
}

describe("mountApp — round 1", () => {
  beforeEach(() => mount());

  it("renders a playable board", () => {
    expect(root.querySelectorAll(".pile.stock")).toHaveLength(1);
    expect(root.querySelectorAll(".tableau-row .column")).toHaveLength(7);
  });

  it("shows the target, lives, mult and starting money in the HUD", () => {
    expect(text(".hud .score")).toBe(`Score: 0 / ${BASE_TARGET}`);
    expect(text(".hud .round-info")).toContain("Round 1");
    expect(text(".hud .round-info")).toContain(String(STARTING_LIVES));
    expect(text(".hud .mult")).toBe("Mult x1");
    expect(text(".hud .money")).toBe(`$${STARTING_MONEY}`);
  });

  it("shows nothing held before anything is bought", () => {
    expect(root.querySelector(".hud .jokers")).toBeNull();
    expect(root.querySelector(".hud .power-ups")).toBeNull();
    expect(root.querySelector(".hud .peek")).toBeNull();
  });
});

describe("mountApp — the payout", () => {
  it("itemises what a cleared round paid and banks it", () => {
    mount(INSTANT_WIN);

    expect(text(".round-result h2")).toBe("Round Cleared!");
    const payout = root.querySelector(".payout");
    expect(payout?.textContent).toContain("Round cleared");
    expect(payout?.textContent).toContain("Unspent redeals & undos");

    // Whatever it came to, the shop is holding it.
    const total = Number(text("dd.payout-total").replace("$", ""));
    expect(total).toBeGreaterThan(0);
    expect(text(".shop-money")).toBe(`$${STARTING_MONEY + total}`);
  });

  it("pays a lost round nothing", () => {
    mount(LOSING_RUN);

    expect(text(".round-result h2")).toBe("Round Lost");
    expect(text("dt.payout-total")).toBe("No payout");
    expect(text("dd.payout-total")).toBe("$0");
  });
});

describe("mountApp — the shop", () => {
  beforeEach(() => mount(INSTANT_WIN));

  it("stocks jokers, a voucher and card upgrades, each priced and described", () => {
    expect(shopItems("joker").length).toBeGreaterThan(0);
    expect(shopItems("voucher").length).toBeGreaterThan(0);
    expect(shopItems("upgrade").length).toBeGreaterThan(0);

    for (const item of shopItems()) {
      expect(item.querySelector(".shop-item-name")?.textContent).toBeTruthy();
      expect(item.querySelector(".shop-item-price")?.textContent).toMatch(/^\$\d+$/);
      expect(item.querySelector(".shop-item-description")?.textContent).toBeTruthy();
    }
  });

  it("buys a joker, charges for it, and carries it into the next round", () => {
    const before = Number(text(".shop-money").replace("$", ""));
    const [joker] = shopItems("joker");
    const name = joker.querySelector(".shop-item-name")?.textContent ?? "";
    const price = Number(joker.querySelector(".shop-item-price")?.textContent?.replace("$", ""));

    joker.click();

    expect(text(".shop-money")).toBe(`$${before - price}`);
    expect(shopItems("joker").map((el) => el.dataset.itemId)).not.toContain(joker.dataset.itemId);

    clickButton(".shop .continue");
    expect(text(".hud .jokers")).toContain(name);
    expect(text(".hud .money")).toBe(`$${before - price}`);
  });

  it("buys a voucher and carries it into the next round", () => {
    const [voucher] = shopItems("voucher");
    const name = voucher.querySelector(".shop-item-name")?.textContent ?? "";

    voucher.click();
    clickButton(".shop .continue");

    expect(text(".hud .power-ups")).toContain(name);
  });

  it("rerolls the stock for a price", () => {
    const before = Number(text(".shop-money").replace("$", ""));

    clickButton(".reroll");

    expect(text(".shop-money")).toBe(`$${before - REROLL_BASE_COST}`);
    expect(shopItems().length).toBeGreaterThan(0);
    // The next reroll of the same visit costs more.
    expect(text(".reroll")).not.toBe(`Reroll ($${REROLL_BASE_COST})`);
  });

  it("disables anything the player can't afford", () => {
    // Drain the purse on rerolls, then everything should be greyed out.
    for (let i = 0; i < 20; i++) {
      const reroll = root.querySelector<HTMLButtonElement>(".reroll");
      if (!reroll || reroll.disabled) break;
      reroll.click();
    }

    const money = Number(text(".shop-money").replace("$", ""));
    for (const item of shopItems()) {
      const price = Number(item.querySelector(".shop-item-price")?.textContent?.replace("$", ""));
      expect(item.disabled).toBe(price > money);
    }
  });
});

describe("mountApp — card upgrades", () => {
  beforeEach(() => mount(INSTANT_WIN));

  function buyUpgrade(): string {
    const [upgrade] = shopItems("upgrade");
    const name = upgrade.querySelector(".shop-item-name")?.textContent ?? "";
    upgrade.click();
    return name;
  }

  it("asks what a bought upgrade attaches to, offering cards, suits and ranks", () => {
    const name = buyUpgrade();

    expect(text(".scope-prompt")).toBe(`Apply ${name} to:`);
    expect(root.querySelectorAll(".scope-suits .scope-choice")).toHaveLength(4);
    expect(root.querySelectorAll(".scope-ranks .scope-choice")).toHaveLength(13);
    expect(root.querySelectorAll(".scope-cards .scope-choice")).toHaveLength(52);
  });

  it("returns to the shop once a scope is chosen", () => {
    buyUpgrade();
    clickButton('.scope-choice[data-scope="suit:hearts"]');

    expect(root.querySelector(".scope-picker")).toBeNull();
    expect(shopItems().length).toBeGreaterThan(0);
  });

  it("charges for the upgrade at the moment of purchase, not at the moment it's placed", () => {
    const before = Number(text(".shop-money").replace("$", ""));
    const [upgrade] = shopItems("upgrade");
    const price = Number(upgrade.querySelector(".shop-item-price")?.textContent?.replace("$", ""));

    upgrade.click();

    expect(root.querySelector(".scope-picker")).not.toBeNull();
    clickButton('.scope-choice[data-scope="rank:1"]');
    expect(text(".shop-money")).toBe(`$${before - price}`);
  });
});

describe("mountApp — joker slots", () => {
  it("stops selling jokers once the run is full", () => {
    mount({ targetFor: () => 0 });

    let bought = 0;
    for (let visit = 0; visit < 60 && bought < JOKER_LIMIT; visit++) {
      const affordable = shopItems("joker").find((el) => !el.disabled);
      if (affordable) {
        affordable.click();
        bought += 1;
        continue;
      }
      const reroll = root.querySelector<HTMLButtonElement>(".reroll");
      if (reroll && !reroll.disabled) {
        reroll.click();
        continue;
      }
      clickButton(".shop .continue"); // next round, fresh money and stock
    }

    expect(bought).toBe(JOKER_LIMIT);
    expect(JOKER_LIMIT).toBeLessThanOrEqual(JOKERS.length);
    for (const joker of shopItems("joker")) {
      expect(joker.disabled).toBe(true);
      expect(joker.querySelector(".shop-item-description")?.textContent).toContain("slots full");
    }
  });
});

describe("mountApp — a voucher's effect reaches the hand", () => {
  it("raises the undo allotment once Extra Undo is bought", () => {
    // Keep winning instantly, rerolling and moving on between shops, until
    // Extra Undo is on the shelf — then stop winning so a board renders.
    let instantWin = true;
    mount({ targetFor: () => (instantWin ? 0 : 500) });

    for (let visit = 0; visit < 60; visit++) {
      const extraUndo = shopItems("voucher").find((el) => el.dataset.itemId === "extra-undo");
      if (extraUndo && !extraUndo.disabled) {
        extraUndo.click();
        instantWin = false;
        clickButton(".shop .continue");
        expect(text(".hud .undos-left")).toContain(String(UNDOS_PER_ROUND + 1));
        expect(text(".hud .power-ups")).toContain("Extra Undo");
        return;
      }

      const reroll = root.querySelector<HTMLButtonElement>(".reroll");
      if (reroll && !reroll.disabled) {
        reroll.click();
        continue;
      }
      clickButton(".shop .continue"); // next round: fresh money and fresh stock
    }

    throw new Error("Extra Undo never came up in 60 shop visits");
  });
});

describe("mountApp — losing", () => {
  it("costs a life and offers Continue rather than a shop", () => {
    mount(LOSING_RUN);

    expect(text(".round-result h2")).toBe("Round Lost");
    expect(root.querySelector(".shop")).toBeNull();
    expect(text(".round-result")).toContain(`Lives: ${STARTING_LIVES - 1}`);
    expect(text(".continue")).toBe("Continue");
  });

  it("ends the run once lives run out, listing everything collected", () => {
    mount(LOSING_RUN);
    for (let i = 1; i < STARTING_LIVES; i++) clickButton(".continue");

    expect(text(".round-result")).toContain("Run over");
    expect(text(".collected-jokers")).toBe("Jokers: none");
    expect(text(".collected")).toBe("Vouchers: none");
    expect(text(".collected-upgrades")).toBe("Deck: unmodified");
    expect(text(".continue")).toBe("New Run");
  });

  it("lists a bought card upgrade in the run summary", () => {
    // Win round 1 to reach a shop, then lose out from round 2 onwards.
    mount({ deal: finishedBoard, targetFor: (round) => (round === 1 ? 0 : 500) });
    const [upgrade] = shopItems("upgrade");
    const id = upgrade.dataset.itemId;

    upgrade.click();
    clickButton('.scope-choice[data-scope="card:hearts-7"]');
    clickButton(".shop .continue");
    for (let i = 1; i < STARTING_LIVES; i++) clickButton(".continue");

    expect(text(".collected-upgrades")).toContain(`${id} on 7 of hearts`);
  });

  it("deals a fresh run from the game-over screen", () => {
    mount(LOSING_RUN);
    for (let i = 1; i < STARTING_LIVES; i++) clickButton(".continue");
    expect(text(".continue")).toBe("New Run");

    clickButton(".continue");

    // Straight back into a losing round 1, but with lives restored.
    expect(text(".round-result")).toContain(`Lives: ${STARTING_LIVES - 1}`);
  });
});
