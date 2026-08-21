import type { Card } from "./cards";
import { conditionHolds, type Joker } from "./jokers";
import type { Upgrade } from "./upgrades";

export interface ScoreState {
  total: number;
  comboStreak: number;
  /**
   * Whether this streak has already spent its Combo Keeper grace. Cleared
   * when a fresh streak starts, so the allowance is one move per streak
   * rather than one per gap.
   */
  comboGraceUsed: boolean;
  /** Money banked mid-hand by Gold cards and money jokers. */
  money: number;
}

export function createScoreState(): ScoreState {
  return { total: 0, comboStreak: 0, comboGraceUsed: false, money: 0 };
}

/** Base chips each move contributes, before upgrades, jokers and mult. */
export const CHIPS = {
  FOUNDATION_PLAY: 10,
  REVEAL: 5,
  WASTE_TO_TABLEAU: 5,
  FOUNDATION_TO_TABLEAU: -15,
  TABLEAU_TO_TABLEAU: 0,
} as const;

/** Every move starts here; upgrades and jokers build on top. */
export const BASE_MULT = 1;
/** Each step of a combo streak past the first adds this much mult. */
export const COMBO_MULT_STEP = 0.5;

export type ScoreEvent =
  | "foundation-play"
  | "reveal"
  | "waste-to-tableau"
  | "foundation-to-tableau"
  | "tableau-to-tableau";

/**
 * The moves that count as a card "scoring", and so trigger card upgrades and
 * jokers. Deliberately excludes tableau shuffling: a card can be moved
 * between columns endlessly, and letting an upgraded card pay out each time
 * would make a Bonus card an infinite chip faucet. A reveal can only happen
 * once per card per hand, so it's safe.
 */
const TRIGGERING_EVENTS: ReadonlySet<ScoreEvent> = new Set(["foundation-play", "reveal"]);

export function isTriggeringEvent(event: ScoreEvent): boolean {
  return TRIGGERING_EVENTS.has(event);
}

function baseChips(event: ScoreEvent): number {
  switch (event) {
    case "foundation-play":
      return CHIPS.FOUNDATION_PLAY;
    case "reveal":
      return CHIPS.REVEAL;
    case "waste-to-tableau":
      return CHIPS.WASTE_TO_TABLEAU;
    case "foundation-to-tableau":
      return CHIPS.FOUNDATION_TO_TABLEAU;
    case "tableau-to-tableau":
      return CHIPS.TABLEAU_TO_TABLEAU;
  }
}

export interface ScoreContext {
  /** The card that scored, when the move has one. */
  card?: Card;
  /** Upgrades that apply to that card, already resolved by `upgradesForCard`. */
  upgrades?: readonly Upgrade[];
  jokers?: readonly Joker[];
  /** Flat run-wide multiplier from the Score Multiplier voucher. */
  multiplier?: number;
  /** Combo Keeper voucher: one non-foundation move per streak spares the combo. */
  comboKeeper?: boolean;
}

/** The full arithmetic of one move, for scoring and for showing the player. */
export interface MoveScore {
  chips: number;
  mult: number;
  points: number;
  money: number;
}

/**
 * Scores a single move as chips x mult. `comboStreak` is the streak *after*
 * this move lands, so a foundation play already counts itself.
 */
export function scoreMove(
  event: ScoreEvent,
  comboStreak: number,
  context: ScoreContext = {},
): MoveScore {
  const { card, upgrades = [], jokers = [], multiplier = 1 } = context;

  let chips = baseChips(event);
  let mult = BASE_MULT + Math.max(0, comboStreak - 1) * COMBO_MULT_STEP;
  let money = 0;

  if (card && isTriggeringEvent(event)) {
    for (const upgrade of upgrades) {
      chips += upgrade.chips ?? 0;
      mult += upgrade.mult ?? 0;
      if (upgrade.multX !== undefined) mult *= upgrade.multX;
      money += upgrade.money ?? 0;
    }

    for (const joker of jokers) {
      const effect = joker.onScore;
      if (!effect || !conditionHolds(effect.when, card, comboStreak)) continue;
      chips += effect.chips ?? 0;
      mult += effect.mult ?? 0;
      if (effect.multX !== undefined) mult *= effect.multX;
      money += effect.money ?? 0;
    }
  }

  mult *= multiplier;

  return { chips, mult, points: Math.round(chips * mult), money };
}

export function applyScoreEvent(
  score: ScoreState,
  event: ScoreEvent,
  context: ScoreContext = {},
): ScoreState {
  const next = advanceCombo(score, event, context.comboKeeper ?? false);
  const move = scoreMove(event, next.comboStreak, context);
  return { ...next, total: next.total + move.points, money: next.money + move.money };
}

/** What a move does to the combo streak, before any points are worked out. */
function advanceCombo(score: ScoreState, event: ScoreEvent, comboKeeper: boolean): ScoreState {
  if (event === "foundation-play") {
    return {
      ...score,
      comboStreak: score.comboStreak + 1,
      // A streak starting from scratch gets its grace back.
      comboGraceUsed: score.comboStreak === 0 ? false : score.comboGraceUsed,
    };
  }

  // Reveals ride along with whatever move caused them; they never break a streak.
  if (event === "reveal") return score;

  if (comboKeeper && score.comboStreak > 0 && !score.comboGraceUsed) {
    return { ...score, comboGraceUsed: true };
  }
  return { ...score, comboStreak: 0, comboGraceUsed: false };
}
