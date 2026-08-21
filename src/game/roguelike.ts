import { type GameState, hasLegalMove } from "./klondike";
import { STARTING_MONEY } from "./economy";
import type { JokerId } from "./jokers";
import type { PowerUpId } from "./powerups";
import type { DeckUpgrade } from "./upgrades";

export const STARTING_LIVES = 3;
export const BASE_TARGET = 200;
export const TARGET_GROWTH = 1.25; // +25% per round
export const REDEALS_PER_ROUND = 2;
export const UNDOS_PER_ROUND = 3;

export interface RunState {
  lives: number;
  round: number; // 1-indexed
  roundsCleared: number;
  gameOver: boolean;
  /** Money on hand, spent in the shop between rounds. */
  money: number;
  /** Jokers held, in the order bought. */
  jokers: JokerId[];
  /** Vouchers bought, in order. Duplicates are meaningful — they stack. */
  powerUps: PowerUpId[];
  /** Card upgrades bought, each bound to a card, suit or rank. */
  deckUpgrades: DeckUpgrade[];
}

export function createRun(): RunState {
  return {
    lives: STARTING_LIVES,
    round: 1,
    roundsCleared: 0,
    gameOver: false,
    money: STARTING_MONEY,
    jokers: [],
    powerUps: [],
    deckUpgrades: [],
  };
}

/** Adds a bought voucher to the run. */
export function grantPowerUp(run: RunState, id: PowerUpId): RunState {
  return { ...run, powerUps: [...run.powerUps, id] };
}

export function grantJoker(run: RunState, id: JokerId): RunState {
  return { ...run, jokers: [...run.jokers, id] };
}

export function grantDeckUpgrade(run: RunState, upgrade: DeckUpgrade): RunState {
  return { ...run, deckUpgrades: [...run.deckUpgrades, upgrade] };
}

/** Books money in or out. Spending is the caller's to validate. */
export function adjustMoney(run: RunState, amount: number): RunState {
  return { ...run, money: run.money + amount };
}

/** Score target for a given round (1-indexed), rounded to a whole number. */
export function targetForRound(round: number): number {
  return Math.round(BASE_TARGET * TARGET_GROWTH ** (round - 1));
}

export type RoundResult = "won" | "lost";

export interface RoundOutcome {
  run: RunState;
  result: RoundResult;
  /** True when a held Second Chance absorbed this loss instead of a life. */
  secondChanceUsed: boolean;
}

/** Applies a completed hand's final score against its target and advances run state. */
export function resolveRound(run: RunState, finalScore: number, target: number): RoundOutcome {
  if (finalScore >= target) {
    return {
      result: "won",
      secondChanceUsed: false,
      run: { ...run, round: run.round + 1, roundsCleared: run.roundsCleared + 1 },
    };
  }

  if (run.powerUps.includes("second-chance")) {
    // Spent, not merely disabled: dropping it from the list is what lets it
    // come back around in a later draft.
    return {
      result: "lost",
      secondChanceUsed: true,
      run: { ...run, powerUps: run.powerUps.filter((id) => id !== "second-chance") },
    };
  }

  const lives = run.lives - 1;
  return {
    result: "lost",
    secondChanceUsed: false,
    run: { ...run, lives, gameOver: lives <= 0 },
  };
}

/** Per-round stock redeal and undo budgets. Reset via `createRoundState` at the start of every round. */
export interface RoundState {
  redealsUsed: number;
  redealsAllowed: number;
  undosUsed: number;
  undosAllowed: number;
}

export function createRoundState(
  redealsAllowed: number = REDEALS_PER_ROUND,
  undosAllowed: number = UNDOS_PER_ROUND,
): RoundState {
  return { redealsUsed: 0, redealsAllowed, undosUsed: 0, undosAllowed };
}

/** Can the player still draw from the stock (cards remain, or a redeal is available)? */
export function canDrawFromStock(state: GameState, round: RoundState): boolean {
  return state.stock.length > 0 || round.redealsUsed < round.redealsAllowed;
}

/**
 * Records that a draw is about to happen. Must be called *before*
 * `drawFromStock` mutates `state` — an empty stock at this point means the
 * draw is a redeal, which consumes one of the round's redeals.
 */
export function registerStockDraw(state: GameState, round: RoundState): void {
  if (state.stock.length === 0) round.redealsUsed += 1;
}

/** Can the player still undo a move this round? */
export function canUndo(round: RoundState): boolean {
  return round.undosUsed < round.undosAllowed;
}

/** Records that an undo just happened. Undos themselves aren't undoable, so this is a one-way counter. */
export function registerUndo(round: RoundState): void {
  round.undosUsed += 1;
}

/** A round is stuck when there's no legal move and no way to draw a new one. */
export function isRoundStuck(state: GameState, round: RoundState): boolean {
  return !hasLegalMove(state) && !canDrawFromStock(state, round);
}
