import { type Card, rankLabel, SUIT_SYMBOL, isRed, SUITS } from "../game/cards";
import {
  canPlaceOnFoundation,
  canPlaceOnTableau,
  cloneState,
  dealNewGame,
  drawFromStock,
  type GameState,
  isWon,
  moveFoundationToTableau,
  moveTableauToTableau,
  moveTableauToFoundation,
  moveWasteToFoundation,
  moveWasteToTableau,
  willReveal,
} from "../game/klondike";
import { applyScoreEvent, createScoreState, type ScoreState } from "../game/scoring";

type Selection =
  | { kind: "tableau"; col: number; cardIndex: number }
  | { kind: "waste" }
  | { kind: "foundation"; suit: (typeof SUITS)[number] }
  | null;

interface Snapshot {
  state: GameState;
  score: ScoreState;
}

export function mountGame(root: HTMLElement, initialState: GameState = dealNewGame()): void {
  let state = initialState;
  let score = createScoreState();
  let selection: Selection = null;
  let history: Snapshot[] = [];

  function snapshot(): Snapshot {
    return { state: cloneState(state), score: { ...score } };
  }

  // Commits a snapshot taken *before* a successful mutation, so it can be
  // restored by Undo, then clears selection and re-renders.
  function commit(prev: Snapshot) {
    history.push(prev);
    selection = null;
    draw();
  }

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

  function doMoveWasteToFoundation(): boolean {
    const prev = snapshot();
    if (!moveWasteToFoundation(state)) return false;
    score = applyScoreEvent(score, "foundation-play");
    commit(prev);
    return true;
  }

  function doMoveWasteToTableau(col: number): boolean {
    const prev = snapshot();
    if (!moveWasteToTableau(state, col)) return false;
    score = applyScoreEvent(score, "waste-to-tableau");
    commit(prev);
    return true;
  }

  function doMoveFoundationToTableau(suit: (typeof SUITS)[number], col: number): boolean {
    const prev = snapshot();
    if (!moveFoundationToTableau(state, suit, col)) return false;
    score = applyScoreEvent(score, "foundation-to-tableau");
    commit(prev);
    return true;
  }

  function doMoveTableauToTableau(fromCol: number, cardIndex: number, toCol: number): boolean {
    const prev = snapshot();
    const revealed = willReveal(state.tableau[fromCol], cardIndex);
    if (!moveTableauToTableau(state, fromCol, cardIndex, toCol)) return false;
    if (revealed) score = applyScoreEvent(score, "reveal");
    score = applyScoreEvent(score, "tableau-to-tableau");
    commit(prev);
    return true;
  }

  function doMoveTableauToFoundation(col: number): boolean {
    const prev = snapshot();
    const column = state.tableau[col];
    const revealed = willReveal(column, column.length - 1);
    if (!moveTableauToFoundation(state, col)) return false;
    if (revealed) score = applyScoreEvent(score, "reveal");
    score = applyScoreEvent(score, "foundation-play");
    commit(prev);
    return true;
  }

  /**
   * "Smart click": if the clicked card has exactly one legal home (its
   * foundation, or a single valid tableau column), send it there directly
   * instead of requiring a manual select-then-click-destination. Falls back
   * (returns false) when the destination is ambiguous or there isn't one,
   * so the player can still choose manually.
   */
  function tryAutoMove(
    card: Card,
    source: { kind: "waste" } | { kind: "tableau"; col: number; cardIndex: number },
  ): boolean {
    const isRun = source.kind === "tableau" && source.cardIndex < state.tableau[source.col].length - 1;

    if (!isRun && canPlaceOnFoundation(card, state)) {
      return source.kind === "waste" ? doMoveWasteToFoundation() : doMoveTableauToFoundation(source.col);
    }

    const excludeCol = source.kind === "tableau" ? source.col : -1;
    const legalCols: number[] = [];
    for (let col = 0; col < state.tableau.length; col++) {
      if (col === excludeCol) continue;
      if (canPlaceOnTableau(card, state.tableau[col])) legalCols.push(col);
    }

    if (legalCols.length === 1) {
      const [col] = legalCols;
      return source.kind === "waste"
        ? doMoveWasteToTableau(col)
        : doMoveTableauToTableau(source.col, source.cardIndex, col);
    }

    return false;
  }

  function attemptMoveTo(target: { kind: "tableau"; col: number } | { kind: "foundation" }) {
    if (!selection) return;
    let moved = false;

    if (selection.kind === "waste") {
      moved = target.kind === "tableau" ? doMoveWasteToTableau(target.col) : doMoveWasteToFoundation();
    } else if (selection.kind === "tableau") {
      moved =
        target.kind === "tableau"
          ? doMoveTableauToTableau(selection.col, selection.cardIndex, target.col)
          : doMoveTableauToFoundation(selection.col);
    } else if (selection.kind === "foundation") {
      moved = target.kind === "tableau" && doMoveFoundationToTableau(selection.suit, target.col);
    }

    if (!moved) {
      selection = null;
      draw();
    }
  }

  function handleStockClick() {
    const prev = snapshot();
    drawFromStock(state);
    history.push(prev);
    selection = null;
    draw();
  }

  function handleWasteClick() {
    const card = state.waste[state.waste.length - 1];
    if (!card) return;

    const alreadySelected = selection?.kind === "waste";
    if (!alreadySelected && tryAutoMove(card, { kind: "waste" })) return;

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

    const alreadySelected =
      selection?.kind === "tableau" && selection.col === col && selection.cardIndex === cardIndex;

    if (!alreadySelected && tryAutoMove(card, { kind: "tableau", col, cardIndex })) return;

    select({ kind: "tableau", col, cardIndex });
  }

  function handleFoundationClick(suit: (typeof SUITS)[number]) {
    if (selection && !(selection.kind === "foundation" && selection.suit === suit)) {
      attemptMoveTo({ kind: "foundation" });
      return;
    }
    if (state.foundations[suit].length > 0) select({ kind: "foundation", suit });
  }

  function handleUndo() {
    const prev = history.pop();
    if (!prev) return;
    state = prev.state;
    score = prev.score;
    selection = null;
    draw();
  }

  function handleNewGame() {
    state = dealNewGame();
    score = createScoreState();
    history = [];
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

    const hud = document.createElement("div");
    hud.className = "hud";
    hud.innerHTML = `<span class="score">Score: ${score.total}</span>`;
    if (score.comboStreak > 1) {
      hud.innerHTML += `<span class="combo">Combo x${score.comboStreak}</span>`;
    }
    root.appendChild(hud);

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

    const controls = document.createElement("div");
    controls.className = "controls";

    const undoBtn = document.createElement("button");
    undoBtn.className = "undo";
    undoBtn.textContent = "Undo";
    undoBtn.disabled = history.length === 0;
    undoBtn.addEventListener("click", handleUndo);
    controls.appendChild(undoBtn);

    const newGameBtn = document.createElement("button");
    newGameBtn.className = "new-game";
    newGameBtn.textContent = "New Game";
    newGameBtn.addEventListener("click", handleNewGame);
    controls.appendChild(newGameBtn);

    root.appendChild(controls);
  }

  draw();
}
