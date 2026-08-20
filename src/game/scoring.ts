export interface ScoreState {
  total: number;
  comboStreak: number;
}

export function createScoreState(): ScoreState {
  return { total: 0, comboStreak: 0 };
}

export const POINTS = {
  FOUNDATION_PLAY: 10,
  REVEAL: 5,
  WASTE_TO_TABLEAU: 5,
  FOUNDATION_TO_TABLEAU_PENALTY: -15,
  COMBO_STEP: 2,
} as const;

export type ScoreEvent =
  | "foundation-play"
  | "reveal"
  | "waste-to-tableau"
  | "foundation-to-tableau"
  | "tableau-to-tableau";

export function applyScoreEvent(score: ScoreState, event: ScoreEvent): ScoreState {
  switch (event) {
    case "foundation-play": {
      const comboStreak = score.comboStreak + 1;
      const comboBonus = (comboStreak - 1) * POINTS.COMBO_STEP;
      return { total: score.total + POINTS.FOUNDATION_PLAY + comboBonus, comboStreak };
    }
    case "reveal":
      return { ...score, total: score.total + POINTS.REVEAL };
    case "waste-to-tableau":
      return { total: score.total + POINTS.WASTE_TO_TABLEAU, comboStreak: 0 };
    case "foundation-to-tableau":
      return { total: score.total + POINTS.FOUNDATION_TO_TABLEAU_PENALTY, comboStreak: 0 };
    case "tableau-to-tableau":
      return { ...score, comboStreak: 0 };
  }
}
