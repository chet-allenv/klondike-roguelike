import { type GameState, hasLegalMove } from "./klondike";

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
}

export function createRun(): RunState {
  return { lives: STARTING_LIVES, round: 1, roundsCleared: 0, gameOver: false };
}

/** Score target for a given round (1-indexed), rounded to a whole number. */
export function targetForRound(round: number): number {
  return Math.round(BASE_TARGET * TARGET_GROWTH ** (round - 1));
}

export type RoundResult = "won" | "lost";

/** Applies a completed hand's final score against its target and advances run state. */
export function resolveRound(run: RunState, finalScore: number, target: number): { run: RunState; result: RoundResult } {
  if (finalScore >= target) {
    return {
      result: "won",
      run: { ...run, round: run.round + 1, roundsCleared: run.roundsCleared + 1 },
    };
  }

  const lives = run.lives - 1;
  return {
    result: "lost",
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
