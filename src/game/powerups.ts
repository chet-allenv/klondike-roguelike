export type PowerUpId =
  | "extra-undo"
  | "extra-redeal"
  | "peek-stock"
  | "score-multiplier"
  | "combo-keeper"
  | "second-chance"
  | "auto-play"
  | "sharp-eye";

export interface PowerUp {
  id: PowerUpId;
  name: string;
  description: string;
  /** Shop price. */
  cost: number;
  /**
   * Repeatable power-ups keep showing up in drafts and stack with themselves.
   * The rest are only offered while you don't already hold one — which also
   * means a consumed one (Second Chance) becomes draftable again, since
   * spending it removes it from the run's list.
   */
  repeatable: boolean;
}

/** How many stock cards Peek Stock reveals. */
export const PEEK_STOCK_COUNT = 3;
/** Each Score Multiplier pick multiplies the run's scoring by this. */
export const SCORE_MULTIPLIER_STEP = 1.1;
export const POWER_UPS: readonly PowerUp[] = [
  {
    id: "extra-undo",
    cost: 4,
    name: "Extra Undo",
    description: "+1 undo every round, for the rest of the run.",
    repeatable: true,
  },
  {
    id: "extra-redeal",
    cost: 4,
    name: "Extra Redeal",
    description: "+1 stock redeal every round, for the rest of the run.",
    repeatable: true,
  },
  {
    id: "score-multiplier",
    cost: 8,
    name: "Score Multiplier",
    description: "All scoring x1.1. Stacks with itself.",
    repeatable: true,
  },
  {
    id: "peek-stock",
    cost: 5,
    name: "Peek Stock",
    description: `See the next ${PEEK_STOCK_COUNT} cards waiting in the stock.`,
    repeatable: false,
  },
  {
    id: "combo-keeper",
    cost: 6,
    name: "Combo Keeper",
    description: "One non-foundation move per streak no longer breaks your combo.",
    repeatable: false,
  },
  {
    id: "second-chance",
    cost: 7,
    name: "Second Chance",
    description: "Your next lost round costs no life. Consumed when it saves you.",
    repeatable: false,
  },
  {
    id: "auto-play",
    cost: 5,
    name: "Auto-Play",
    description: "Clicking a card with one legal home sends it there in a single click.",
    repeatable: false,
  },
  {
    id: "sharp-eye",
    cost: 4,
    name: "Sharp Eye",
    description: "Legal drop targets light up while you drag a card.",
    repeatable: false,
  },
];

export function powerUpById(id: PowerUpId): PowerUp {
  const found = POWER_UPS.find((powerUp) => powerUp.id === id);
  if (!found) throw new Error(`unknown power-up: ${id}`);
  return found;
}

/** Everything a run's picks add up to. Read once per round to set the hand up. */
export interface PowerUpEffects {
  extraUndos: number;
  extraRedeals: number;
  /** 0 when Peek Stock isn't held. */
  peekStock: number;
  /** 1 when no multiplier is held. */
  scoreMultiplier: number;
  comboKeeper: boolean;
  secondChance: boolean;
  smartClick: boolean;
  dropHints: boolean;
}

export function effectsOf(picks: readonly PowerUpId[]): PowerUpEffects {
  const effects: PowerUpEffects = {
    extraUndos: 0,
    extraRedeals: 0,
    peekStock: 0,
    scoreMultiplier: 1,
    comboKeeper: false,
    secondChance: false,
    smartClick: false,
    dropHints: false,
  };

  for (const id of picks) {
    switch (id) {
      case "extra-undo":
        effects.extraUndos += 1;
        break;
      case "extra-redeal":
        effects.extraRedeals += 1;
        break;
      case "score-multiplier":
        effects.scoreMultiplier *= SCORE_MULTIPLIER_STEP;
        break;
      case "peek-stock":
        effects.peekStock = PEEK_STOCK_COUNT;
        break;
      case "combo-keeper":
        effects.comboKeeper = true;
        break;
      case "second-chance":
        effects.secondChance = true;
        break;
      case "auto-play":
        effects.smartClick = true;
        break;
      case "sharp-eye":
        effects.dropHints = true;
        break;
    }
  }

  return effects;
}
