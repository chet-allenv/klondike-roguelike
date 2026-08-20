export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const RANK_LABEL: Record<number, string> = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
};

export interface Card {
  id: string;
  suit: Suit;
  rank: number; // 1 (Ace) - 13 (King)
  faceUp: boolean;
}

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function isRed(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, faceUp: false });
    }
  }
  return deck;
}

export function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
