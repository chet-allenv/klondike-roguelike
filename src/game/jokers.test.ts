import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { conditionHolds, type JokerId, jokerById, jokerRoundEndMoney, JOKERS } from "./jokers";

function card(suit: Suit, rank: number): Card {
  return { id: `${suit}-${rank}`, suit, rank, faceUp: true };
}

describe("JOKERS", () => {
  it("has unique ids, a price, and a name and description on each", () => {
    const ids = JOKERS.map((joker) => joker.id);
    expect(new Set(ids).size).toBe(JOKERS.length);

    for (const joker of JOKERS) {
      expect(joker.cost).toBeGreaterThan(0);
      expect(joker.name).toBeTruthy();
      expect(joker.description).toBeTruthy();
    }
  });

  it("gives every joker something to do", () => {
    for (const joker of JOKERS) {
      expect(joker.onScore ?? joker.onRoundEnd).toBeDefined();
    }
  });

  it("rejects an unknown id", () => {
    expect(() => jokerById("nope" as JokerId)).toThrow();
  });
});

describe("conditionHolds", () => {
  const sevenHearts = card("hearts", 7);

  it("holds for every card when there is no condition", () => {
    expect(conditionHolds(undefined, sevenHearts, 0)).toBe(true);
    expect(conditionHolds({}, sevenHearts, 0)).toBe(true);
  });

  it("checks suit", () => {
    expect(conditionHolds({ suit: "hearts" }, sevenHearts, 0)).toBe(true);
    expect(conditionHolds({ suit: "clubs" }, sevenHearts, 0)).toBe(false);
  });

  it("checks color", () => {
    expect(conditionHolds({ color: "red" }, sevenHearts, 0)).toBe(true);
    expect(conditionHolds({ color: "black" }, sevenHearts, 0)).toBe(false);
    expect(conditionHolds({ color: "black" }, card("spades", 7), 0)).toBe(true);
  });

  it("checks a list of ranks", () => {
    expect(conditionHolds({ ranks: [7, 8] }, sevenHearts, 0)).toBe(true);
    expect(conditionHolds({ ranks: [11, 12, 13] }, sevenHearts, 0)).toBe(false);
  });

  it("checks rank parity", () => {
    expect(conditionHolds({ parity: "odd" }, sevenHearts, 0)).toBe(true);
    expect(conditionHolds({ parity: "even" }, sevenHearts, 0)).toBe(false);
    expect(conditionHolds({ parity: "even" }, card("hearts", 8), 0)).toBe(true);
  });

  it("checks a combo threshold", () => {
    expect(conditionHolds({ minCombo: 3 }, sevenHearts, 2)).toBe(false);
    expect(conditionHolds({ minCombo: 3 }, sevenHearts, 3)).toBe(true);
  });

  it("requires every clause to hold, not just one", () => {
    expect(conditionHolds({ suit: "hearts", parity: "odd" }, sevenHearts, 0)).toBe(true);
    expect(conditionHolds({ suit: "hearts", parity: "even" }, sevenHearts, 0)).toBe(false);
  });
});

describe("jokerRoundEndMoney", () => {
  it("is nothing without a money joker", () => {
    expect(jokerRoundEndMoney([jokerById("joker"), jokerById("lusty")])).toBe(0);
  });

  it("adds up the money jokers held", () => {
    const rocket = jokerById("rocket");
    expect(jokerRoundEndMoney([rocket])).toBe(rocket.onRoundEnd?.money);
    expect(jokerRoundEndMoney([rocket, rocket])).toBe((rocket.onRoundEnd?.money ?? 0) * 2);
  });
});
