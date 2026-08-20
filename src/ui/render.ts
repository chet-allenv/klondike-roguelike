import { type Card, rankLabel, SUIT_SYMBOL, isRed, SUITS } from "../game/cards";
import {
  dealNewGame,
  isWon,
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveFoundationToTableau,
  moveTableauToTableau,
  moveTableauToFoundation,
} from "../game/klondike";

type Selection =
  | { kind: "tableau"; col: number; cardIndex: number }
  | { kind: "waste" }
  | { kind: "foundation"; suit: (typeof SUITS)[number] }
  | null;

export function mountGame(root: HTMLElement): void {
  let state = dealNewGame();
  let selection: Selection = null;

  function select(next: NonNullable<Selection>) {
    const current = selection;
    selection = current && sameSelection(current, next) ? null : next;
    draw();
  }

  function sameSelection(a: NonNullable<Selection>, b: NonNullable<Selection>): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "tableau" && b.kind === "tableau") {
      return a.col === b.col && a.cardIndex === b.cardIndex;
    }
    if (a.kind === "foundation" && b.kind === "foundation") return a.suit === b.suit;
    return a.kind === "waste" && b.kind === "waste";
  }

  function attemptMoveTo(target: { kind: "tableau"; col: number } | { kind: "foundation" }) {
    if (!selection) return;
    let moved = false;

    if (selection.kind === "waste") {
      moved =
        target.kind === "tableau"
          ? moveWasteToTableau(state, target.col)
          : moveWasteToFoundation(state);
    } else if (selection.kind === "tableau") {
      moved =
        target.kind === "tableau"
          ? moveTableauToTableau(state, selection.col, selection.cardIndex, target.col)
          : moveTableauToFoundation(state, selection.col);
    } else if (selection.kind === "foundation") {
      moved = target.kind === "tableau" && moveFoundationToTableau(state, selection.suit, target.col);
    }

    selection = null;
    if (moved) draw();
    else draw();
  }

  function handleStockClick() {
    selection = null;
    drawFromStock(state);
    draw();
  }

  function handleWasteClick() {
    if (state.waste.length === 0) return;
    select({ kind: "waste" });
  }

  function handleTableauClick(col: number, cardIndex: number | null) {
    const column = state.tableau[col];

    if (selection && !(selection.kind === "tableau" && selection.col === col)) {
      attemptMoveTo({ kind: "tableau", col });
      return;
    }

    if (cardIndex === null) return;
    const card = column[cardIndex];
    if (!card.faceUp) return;

    select({ kind: "tableau", col, cardIndex });
  }

  function handleFoundationClick(suit: (typeof SUITS)[number]) {
    if (selection && !(selection.kind === "foundation" && selection.suit === suit)) {
      attemptMoveTo({ kind: "foundation" });
      return;
    }
    if (state.foundations[suit].length > 0) select({ kind: "foundation", suit });
  }

  function handleNewGame() {
    state = dealNewGame();
    selection = null;
    draw();
  }

  function renderCard(card: Card, faceUp: boolean, selected: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = `card ${faceUp ? "face-up" : "face-down"} ${faceUp && isRed(card.suit) ? "red" : ""} ${selected ? "selected" : ""}`;
    if (faceUp) {
      el.innerHTML = `<span class="rank">${rankLabel(card.rank)}</span><span class="suit">${SUIT_SYMBOL[card.suit]}</span>`;
    }
    return el;
  }

  function draw(): void {
    root.innerHTML = "";

    const board = document.createElement("div");
    board.className = "board";

    const topRow = document.createElement("div");
    topRow.className = "top-row";

    // Stock
    const stockPile = document.createElement("div");
    stockPile.className = "pile stock";
    if (state.stock.length > 0) {
      stockPile.appendChild(renderCard(state.stock[state.stock.length - 1], false, false));
    } else {
      stockPile.classList.add("empty");
      stockPile.textContent = "↻";
    }
    stockPile.addEventListener("click", handleStockClick);
    topRow.appendChild(stockPile);

    // Waste
    const wastePile = document.createElement("div");
    wastePile.className = "pile waste";
    const wasteTop = state.waste[state.waste.length - 1];
    if (wasteTop) {
      wastePile.appendChild(
        renderCard(wasteTop, true, selection?.kind === "waste"),
      );
    } else {
      wastePile.classList.add("empty");
    }
    wastePile.addEventListener("click", handleWasteClick);
    topRow.appendChild(wastePile);

    topRow.appendChild(document.createElement("div")).className = "spacer";

    // Foundations
    for (const suit of SUITS) {
      const pile = document.createElement("div");
      pile.className = "pile foundation";
      const cards = state.foundations[suit];
      const top = cards[cards.length - 1];
      if (top) {
        pile.appendChild(renderCard(top, true, selection?.kind === "foundation" && selection.suit === suit));
      } else {
        pile.classList.add("empty");
        pile.textContent = SUIT_SYMBOL[suit];
      }
      pile.addEventListener("click", () => handleFoundationClick(suit));
      topRow.appendChild(pile);
    }

    board.appendChild(topRow);

    // Tableau
    const tableauRow = document.createElement("div");
    tableauRow.className = "tableau-row";
    state.tableau.forEach((column, col) => {
      const colEl = document.createElement("div");
      colEl.className = "column";

      if (column.length === 0) {
        const dropZone = document.createElement("div");
        dropZone.className = "card empty-slot";
        dropZone.addEventListener("click", () => handleTableauClick(col, null));
        colEl.appendChild(dropZone);
      } else {
        column.forEach((card, cardIndex) => {
          const selected =
            selection?.kind === "tableau" && selection.col === col && cardIndex >= selection.cardIndex;
          const cardEl = renderCard(card, card.faceUp, selected);
          cardEl.style.top = `${cardIndex * 24}px`;
          cardEl.addEventListener("click", (e) => {
            e.stopPropagation();
            handleTableauClick(col, cardIndex);
          });
          colEl.appendChild(cardEl);
        });
        colEl.style.height = `${140 + (column.length - 1) * 24}px`;
        colEl.addEventListener("click", () => handleTableauClick(col, null));
      }

      tableauRow.appendChild(colEl);
    });
    board.appendChild(tableauRow);

    root.appendChild(board);

    if (isWon(state)) {
      const banner = document.createElement("div");
      banner.className = "win-banner";
      banner.textContent = "You win!";
      root.appendChild(banner);
    }

    const newGameBtn = document.createElement("button");
    newGameBtn.className = "new-game";
    newGameBtn.textContent = "New Game";
    newGameBtn.addEventListener("click", handleNewGame);
    root.appendChild(newGameBtn);
  }

  draw();
}
