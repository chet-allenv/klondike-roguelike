import { describe, expect, it } from "vitest";
import { createDeck, isRed, rankLabel, shuffle, SUITS } from "./cards";

describe("createDeck", () => {
  it("creates 52 unique cards, 13 per suit, all face down", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.every((c) => !c.faceUp)).toBe(true);

    for (const suit of SUITS) {
      const ranks = deck.filter((c) => c.suit === suit).map((c) => c.rank);
      expect(ranks.sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
      ]);
    }
  });
});

describe("shuffle", () => {
  it("returns the same multiset of items in a new array", () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);

    expect(shuffled).not.toBe(deck);
    expect(shuffled).toHaveLength(deck.length);
    expect(shuffled.map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
  });

  it("does not mutate the input array", () => {
    const original = [1, 2, 3, 4, 5];
    const copy = original.slice();
    shuffle(original);
    expect(original).toEqual(copy);
  });
});

describe("rankLabel", () => {
  it("labels face cards and ace", () => {
    expect(rankLabel(1)).toBe("A");
    expect(rankLabel(11)).toBe("J");
    expect(rankLabel(12)).toBe("Q");
    expect(rankLabel(13)).toBe("K");
  });

  it("passes through numeric ranks", () => {
    expect(rankLabel(2)).toBe("2");
    expect(rankLabel(10)).toBe("10");
  });
});

describe("isRed", () => {
  it("classifies hearts and diamonds as red", () => {
    expect(isRed("hearts")).toBe(true);
    expect(isRed("diamonds")).toBe(true);
  });

  it("classifies spades and clubs as black", () => {
    expect(isRed("spades")).toBe(false);
    expect(isRed("clubs")).toBe(false);
  });
});
