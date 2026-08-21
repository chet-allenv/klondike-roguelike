import type { Card, Suit } from "./cards";

export type UpgradeId = "bonus" | "mult" | "gold" | "foil" | "holographic" | "polychrome";

/**
 * What an upgrade contributes when a card it applies to scores. Every field
 * is optional and they compose: chips are summed, `mult` is added, `multX`
 * multiplies, `money` is paid out immediately.
 */
export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
  chips?: number;
  mult?: number;
  multX?: number;
  money?: number;
}

export const UPGRADES: readonly Upgrade[] = [
  { id: "bonus", name: "Bonus", description: "+30 chips when this scores.", cost: 4, chips: 30 },
  { id: "mult", name: "Mult", description: "+4 mult when this scores.", cost: 4, mult: 4 },
  { id: "gold", name: "Gold", description: "Pays $3 when this scores.", cost: 5, money: 3 },
  { id: "foil", name: "Foil", description: "+50 chips when this scores.", cost: 6, chips: 50 },
  {
    id: "holographic",
    name: "Holographic",
    description: "+10 mult when this scores.",
    cost: 8,
    mult: 10,
  },
  {
    id: "polychrome",
    name: "Polychrome",
    description: "x1.5 mult when this scores.",
    cost: 10,
    multX: 1.5,
  },
];

export function upgradeById(id: UpgradeId): Upgrade {
  const found = UPGRADES.find((upgrade) => upgrade.id === id);
  if (!found) throw new Error(`unknown upgrade: ${id}`);
  return found;
}

/**
 * What a bought upgrade is attached to. Card ids are stable across deals
 * (`hearts-7` is always the same card), so a card-scoped upgrade sticks to
 * that card for the whole run without the run having to own a deck object.
 */
export type UpgradeScope =
  | { kind: "card"; cardId: string }
  | { kind: "suit"; suit: Suit }
  | { kind: "rank"; rank: number };

export interface DeckUpgrade {
  scope: UpgradeScope;
  upgrade: UpgradeId;
}

export function scopeMatches(scope: UpgradeScope, card: Card): boolean {
  switch (scope.kind) {
    case "card":
      return card.id === scope.cardId;
    case "suit":
      return card.suit === scope.suit;
    case "rank":
      return card.rank === scope.rank;
  }
}

/** Every upgrade that fires for this card, in the order they were bought. */
export function upgradesForCard(card: Card, deckUpgrades: readonly DeckUpgrade[]): Upgrade[] {
  return deckUpgrades
    .filter((entry) => scopeMatches(entry.scope, card))
    .map((entry) => upgradeById(entry.upgrade));
}

export function describeScope(scope: UpgradeScope, rankLabel: (rank: number) => string): string {
  switch (scope.kind) {
    case "card": {
      const [suit, rank] = scope.cardId.split("-");
      return `${rankLabel(Number(rank))} of ${suit}`;
    }
    case "suit":
      return `all ${scope.suit}`;
    case "rank":
      return `every ${rankLabel(scope.rank)}`;
  }
}
