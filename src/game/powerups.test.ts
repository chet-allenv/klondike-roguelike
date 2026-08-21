import { describe, expect, it } from "vitest";
import {
  effectsOf,
  PEEK_STOCK_COUNT,
  POWER_UPS,
  type PowerUpId,
  powerUpById,
  SCORE_MULTIPLIER_STEP,
} from "./powerups";

describe("POWER_UPS", () => {
  it("has unique ids, a price, and a name and description for each", () => {
    const ids = POWER_UPS.map((powerUp) => powerUp.id);
    expect(new Set(ids).size).toBe(POWER_UPS.length);
    for (const powerUp of POWER_UPS) {
      expect(powerUp.name).not.toBe("");
      expect(powerUp.description).not.toBe("");
      expect(powerUp.cost).toBeGreaterThan(0);
    }
  });

  it("looks up a power-up by id and rejects an unknown one", () => {
    expect(powerUpById("extra-undo").name).toBe("Extra Undo");
    expect(() => powerUpById("nope" as PowerUpId)).toThrow();
  });
});

describe("effectsOf", () => {
  it("is inert for a run with no picks", () => {
    expect(effectsOf([])).toEqual({
      extraUndos: 0,
      extraRedeals: 0,
      peekStock: 0,
      scoreMultiplier: 1,
      comboKeeper: false,
      secondChance: false,
      smartClick: false,
      dropHints: false,
    });
  });

  it("stacks repeatable picks", () => {
    const effects = effectsOf(["extra-undo", "extra-undo", "extra-redeal"]);
    expect(effects.extraUndos).toBe(2);
    expect(effects.extraRedeals).toBe(1);
  });

  it("multiplies score multipliers together rather than adding them", () => {
    const effects = effectsOf(["score-multiplier", "score-multiplier"]);
    expect(effects.scoreMultiplier).toBeCloseTo(SCORE_MULTIPLIER_STEP ** 2);
  });

  it("turns on the flag power-ups", () => {
    const effects = effectsOf(["peek-stock", "combo-keeper", "second-chance", "auto-play", "sharp-eye"]);
    expect(effects.peekStock).toBe(PEEK_STOCK_COUNT);
    expect(effects.comboKeeper).toBe(true);
    expect(effects.secondChance).toBe(true);
    expect(effects.smartClick).toBe(true);
    expect(effects.dropHints).toBe(true);
  });
});
