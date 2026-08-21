import { describe, expect, it } from "vitest";
import {
  BASE_REWARD,
  baseRewardForRound,
  INTEREST_CAP,
  INTEREST_PER,
  interestOn,
  LEFTOVER_CAP,
  leftoverReward,
  OVERSHOOT_CAP,
  OVERSHOOT_STEP,
  overshootReward,
  type PayoutInput,
  roundPayout,
} from "./economy";

function payoutInput(overrides: Partial<PayoutInput> = {}): PayoutInput {
  return {
    round: 1,
    score: 200,
    target: 200,
    redealsLeft: 0,
    undosLeft: 0,
    moneyHeld: 0,
    jokerMoney: 0,
    inHandMoney: 0,
    ...overrides,
  };
}

describe("baseRewardForRound", () => {
  it("pays the base for round 1", () => {
    expect(baseRewardForRound(1)).toBe(BASE_REWARD);
  });

  it("grows as the run goes on", () => {
    expect(baseRewardForRound(4)).toBeGreaterThan(baseRewardForRound(1));
  });
});

describe("leftoverReward", () => {
  it("pays per unused redeal and undo", () => {
    expect(leftoverReward(1, 2)).toBe(3);
  });

  it("caps so hoarding can't out-earn playing", () => {
    expect(leftoverReward(50, 50)).toBe(LEFTOVER_CAP);
  });

  it("ignores negative leftovers rather than charging for them", () => {
    expect(leftoverReward(-3, 0)).toBe(0);
  });
});

describe("overshootReward", () => {
  it("pays nothing for finishing exactly on target", () => {
    expect(overshootReward(200, 200)).toBe(0);
  });

  it("pays nothing for finishing under", () => {
    expect(overshootReward(100, 200)).toBe(0);
  });

  it("pays per step above the target", () => {
    expect(overshootReward(200 + OVERSHOOT_STEP * 2, 200)).toBe(2);
  });

  it("caps the reward", () => {
    expect(overshootReward(200 + OVERSHOOT_STEP * 500, 200)).toBe(OVERSHOOT_CAP);
  });
});

describe("interestOn", () => {
  it("pays nothing on an empty purse", () => {
    expect(interestOn(0)).toBe(0);
    expect(interestOn(-5)).toBe(0);
  });

  it("pays per band of savings", () => {
    expect(interestOn(INTEREST_PER * 3)).toBe(3);
  });

  it("stops paying past the cap, so banking forever isn't the answer", () => {
    expect(interestOn(INTEREST_PER * 1000)).toBe(INTEREST_CAP);
  });
});

describe("roundPayout", () => {
  it("sums every line on a cleared round", () => {
    const payout = roundPayout(
      true,
      payoutInput({
        round: 1,
        score: 200 + OVERSHOOT_STEP,
        redealsLeft: 1,
        undosLeft: 1,
        moneyHeld: INTEREST_PER * 2,
        jokerMoney: 4,
        inHandMoney: 3,
      }),
    );

    expect(payout.base).toBe(BASE_REWARD);
    expect(payout.leftovers).toBe(2);
    expect(payout.overshoot).toBe(1);
    expect(payout.interest).toBe(2);
    expect(payout.jokers).toBe(4);
    expect(payout.inHand).toBe(3);
    expect(payout.total).toBe(BASE_REWARD + 2 + 1 + 2 + 4 + 3);
  });

  it("pays a lost round nothing but what the hand already banked", () => {
    const payout = roundPayout(
      false,
      payoutInput({ redealsLeft: 2, undosLeft: 3, moneyHeld: 50, jokerMoney: 4, inHandMoney: 6 }),
    );

    expect(payout.base).toBe(0);
    expect(payout.leftovers).toBe(0);
    expect(payout.overshoot).toBe(0);
    expect(payout.interest).toBe(0);
    expect(payout.jokers).toBe(0);
    expect(payout.inHand).toBe(6);
    expect(payout.total).toBe(6);
  });

  it("charges interest on what was held going in, not on the new payout", () => {
    const payout = roundPayout(true, payoutInput({ moneyHeld: 0, jokerMoney: 100 }));
    expect(payout.interest).toBe(0);
  });
});
