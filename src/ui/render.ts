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
import {
  canDrawFromStock,
  canUndo,
  createRoundState,
  isRoundStuck,
  registerStockDraw,
  registerUndo,
} from "../game/roguelike";
import { applyScoreEvent, createScoreState, type ScoreState } from "../game/scoring";

type Selection =
  | { kind: "tableau"; col: number; cardIndex: number }
  | { kind: "waste" }
  | { kind: "foundation"; suit: (typeof SUITS)[number] }
  | null;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Snapshots the viewport position of every rendered card, keyed by card id. */
function captureCardRects(content: HTMLElement): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  content.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
    const id = el.dataset.cardId;
    if (id) rects.set(id, el.getBoundingClientRect());
  });
  return rects;
}

/**
 * FLIP technique: given where each still-present card used to be, apply an
 * inverse transform so it visually stays put, then release it next frame so
 * the browser animates the transform back to identity — i.e. the card
 * appears to slide from its old spot to its new one, without ever having to
 * reuse or diff DOM nodes across renders.
 */
function animateCardMoves(content: HTMLElement, firstRects: Map<string, DOMRect>): void {
  const moved: { el: HTMLElement; restoreZIndex: string }[] = [];

  content.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
    const id = el.dataset.cardId;
    const first = id && firstRects.get(id);
    if (!first) return;

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx === 0 && dy === 0) return;

    // This draw() already gave the card its resting z-index (e.g. its
    // cascade position in a tableau column) — remember it so it can be
    // restored, rather than cleared, once the flight is over.
    const restoreZIndex = el.style.zIndex;

    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    // Above everything else for the duration of the flight, regardless of
    // which pile/column it's landing on or passing over.
    el.style.zIndex = "1000";
    moved.push({ el, restoreZIndex });
  });

  if (moved.length === 0) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const { el, restoreZIndex } of moved) {
        el.style.transition = "";
        el.style.transform = "";
        el.style.zIndex = restoreZIndex;
      }
    });
  });
}

interface Snapshot {
  state: GameState;
  score: ScoreState;
  redealsUsed?: number;
}

export interface HandEndResult {
  won: boolean;
  score: number;
}

export interface MountOptions {
  /** Defaults to a fresh dealt hand. */
  initialState?: GameState;
  /** Caps stock redeals for the round. Omit for unlimited (freeplay). */
  redealsAllowed?: number;
  /** Caps undos for the round. Omit for unlimited (freeplay). */
  undosAllowed?: number;
  /** Round's score target. When set, the HUD shows "Score: X / target". */
  target?: number;
  /** Extra HUD context, e.g. current round number and lives remaining. */
  roundInfo?: { round: number; lives: number };
  /**
   * Fires once, the moment the hand is won (all foundations complete) or
   * becomes stuck (no legal move and no way to draw). In this mode the
   * New Game button is hidden — round progression is owned by whoever
   * passed this callback (see ui/app.ts), not by this hand.
   */
  onHandEnd?: (result: HandEndResult) => void;
}

export function mountGame(root: HTMLElement, options: MountOptions = {}): void {
  const { initialState = dealNewGame(), redealsAllowed, undosAllowed, target, roundInfo, onHandEnd } = options;

  let state = initialState;
  let score = createScoreState();
  let selection: Selection = null;
  let history: Snapshot[] = [];
  // Unset allowances mean "unlimited" (freeplay); Infinity never blocks below.
  const roundState = createRoundState(
    redealsAllowed ?? Number.POSITIVE_INFINITY,
    undosAllowed ?? Number.POSITIVE_INFINITY,
  );
  let ended = false;
  const reduceMotion = prefersReducedMotion();
  // Tracks each card's face-up state as of the *previous* draw, so a
  // false -> true transition this draw can be flagged as a fresh reveal.
  let previousFaceUp = new Map<string, boolean>();
  let nextFaceUp = new Map<string, boolean>();
  let previousWon = false;

  root.innerHTML = "";
  const content = document.createElement("div");
  root.appendChild(content);

  function snapshot(): Snapshot {
    return { state: cloneState(state), score: { ...score }, redealsUsed: roundState.redealsUsed };
  }

  // Commits a snapshot taken *before* a successful mutation, so it can be
  // restored by Undo, then clears selection and re-renders.
  function commit(prev: Snapshot) {
    history.push(prev);
    selection = null;
    draw();
  }

  function checkHandEnd() {
    if (ended || !onHandEnd) return;
    if (isWon(state) || (target !== undefined && score.total >= target)) {
      // A perfect clear always wins; reaching the target also wins the
      // round immediately, without having to finish out the hand.
      ended = true;
      onHandEnd({ won: true, score: score.total });
    } else if (isRoundStuck(state, roundState)) {
      ended = true;
      onHandEnd({ won: false, score: score.total });
    }
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
    if (!canDrawFromStock(state, roundState)) return;

    const prev = snapshot();
    registerStockDraw(state, roundState); // must run before drawFromStock mutates
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
    if (!canUndo(roundState)) return;
    const prev = history.pop();
    if (!prev) return;
    state = prev.state;
    score = prev.score;
    if (prev.redealsUsed !== undefined) roundState.redealsUsed = prev.redealsUsed;
    registerUndo(roundState);
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
    const justRevealed = !reduceMotion && faceUp && previousFaceUp.get(card.id) === false;
    nextFaceUp.set(card.id, faceUp);

    const el = document.createElement("div");
    el.dataset.cardId = card.id;
    el.className = [
      "card",
      faceUp ? "face-up" : "face-down",
      faceUp && isRed(card.suit) ? "red" : "",
      selected ? "selected" : "",
      justRevealed ? "revealing" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (faceUp) {
      el.innerHTML = `<span class="rank">${rankLabel(card.rank)}</span><span class="suit">${SUIT_SYMBOL[card.suit]}</span>`;
    }
    return el;
  }

  function draw(): void {
    const firstRects = captureCardRects(content);
    nextFaceUp = new Map();
    const justWon = !reduceMotion && isWon(state) && !previousWon;

    content.innerHTML = "";

    const hud = document.createElement("div");
    hud.className = "hud";
    hud.innerHTML = `<span class="score">Score: ${score.total}${target !== undefined ? ` / ${target}` : ""}</span>`;
    if (score.comboStreak > 1) {
      hud.innerHTML += `<span class="combo">Combo x${score.comboStreak}</span>`;
    }
    if (roundInfo) {
      hud.innerHTML += `<span class="round-info">Round ${roundInfo.round} · ♥${roundInfo.lives}</span>`;
    }
    if (redealsAllowed !== undefined) {
      const redealsLeft = roundState.redealsAllowed - roundState.redealsUsed;
      hud.innerHTML += `<span class="redeals">Redeals left: ${redealsLeft}</span>`;
    }
    if (undosAllowed !== undefined) {
      const undosLeft = roundState.undosAllowed - roundState.undosUsed;
      hud.innerHTML += `<span class="undos-left">Undos left: ${undosLeft}</span>`;
    }
    content.appendChild(hud);

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

    // Waste. Renders the card underneath the top one too (still there,
    // just covered) so a new draw visibly lands on top of it instead of
    // the previous top card seeming to vanish/get swapped out.
    const wastePile = document.createElement("div");
    wastePile.className = "pile waste";
    const wasteTop = state.waste[state.waste.length - 1];
    const wasteUnder = state.waste[state.waste.length - 2];
    if (wasteTop) {
      if (wasteUnder) wastePile.appendChild(renderCard(wasteUnder, true, false));
      wastePile.appendChild(renderCard(wasteTop, true, selection?.kind === "waste"));
    } else {
      wastePile.classList.add("empty");
    }
    wastePile.addEventListener("click", handleWasteClick);
    topRow.appendChild(wastePile);

    topRow.appendChild(document.createElement("div")).className = "spacer";

    // Foundations. Same "show the covered card too" approach as waste.
    SUITS.forEach((suit, suitIndex) => {
      const pile = document.createElement("div");
      pile.className = "pile foundation";
      const cards = state.foundations[suit];
      const top = cards[cards.length - 1];
      const under = cards[cards.length - 2];
      if (top) {
        if (under) pile.appendChild(renderCard(under, true, false));
        pile.appendChild(renderCard(top, true, selection?.kind === "foundation" && selection.suit === suit));
      } else {
        pile.classList.add("empty");
        pile.textContent = SUIT_SYMBOL[suit];
      }
      if (justWon) {
        pile.classList.add("celebrating");
        pile.style.animationDelay = `${suitIndex * 90}ms`;
      }
      pile.addEventListener("click", () => handleFoundationClick(suit));
      topRow.appendChild(pile);
    });

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
          cardEl.style.zIndex = String(cardIndex);
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

    content.appendChild(board);

    if (isWon(state)) {
      const banner = document.createElement("div");
      banner.className = justWon ? "win-banner celebrating" : "win-banner";
      banner.textContent = "You win!";
      content.appendChild(banner);
    }

    const controls = document.createElement("div");
    controls.className = "controls";

    const undoBtn = document.createElement("button");
    undoBtn.className = "undo";
    undoBtn.textContent = "Undo";
    undoBtn.disabled = history.length === 0 || !canUndo(roundState);
    undoBtn.addEventListener("click", handleUndo);
    controls.appendChild(undoBtn);

    if (!onHandEnd) {
      // Round progression outside freeplay is owned by the caller (ui/app.ts).
      const newGameBtn = document.createElement("button");
      newGameBtn.className = "new-game";
      newGameBtn.textContent = "New Game";
      newGameBtn.addEventListener("click", handleNewGame);
      controls.appendChild(newGameBtn);
    }

    content.appendChild(controls);

    previousFaceUp = nextFaceUp;
    previousWon = isWon(state);
    if (!reduceMotion) animateCardMoves(content, firstRects);

    checkHandEnd();
  }

  draw();
}
