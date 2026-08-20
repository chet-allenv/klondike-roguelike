import { type Card, type Suit, SUITS, createDeck, isRed, shuffle } from "./cards";

export interface GameState {
  tableau: Card[][]; // 7 columns
  foundations: Record<Suit, Card[]>;
  stock: Card[];
  waste: Card[];
}

export function dealNewGame(): GameState {
  const deck = shuffle(createDeck());
  const tableau: Card[][] = [[], [], [], [], [], [], []];

  let i = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = deck[i++];
      card.faceUp = row === col;
      tableau[col].push(card);
    }
  }

  const stock = deck.slice(i);
  for (const card of stock) card.faceUp = false;

  const foundations: Record<Suit, Card[]> = {
    spades: [],
    hearts: [],
    diamonds: [],
    clubs: [],
  };

  return { tableau, foundations, stock, waste: [] };
}

export function isWon(state: GameState): boolean {
  return SUITS.every((suit) => state.foundations[suit].length === 13);
}

/** Deep-clones a GameState so it can be snapshotted for undo without aliasing. */
export function cloneState(state: GameState): GameState {
  const cloneCards = (cards: Card[]) => cards.map((c) => ({ ...c }));
  return {
    tableau: state.tableau.map(cloneCards),
    foundations: {
      spades: cloneCards(state.foundations.spades),
      hearts: cloneCards(state.foundations.hearts),
      diamonds: cloneCards(state.foundations.diamonds),
      clubs: cloneCards(state.foundations.clubs),
    },
    stock: cloneCards(state.stock),
    waste: cloneCards(state.waste),
  };
}

/**
 * Would removing the run starting at `cardIndex` expose a face-down card
 * underneath it? Used to award the tableau "reveal" score bonus without
 * needing the move functions to report it themselves.
 */
export function willReveal(column: Card[], cardIndex: number): boolean {
  const exposed = column[cardIndex - 1];
  return exposed !== undefined && !exposed.faceUp;
}

/** Can `card` be placed on top of the given tableau column? */
export function canPlaceOnTableau(card: Card, column: Card[]): boolean {
  if (column.length === 0) return card.rank === 13; // only Kings on empty columns
  const top = column[column.length - 1];
  if (!top.faceUp) return false;
  return isRed(card.suit) !== isRed(top.suit) && card.rank === top.rank - 1;
}

/** Can `card` be placed on the foundation for its suit? */
export function canPlaceOnFoundation(card: Card, state: GameState): boolean {
  const pile = state.foundations[card.suit];
  const nextRank = pile.length + 1;
  return card.rank === nextRank;
}

/** Draw one card from stock to waste. If stock is empty, redeal waste back into stock. */
export function drawFromStock(state: GameState): void {
  if (state.stock.length === 0) {
    state.stock = state.waste.reverse();
    state.waste = [];
    for (const card of state.stock) card.faceUp = false;
    return;
  }
  const card = state.stock.pop()!;
  card.faceUp = true;
  state.waste.push(card);
}

/** Move the top waste card onto a tableau column. Returns true if the move happened. */
export function moveWasteToTableau(state: GameState, columnIndex: number): boolean {
  const card = state.waste[state.waste.length - 1];
  if (!card) return false;
  if (!canPlaceOnTableau(card, state.tableau[columnIndex])) return false;
  state.waste.pop();
  state.tableau[columnIndex].push(card);
  return true;
}

/** Move the top waste card onto its foundation. Returns true if the move happened. */
export function moveWasteToFoundation(state: GameState): boolean {
  const card = state.waste[state.waste.length - 1];
  if (!card) return false;
  if (!canPlaceOnFoundation(card, state)) return false;
  state.waste.pop();
  state.foundations[card.suit].push(card);
  return true;
}

/** Move the top card of a foundation back onto a tableau column. */
export function moveFoundationToTableau(
  state: GameState,
  suit: Suit,
  columnIndex: number,
): boolean {
  const pile = state.foundations[suit];
  const card = pile[pile.length - 1];
  if (!card) return false;
  if (!canPlaceOnTableau(card, state.tableau[columnIndex])) return false;
  pile.pop();
  state.tableau[columnIndex].push(card);
  return true;
}

/**
 * Move the face-up run starting at `cardIndex` in tableau column `fromCol`
 * onto tableau column `toCol`.
 */
export function moveTableauToTableau(
  state: GameState,
  fromCol: number,
  cardIndex: number,
  toCol: number,
): boolean {
  const source = state.tableau[fromCol];
  const card = source[cardIndex];
  if (!card || !card.faceUp) return false;
  if (!canPlaceOnTableau(card, state.tableau[toCol])) return false;

  const moving = source.splice(cardIndex);
  state.tableau[toCol].push(...moving);
  flipTopCard(state.tableau[fromCol]);
  return true;
}

/** Move a single card from a tableau column onto its foundation. */
export function moveTableauToFoundation(state: GameState, col: number): boolean {
  const column = state.tableau[col];
  const card = column[column.length - 1];
  if (!card || !card.faceUp) return false;
  if (!canPlaceOnFoundation(card, state)) return false;
  column.pop();
  state.foundations[card.suit].push(card);
  flipTopCard(column);
  return true;
}

function flipTopCard(column: Card[]): void {
  const top = column[column.length - 1];
  if (top && !top.faceUp) top.faceUp = true;
}
