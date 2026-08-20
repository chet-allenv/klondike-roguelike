import { describe, expect, it } from "vitest";
import { applyScoreEvent, createScoreState } from "./scoring";

describe("createScoreState", () => {
  it("starts at zero with no combo streak", () => {
    expect(createScoreState()).toEqual({ total: 0, comboStreak: 0 });
  });
});

describe("applyScoreEvent", () => {
  it("awards a flat +10 for the first foundation play in a streak", () => {
    const score = applyScoreEvent(createScoreState(), "foundation-play");
    expect(score).toEqual({ total: 10, comboStreak: 1 });
  });

  it("adds +2 per consecutive foundation play on top of the base +10", () => {
    let score = createScoreState();
    score = applyScoreEvent(score, "foundation-play"); // 10, streak 1
    score = applyScoreEvent(score, "foundation-play"); // +12, streak 2
    score = applyScoreEvent(score, "foundation-play"); // +14, streak 3
    expect(score).toEqual({ total: 10 + 12 + 14, comboStreak: 3 });
  });

  it("awards +5 for a reveal without touching the combo streak", () => {
    const withStreak = applyScoreEvent(createScoreState(), "foundation-play");
    const score = applyScoreEvent(withStreak, "reveal");
    expect(score).toEqual({ total: 15, comboStreak: 1 });
  });

  it("awards +5 for waste-to-tableau and resets the combo streak", () => {
    const withStreak = applyScoreEvent(createScoreState(), "foundation-play");
    const score = applyScoreEvent(withStreak, "waste-to-tableau");
    expect(score).toEqual({ total: 15, comboStreak: 0 });
  });

  it("applies a -15 penalty for foundation-to-tableau and resets the combo streak", () => {
    const withStreak = applyScoreEvent(createScoreState(), "foundation-play");
    const score = applyScoreEvent(withStreak, "foundation-to-tableau");
    expect(score).toEqual({ total: -5, comboStreak: 0 });
  });

  it("resets the combo streak on tableau-to-tableau without changing the total", () => {
    const withStreak = applyScoreEvent(createScoreState(), "foundation-play");
    const score = applyScoreEvent(withStreak, "tableau-to-tableau");
    expect(score).toEqual({ total: 10, comboStreak: 0 });
  });

  it("resumes the combo from 1 after a reset", () => {
    let score = createScoreState();
    score = applyScoreEvent(score, "foundation-play"); // streak 1
    score = applyScoreEvent(score, "waste-to-tableau"); // reset
    score = applyScoreEvent(score, "foundation-play"); // streak 1 again
    expect(score.comboStreak).toBe(1);
    expect(score.total).toBe(10 + 5 + 10);
  });
});
