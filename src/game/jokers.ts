import { type Card, isRed } from "./cards";

export type JokerId =
  | "joker"
  | "greedy"
  | "lusty"
  | "wrathful"
  | "gluttonous"
  | "even-steven"
  | "odd-todd"
  | "scholar"
  | "royalty"
  | "chain"
  | "excavator"
  | "rocket"
  | "midas";

/**
 * When a joker fires. All present fields must match; an empty condition
 * fires on every scoring card. Kept declarative rather than as callbacks so
 * jokers stay plain data — easy to test, list, and print in the shop.
 */
export interface JokerCondition {
  suit?: Card["suit"];
  color?: "red" | "black";
  /** Card ranks the joker cares about, e.g. face cards or Aces. */
  ranks?: number[];
  parity?: "even" | "odd";
  /** Only fires once the combo streak has reached this length. */
  minCombo?: number;
}

/** What a joker adds to the card currently scoring. */
export interface JokerScoreEffect {
  when?: JokerCondition;
  chips?: number;
  mult?: number;
  multX?: number;
  money?: number;
}

export interface Joker {
  id: JokerId;
  name: string;
  description: string;
  cost: number;
  /** Fires per scoring card. */
  onScore?: JokerScoreEffect;
  /** Paid out when the round is settled, win or lose. */
  onRoundEnd?: { money: number };
}

const FACE_RANKS = [11, 12, 13];

export const JOKERS: readonly Joker[] = [
  {
    id: "joker",
    name: "Joker",
    description: "+4 mult on every card that scores.",
    cost: 4,
    onScore: { mult: 4 },
  },
  {
    id: "greedy",
    name: "Greedy Joker",
    description: "+4 mult when a diamond scores.",
    cost: 5,
    onScore: { when: { suit: "diamonds" }, mult: 4 },
  },
  {
    id: "lusty",
    name: "Lusty Joker",
    description: "+4 mult when a heart scores.",
    cost: 5,
    onScore: { when: { suit: "hearts" }, mult: 4 },
  },
  {
    id: "wrathful",
    name: "Wrathful Joker",
    description: "+4 mult when a spade scores.",
    cost: 5,
    onScore: { when: { suit: "spades" }, mult: 4 },
  },
  {
    id: "gluttonous",
    name: "Gluttonous Joker",
    description: "+4 mult when a club scores.",
    cost: 5,
    onScore: { when: { suit: "clubs" }, mult: 4 },
  },
  {
    id: "even-steven",
    name: "Even Steven",
    description: "+5 mult when an even-ranked card scores.",
    cost: 5,
    onScore: { when: { parity: "even" }, mult: 5 },
  },
  {
    id: "odd-todd",
    name: "Odd Todd",
    description: "+40 chips when an odd-ranked card scores.",
    cost: 5,
    onScore: { when: { parity: "odd" }, chips: 40 },
  },
  {
    id: "scholar",
    name: "Scholar",
    description: "Aces give +30 chips and +4 mult.",
    cost: 6,
    onScore: { when: { ranks: [1] }, chips: 30, mult: 4 },
  },
  {
    id: "royalty",
    name: "Royalty",
    description: "+40 chips when a face card scores.",
    cost: 6,
    onScore: { when: { ranks: FACE_RANKS }, chips: 40 },
  },
  {
    id: "chain",
    name: "Chain Gang",
    description: "x1.5 mult once your combo reaches 3.",
    cost: 8,
    onScore: { when: { minCombo: 3 }, multX: 1.5 },
  },
  {
    id: "excavator",
    name: "Excavator",
    description: "+25 chips on every card that scores.",
    cost: 5,
    onScore: { chips: 25 },
  },
  {
    id: "rocket",
    name: "Rocket",
    description: "Pays $4 at the end of every round.",
    cost: 6,
    onRoundEnd: { money: 4 },
  },
  {
    id: "midas",
    name: "Midas Touch",
    description: "Pays $1 when a face card scores.",
    cost: 7,
    onScore: { when: { ranks: FACE_RANKS }, money: 1 },
  },
];

export function jokerById(id: JokerId): Joker {
  const found = JOKERS.find((joker) => joker.id === id);
  if (!found) throw new Error(`unknown joker: ${id}`);
  return found;
}

/** Does a joker's condition hold for the card currently scoring? */
export function conditionHolds(
  condition: JokerCondition | undefined,
  card: Card,
  comboStreak: number,
): boolean {
  if (!condition) return true;
  if (condition.suit && card.suit !== condition.suit) return false;
  if (condition.color && (condition.color === "red") !== isRed(card.suit)) return false;
  if (condition.ranks && !condition.ranks.includes(card.rank)) return false;
  if (condition.parity && (card.rank % 2 === 0 ? "even" : "odd") !== condition.parity) return false;
  if (condition.minCombo !== undefined && comboStreak < condition.minCombo) return false;
  return true;
}

/** Total end-of-round money from jokers like Rocket. */
export function jokerRoundEndMoney(jokers: readonly Joker[]): number {
  return jokers.reduce((sum, joker) => sum + (joker.onRoundEnd?.money ?? 0), 0);
}
