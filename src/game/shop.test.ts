import { describe, expect, it } from "vitest";
import { JOKERS } from "./jokers";
import { POWER_UPS } from "./powerups";
import {
  itemCost,
  itemDescription,
  itemName,
  JOKER_SLOTS,
  REROLL_BASE_COST,
  REROLL_COST_STEP,
  rerollCost,
  rollStock,
  UPGRADE_SLOTS,
  VOUCHER_SLOTS,
} from "./shop";

const EMPTY = { jokers: [], vouchers: [] };

function kinds(stock: ReturnType<typeof rollStock>) {
  return stock.items.map((item) => item.kind);
}

describe("rollStock", () => {
  it("fills every slot on a fresh run", () => {
    const stock = rollStock(EMPTY);
    expect(kinds(stock).filter((kind) => kind === "joker")).toHaveLength(JOKER_SLOTS);
    expect(kinds(stock).filter((kind) => kind === "voucher")).toHaveLength(VOUCHER_SLOTS);
    expect(kinds(stock).filter((kind) => kind === "upgrade")).toHaveLength(UPGRADE_SLOTS);
  });

  it("never stocks two of the same joker at once", () => {
    for (let i = 0; i < 25; i++) {
      const jokers = rollStock(EMPTY)
        .items.filter((item) => item.kind === "joker")
        .map((item) => (item.kind === "joker" ? item.joker.id : ""));
      expect(new Set(jokers).size).toBe(jokers.length);
    }
  });

  it("never sells a joker the run already holds", () => {
    const held = JOKERS.slice(0, JOKERS.length - 1).map((joker) => joker.id);
    for (let i = 0; i < 10; i++) {
      const stock = rollStock({ jokers: held, vouchers: [] });
      const offered = stock.items
        .filter((item) => item.kind === "joker")
        .map((item) => (item.kind === "joker" ? item.joker.id : ""));
      expect(offered).toEqual([JOKERS[JOKERS.length - 1].id]);
    }
  });

  it("leaves the joker slots empty rather than duplicating when every joker is held", () => {
    const stock = rollStock({ jokers: JOKERS.map((joker) => joker.id), vouchers: [] });
    expect(kinds(stock).filter((kind) => kind === "joker")).toHaveLength(0);
    // The other categories still stock normally.
    expect(kinds(stock).filter((kind) => kind === "upgrade")).toHaveLength(UPGRADE_SLOTS);
  });

  it("keeps stocking repeatable vouchers but drops held one-offs", () => {
    const oneOffs = POWER_UPS.filter((voucher) => !voucher.repeatable).map((voucher) => voucher.id);
    for (let i = 0; i < 25; i++) {
      const stock = rollStock({ jokers: [], vouchers: oneOffs });
      for (const item of stock.items) {
        if (item.kind === "voucher") expect(item.voucher.repeatable).toBe(true);
      }
    }
  });

  it("keeps offering upgrades regardless of what's been bought — they reapply to new cards", () => {
    const stock = rollStock(EMPTY);
    expect(kinds(stock).filter((kind) => kind === "upgrade")).toHaveLength(UPGRADE_SLOTS);
  });

  it("remembers how many times it's been rerolled", () => {
    expect(rollStock(EMPTY, 3).rerolls).toBe(3);
  });
});

describe("rerollCost", () => {
  it("starts at the base price", () => {
    expect(rerollCost(0)).toBe(REROLL_BASE_COST);
  });

  it("gets dearer with each reroll in a visit", () => {
    expect(rerollCost(2)).toBe(REROLL_BASE_COST + 2 * REROLL_COST_STEP);
  });
});

describe("item accessors", () => {
  it("read name, cost and description across all three kinds", () => {
    const stock = rollStock(EMPTY);
    for (const item of stock.items) {
      expect(itemName(item)).toBeTruthy();
      expect(itemDescription(item)).toBeTruthy();
      expect(itemCost(item)).toBeGreaterThan(0);
    }
  });
});
