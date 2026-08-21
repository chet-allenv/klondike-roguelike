import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { type Joker, type JokerId, jokerById } from "./jokers";
import {
  applyScoreEvent,
  BASE_MULT,
  CHIPS,
  COMBO_MULT_STEP,
  createScoreState,
  isTriggeringEvent,
  scoreMove,
  type ScoreState,
} from "./scoring";
import { type Upgrade, type UpgradeId, upgradeById } from "./upgrades";

function card(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}-${rank}`, suit, rank, faceUp };
}

function jokers(...ids: JokerId[]): Joker[] {
  return ids.map(jokerById);
}

function upgrades(...ids: UpgradeId[]): Upgrade[] {
  return ids.map(upgradeById);
}

describe("createScoreState", () => {
  it("starts empty", () => {
    expect(createScoreState()).toEqual({
      total: 0,
      comboStreak: 0,
      comboGraceUsed: false,
      money: 0,
    });
  });
});

describe("scoreMove — base chips and mult", () => {
  it("scores a lone foundation play at base chips x base mult", () => {
    const move = scoreMove("foundation-play", 1, { card: card("hearts", 5) });
    expect(move.chips).toBe(CHIPS.FOUNDATION_PLAY);
    expect(move.mult).toBe(BASE_MULT);
    expect(move.points).toBe(CHIPS.FOUNDATION_PLAY * BASE_MULT);
  });

  it("raises mult with the combo streak", () => {
    const move = scoreMove("foundation-play", 3, { card: card("hearts", 5) });
    expect(move.mult).toBe(BASE_MULT + 2 * COMBO_MULT_STEP);
    expect(move.points).toBe(Math.round(CHIPS.FOUNDATION_PLAY * move.mult));
  });

  it("applies the run-wide multiplier on top of everything else", () => {
    const plain = scoreMove("foundation-play", 1, { card: card("hearts", 5) });
    const scaled = scoreMove("foundation-play", 1, { card: card("hearts", 5), multiplier: 2 });
    expect(scaled.mult).toBe(plain.mult * 2);
  });

  it("keeps the foundation-to-tableau penalty negative", () => {
    const move = scoreMove("foundation-to-tableau", 0, { card: card("hearts", 5) });
    expect(move.points).toBe(CHIPS.FOUNDATION_TO_TABLEAU);
  });
});

describe("scoreMove — card upgrades", () => {
  const scoring = card("hearts", 5);

  it("adds chips", () => {
    const move = scoreMove("foundation-play", 1, { card: scoring, upgrades: upgrades("bonus") });
    expect(move.chips).toBe(CHIPS.FOUNDATION_PLAY + 30);
  });

  it("adds mult", () => {
    const move = scoreMove("foundation-play", 1, { card: scoring, upgrades: upgrades("mult") });
    expect(move.mult).toBe(BASE_MULT + 4);
  });

  it("multiplies mult after the additive ones", () => {
    const move = scoreMove("foundation-play", 1, {
      card: scoring,
      upgrades: upgrades("mult", "polychrome"),
    });
    expect(move.mult).toBe((BASE_MULT + 4) * 1.5);
  });

  it("pays out money for a Gold card", () => {
    const move = scoreMove("foundation-play", 1, { card: scoring, upgrades: upgrades("gold") });
    expect(move.money).toBe(3);
  });

  it("stacks several upgrades on one card", () => {
    const move = scoreMove("foundation-play", 1, {
      card: scoring,
      upgrades: upgrades("bonus", "foil", "holographic"),
    });
    expect(move.chips).toBe(CHIPS.FOUNDATION_PLAY + 30 + 50);
    expect(move.mult).toBe(BASE_MULT + 10);
  });

  it("fires on a reveal as well as a foundation play", () => {
    const move = scoreMove("reveal", 0, { card: scoring, upgrades: upgrades("bonus") });
    expect(move.chips).toBe(CHIPS.REVEAL + 30);
  });

  it("stays silent on a tableau shuffle, so an upgraded card can't be farmed", () => {
    const move = scoreMove("tableau-to-tableau", 0, {
      card: scoring,
      upgrades: upgrades("bonus", "gold"),
    });
    expect(move.chips).toBe(CHIPS.TABLEAU_TO_TABLEAU);
    expect(move.money).toBe(0);
    expect(move.points).toBe(0);
  });

  it("stays silent on a waste-to-tableau move too", () => {
    const move = scoreMove("waste-to-tableau", 0, { card: scoring, upgrades: upgrades("bonus") });
    expect(move.chips).toBe(CHIPS.WASTE_TO_TABLEAU);
  });
});

describe("isTriggeringEvent", () => {
  it("covers exactly the moves where a card counts as scoring", () => {
    expect(isTriggeringEvent("foundation-play")).toBe(true);
    expect(isTriggeringEvent("reveal")).toBe(true);
    expect(isTriggeringEvent("waste-to-tableau")).toBe(false);
    expect(isTriggeringEvent("tableau-to-tableau")).toBe(false);
    expect(isTriggeringEvent("foundation-to-tableau")).toBe(false);
  });
});

describe("scoreMove — jokers", () => {
  it("fires an unconditional joker on every scoring card", () => {
    const move = scoreMove("foundation-play", 1, {
      card: card("clubs", 9),
      jokers: jokers("joker"),
    });
    expect(move.mult).toBe(BASE_MULT + 4);
  });

  it("respects a suit condition", () => {
    const held = jokers("lusty"); // +4 mult on hearts
    expect(scoreMove("foundation-play", 1, { card: card("hearts", 9), jokers: held }).mult).toBe(
      BASE_MULT + 4,
    );
    expect(scoreMove("foundation-play", 1, { card: card("spades", 9), jokers: held }).mult).toBe(
      BASE_MULT,
    );
  });

  it("respects a rank-parity condition", () => {
    const held = jokers("even-steven"); // +5 mult on even ranks
    expect(scoreMove("foundation-play", 1, { card: card("clubs", 8), jokers: held }).mult).toBe(
      BASE_MULT + 5,
    );
    expect(scoreMove("foundation-play", 1, { card: card("clubs", 7), jokers: held }).mult).toBe(
      BASE_MULT,
    );
  });

  it("respects a rank-list condition", () => {
    const held = jokers("scholar"); // Aces: +30 chips, +4 mult
    const ace = scoreMove("foundation-play", 1, { card: card("clubs", 1), jokers: held });
    expect(ace.chips).toBe(CHIPS.FOUNDATION_PLAY + 30);
    expect(ace.mult).toBe(BASE_MULT + 4);

    const two = scoreMove("foundation-play", 1, { card: card("clubs", 2), jokers: held });
    expect(two.chips).toBe(CHIPS.FOUNDATION_PLAY);
  });

  it("holds a combo-gated joker back until the streak is long enough", () => {
    const held = jokers("chain"); // x1.5 mult at combo 3
    expect(scoreMove("foundation-play", 2, { card: card("clubs", 4), jokers: held }).mult).toBe(
      BASE_MULT + COMBO_MULT_STEP,
    );
    expect(scoreMove("foundation-play", 3, { card: card("clubs", 4), jokers: held }).mult).toBe(
      (BASE_MULT + 2 * COMBO_MULT_STEP) * 1.5,
    );
  });

  it("pays money from a money joker", () => {
    const move = scoreMove("foundation-play", 1, {
      card: card("spades", 12),
      jokers: jokers("midas"),
    });
    expect(move.money).toBe(1);
  });

  it("stacks jokers with card upgrades", () => {
    const move = scoreMove("foundation-play", 1, {
      card: card("hearts", 3),
      upgrades: upgrades("bonus"),
      jokers: jokers("joker", "lusty"),
    });
    expect(move.chips).toBe(CHIPS.FOUNDATION_PLAY + 30);
    expect(move.mult).toBe(BASE_MULT + 4 + 4);
  });

  it("ignores an end-of-round joker while scoring a card", () => {
    const move = scoreMove("foundation-play", 1, {
      card: card("hearts", 3),
      jokers: jokers("rocket"),
    });
    expect(move.money).toBe(0);
    expect(move.mult).toBe(BASE_MULT);
  });
});

describe("applyScoreEvent — combo streak", () => {
  it("builds the streak on consecutive foundation plays", () => {
    let score = createScoreState();
    score = applyScoreEvent(score, "foundation-play", { card: card("hearts", 1) });
    score = applyScoreEvent(score, "foundation-play", { card: card("hearts", 2) });
    expect(score.comboStreak).toBe(2);
    expect(score.total).toBe(10 + 15); // 10 x 1, then 10 x 1.5
  });

  it("breaks the streak on a non-foundation move", () => {
    let score = applyScoreEvent(createScoreState(), "foundation-play", { card: card("hearts", 1) });
    score = applyScoreEvent(score, "tableau-to-tableau", { card: card("spades", 4) });
    expect(score.comboStreak).toBe(0);
  });

  it("leaves the streak alone on a reveal, which rides along with another move", () => {
    let score = applyScoreEvent(createScoreState(), "foundation-play", { card: card("hearts", 1) });
    score = applyScoreEvent(score, "reveal", { card: card("spades", 4) });
    expect(score.comboStreak).toBe(1);
  });

  it("banks money as moves score it", () => {
    const score = applyScoreEvent(createScoreState(), "foundation-play", {
      card: card("hearts", 1),
      upgrades: upgrades("gold"),
    });
    expect(score.money).toBe(3);
  });
});

describe("applyScoreEvent — combo keeper", () => {
  const keeper = { comboKeeper: true };

  function withStreak(): ScoreState {
    return applyScoreEvent(createScoreState(), "foundation-play", {
      ...keeper,
      card: card("hearts", 1),
    });
  }

  it("spares the streak on the first non-foundation move", () => {
    const score = applyScoreEvent(withStreak(), "tableau-to-tableau", {
      ...keeper,
      card: card("spades", 4),
    });
    expect(score.comboStreak).toBe(1);
    expect(score.comboGraceUsed).toBe(true);
  });

  it("breaks the streak on the second one, the grace being spent", () => {
    let score = applyScoreEvent(withStreak(), "tableau-to-tableau", { ...keeper });
    score = applyScoreEvent(score, "tableau-to-tableau", { ...keeper });
    expect(score.comboStreak).toBe(0);
    expect(score.comboGraceUsed).toBe(false);
  });

  it("hands the grace back only when a fresh streak starts", () => {
    let score = applyScoreEvent(withStreak(), "tableau-to-tableau", { ...keeper });
    score = applyScoreEvent(score, "foundation-play", { ...keeper, card: card("hearts", 2) });
    expect(score.comboGraceUsed).toBe(true);

    score = applyScoreEvent(score, "tableau-to-tableau", { ...keeper });
    score = applyScoreEvent(score, "tableau-to-tableau", { ...keeper });
    score = applyScoreEvent(score, "foundation-play", { ...keeper, card: card("hearts", 3) });
    expect(score.comboGraceUsed).toBe(false);
  });

  it("does nothing without a streak to protect", () => {
    const score = applyScoreEvent(createScoreState(), "waste-to-tableau", { ...keeper });
    expect(score.comboStreak).toBe(0);
    expect(score.comboGraceUsed).toBe(false);
  });
});
