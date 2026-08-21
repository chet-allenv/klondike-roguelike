/**
 * Round payouts. Every constant here is a starting guess, not a playtested
 * number — this is the first thing step 7 should be tuning.
 */

export const STARTING_MONEY = 4;

/** Flat reward for clearing a round, before it grows with the round number. */
export const BASE_REWARD = 4;
/** The base reward gains $1 every this many rounds. */
export const REWARD_GROWTH_EVERY = 3;

/** Paid per unused redeal and per unused undo. */
export const PER_LEFTOVER = 1;
/** Capped so a cautious hand can't out-earn actually playing. */
export const LEFTOVER_CAP = 5;

/** $1 per this many points finished above the target... */
export const OVERSHOOT_STEP = 60;
/** ...up to this much. */
export const OVERSHOOT_CAP = 5;

/** $1 of interest per this much money held at round end... */
export const INTEREST_PER = 5;
/** ...up to this much, so banking forever stops paying. */
export const INTEREST_CAP = 5;

export function baseRewardForRound(round: number): number {
  return BASE_REWARD + Math.floor((round - 1) / REWARD_GROWTH_EVERY);
}

export function leftoverReward(redealsLeft: number, undosLeft: number): number {
  const leftovers = Math.max(0, redealsLeft) + Math.max(0, undosLeft);
  return Math.min(LEFTOVER_CAP, leftovers * PER_LEFTOVER);
}

export function overshootReward(score: number, target: number): number {
  if (score <= target) return 0;
  return Math.min(OVERSHOOT_CAP, Math.floor((score - target) / OVERSHOOT_STEP));
}

export function interestOn(money: number): number {
  if (money <= 0) return 0;
  return Math.min(INTEREST_CAP, Math.floor(money / INTEREST_PER));
}

/** Every line of a round's payout, kept separate so the screen can show the maths. */
export interface Payout {
  base: number;
  leftovers: number;
  overshoot: number;
  interest: number;
  jokers: number;
  /** Money already banked mid-hand by Gold cards and money jokers. */
  inHand: number;
  total: number;
}

export interface PayoutInput {
  round: number;
  score: number;
  target: number;
  redealsLeft: number;
  undosLeft: number;
  /** Money held going into the payout, which is what interest is charged on. */
  moneyHeld: number;
  jokerMoney: number;
  inHandMoney: number;
}

/**
 * A cleared round pays out in full. A lost round pays nothing but what the
 * hand already banked — losing should hurt.
 */
export function roundPayout(won: boolean, input: PayoutInput): Payout {
  if (!won) {
    return {
      base: 0,
      leftovers: 0,
      overshoot: 0,
      interest: 0,
      jokers: 0,
      inHand: input.inHandMoney,
      total: input.inHandMoney,
    };
  }

  const base = baseRewardForRound(input.round);
  const leftovers = leftoverReward(input.redealsLeft, input.undosLeft);
  const overshoot = overshootReward(input.score, input.target);
  const interest = interestOn(input.moneyHeld);
  const jokers = input.jokerMoney;
  const inHand = input.inHandMoney;

  return {
    base,
    leftovers,
    overshoot,
    interest,
    jokers,
    inHand,
    total: base + leftovers + overshoot + interest + jokers + inHand,
  };
}
