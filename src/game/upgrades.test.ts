import { describe, expect, it } from "vitest";
import { type Card, rankLabel, type Suit } from "./cards";
import {
  type DeckUpgrade,
  describeScope,
  scopeMatches,
  UPGRADES,
  upgradeById,
  type UpgradeId,
  upgradesForCard,
} from "./upgrades";

function card(suit: Suit, rank: number): Card {
  return { id: `${suit}-${rank}`, suit, rank, faceUp: true };
}

describe("UPGRADES", () => {
  it("has unique ids, a price, and some effect on each", () => {
    const ids = UPGRADES.map((upgrade) => upgrade.id);
    expect(new Set(ids).size).toBe(UPGRADES.length);

    for (const upgrade of UPGRADES) {
      expect(upgrade.cost).toBeGreaterThan(0);
      const hasEffect =
        upgrade.chips !== undefined ||
        upgrade.mult !== undefined ||
        upgrade.multX !== undefined ||
        upgrade.money !== undefined;
      expect(hasEffect).toBe(true);
    }
  });

  it("rejects an unknown id", () => {
    expect(() => upgradeById("nope" as UpgradeId)).toThrow();
  });
});

describe("scopeMatches", () => {
  const sevenHearts = card("hearts", 7);

  it("matches a single card by id", () => {
    expect(scopeMatches({ kind: "card", cardId: "hearts-7" }, sevenHearts)).toBe(true);
    expect(scopeMatches({ kind: "card", cardId: "hearts-8" }, sevenHearts)).toBe(false);
  });

  it("matches a whole suit", () => {
    expect(scopeMatches({ kind: "suit", suit: "hearts" }, sevenHearts)).toBe(true);
    expect(scopeMatches({ kind: "suit", suit: "spades" }, sevenHearts)).toBe(false);
  });

  it("matches a whole rank across suits", () => {
    expect(scopeMatches({ kind: "rank", rank: 7 }, sevenHearts)).toBe(true);
    expect(scopeMatches({ kind: "rank", rank: 7 }, card("clubs", 7))).toBe(true);
    expect(scopeMatches({ kind: "rank", rank: 8 }, sevenHearts)).toBe(false);
  });
});

describe("upgradesForCard", () => {
  const deck: DeckUpgrade[] = [
    { scope: { kind: "card", cardId: "hearts-7" }, upgrade: "gold" },
    { scope: { kind: "suit", suit: "hearts" }, upgrade: "bonus" },
    { scope: { kind: "rank", rank: 7 }, upgrade: "mult" },
    { scope: { kind: "suit", suit: "spades" }, upgrade: "foil" },
  ];

  it("collects every scope that covers the card, in the order bought", () => {
    const found = upgradesForCard(card("hearts", 7), deck).map((upgrade) => upgrade.id);
    expect(found).toEqual(["gold", "bonus", "mult"]);
  });

  it("picks up only the category upgrades for a card not named directly", () => {
    expect(upgradesForCard(card("hearts", 3), deck).map((u) => u.id)).toEqual(["bonus"]);
    expect(upgradesForCard(card("clubs", 7), deck).map((u) => u.id)).toEqual(["mult"]);
  });

  it("finds nothing on an untouched card", () => {
    expect(upgradesForCard(card("clubs", 3), deck)).toEqual([]);
  });

  it("stacks the same upgrade bought twice for the same card", () => {
    const twice: DeckUpgrade[] = [
      { scope: { kind: "card", cardId: "clubs-2" }, upgrade: "bonus" },
      { scope: { kind: "card", cardId: "clubs-2" }, upgrade: "bonus" },
    ];
    expect(upgradesForCard(card("clubs", 2), twice)).toHaveLength(2);
  });
});

describe("describeScope", () => {
  it("names a single card", () => {
    expect(describeScope({ kind: "card", cardId: "hearts-13" }, rankLabel)).toBe("K of hearts");
  });

  it("names a suit and a rank", () => {
    expect(describeScope({ kind: "suit", suit: "clubs" }, rankLabel)).toBe("all clubs");
    expect(describeScope({ kind: "rank", rank: 1 }, rankLabel)).toBe("every A");
  });
});
