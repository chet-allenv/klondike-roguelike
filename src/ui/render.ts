import { type Card, type Suit, rankLabel, SUIT_SYMBOL, isRed, SUITS } from "../game/cards";
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

/**
 * Where a move can come from. Identical to a non-null `Selection` on
 * purpose: a drag is just "select a source, then choose a destination"
 * expressed with the pointer, so both interaction models feed the same
 * `attemptMoveTo` and the same validators in klondike.ts.
 */
type DragSource = NonNullable<Selection>;

/** Where a move can land. Rendered as `data-drop="tableau:3"` / `data-drop="foundation:hearts"`. */
type DropTarget = { kind: "tableau"; col: number } | { kind: "foundation"; suit: Suit };

/** How far the pointer must travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 5;

interface DragState {
  source: DragSource;
  pointerId: number;
  startX: number;
  startY: number;
  /** The card elements in flight — a tableau run is several cards at once. */
  cards: HTMLElement[];
  /** Fixed-position container the cards get lifted into. Null until the threshold is crossed. */
  layer: HTMLElement | null;
  /** Drop zones and their viewport rects, snapshotted once when the drag starts. */
  zones: { el: HTMLElement; target: DropTarget; rect: DOMRect }[];
  activeZone: HTMLElement | null;
  activeTarget: DropTarget | null;
  /** False while the press could still turn out to be a plain click. */
  active: boolean;
}

function parseDropTarget(value: string): DropTarget | null {
  const [kind, rest] = value.split(":");
  if (kind === "tableau") return { kind: "tableau", col: Number(rest) };
  if (kind === "foundation") return { kind: "foundation", suit: rest as Suit };
  return null;
}

function sameDropTarget(a: DropTarget, b: DropTarget): boolean {
  if (a.kind === "foundation" && b.kind === "foundation") return a.suit === b.suit;
  if (a.kind === "tableau" && b.kind === "tableau") return a.col === b.col;
  return false;
}

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

/**
 * Optional play assists, both **off by default**. Working out where a card
 * can go is the puzzle, so neither of these is baseline behavior — they're
 * held back as future power-ups (see the Power-ups list in CLAUDE.md), which
 * is why the code stays here fully wired rather than being deleted.
 */
export interface Assists {
  /**
   * Clicking a card sends it straight to its destination when exactly one
   * is legal, instead of only selecting it.
   */
  smartClick?: boolean;
  /**
   * While dragging, every legal drop zone is outlined and the one under the
   * pointer highlights — i.e. the game shows you the move before you commit.
   */
  dropHints?: boolean;
}

export interface MountOptions {
  /** Defaults to a fresh dealt hand. */
  initialState?: GameState;
  /** Play assists to enable for this hand. Everything off when omitted. */
  assists?: Assists;
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
  const {
    initialState = dealNewGame(),
    assists = {},
    redealsAllowed,
    undosAllowed,
    target,
    roundInfo,
    onHandEnd,
  } = options;
  const { smartClick = false, dropHints = false } = assists;

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
  let drag: DragState | null = null;
  // A completed drag is followed by the browser's synthetic click; without
  // this the click would run smart-click on top of the move just made.
  let swallowNextClick = false;

  root.innerHTML = "";
  const content = document.createElement("div");
  root.appendChild(content);
  // Every fresh press starts a fresh interaction, so any click left over
  // from a previous drag is stale by now. Capture phase so it runs before
  // the per-card pointerdown handlers.
  content.addEventListener("pointerdown", () => (swallowNextClick = false), true);

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

  function attemptMoveTo(target: DropTarget) {
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

  /** The card at the head of a drag — the one whose rank/suit decides legality. */
  function sourceCard(source: DragSource): Card | undefined {
    if (source.kind === "waste") return state.waste[state.waste.length - 1];
    if (source.kind === "foundation") {
      const pile = state.foundations[source.suit];
      return pile[pile.length - 1];
    }
    return state.tableau[source.col]?.[source.cardIndex];
  }

  function canDropOn(source: DragSource, target: DropTarget): boolean {
    const card = sourceCard(source);
    if (!card) return false;

    if (target.kind === "foundation") {
      // Strict on purpose: this answers "can the card land *here*", so it's
      // the card's own pile or nothing. Aiming at some other foundation is
      // handled upstream by resolveDropTarget, which rewrites the target
      // rather than loosening this check.
      if (source.kind === "foundation" || target.suit !== card.suit) return false;
      // Foundations take one card at a time, never a run.
      if (source.kind === "tableau" && source.cardIndex !== state.tableau[source.col].length - 1) return false;
      return canPlaceOnFoundation(card, state);
    }

    if (source.kind === "tableau" && source.col === target.col) return false;
    return canPlaceOnTableau(card, state.tableau[target.col]);
  }

  /** Marks a card as a drag handle. `collect` resolves the full run at press time. */
  function makeDraggable(el: HTMLElement, source: DragSource, collect: () => HTMLElement[]) {
    el.classList.add("draggable");
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (drag) {
        // The previous drag never got its pointerup — capture lost, or the
        // window was switched away mid-flight. Put the board back and let
        // the player press again rather than wedging on a stale drag.
        cancelDrag(drag);
        return;
      }
      if (ended) return;
      drag = {
        source,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        cards: collect(),
        layer: null,
        zones: [],
        activeZone: null,
        activeTarget: null,
        active: false,
      };
      // Keeps pointerup coming even if the button is released outside the
      // window, so a card can't end up stuck to the cursor. Guarded because
      // jsdom doesn't implement it.
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is a nicety — the window listeners below do the real work */
      }
      window.addEventListener("pointermove", handleDragMove);
      window.addEventListener("pointerup", handleDragEnd);
      window.addEventListener("pointercancel", handleDragCancel);
      window.addEventListener("keydown", handleDragKey);
    });
  }

  /**
   * Threshold crossed — this is a real drag. Lifts the card(s) out of the
   * board into a fixed-position layer that tracks the pointer, and lights up
   * every zone they could legally land on.
   */
  function activateDrag(d: DragState) {
    d.active = true;

    // Drag and click-to-select are two routes to the same move; starting one
    // abandons the other. The drag always ends in a draw(), which resyncs the
    // DOM, so clearing the classes by hand here is enough.
    selection = null;
    content.querySelectorAll(".card.selected").forEach((el) => el.classList.remove("selected"));

    const layer = document.createElement("div");
    layer.className = "drag-layer";
    // Read every rect before detaching any card, so the run keeps its cascade.
    const rects = d.cards.map((el) => el.getBoundingClientRect());
    d.cards.forEach((el, i) => {
      el.classList.add("dragging");
      el.style.left = `${rects[i].left}px`;
      el.style.top = `${rects[i].top}px`;
      el.style.zIndex = String(i);
      layer.appendChild(el);
    });
    // Inside `content` so the FLIP snapshot in draw() sees the cards at their
    // dropped position — that's what makes them fly home or into place.
    content.appendChild(layer);
    d.layer = layer;

    d.zones = [];
    content.querySelectorAll<HTMLElement>("[data-drop]").forEach((el) => {
      const target = parseDropTarget(el.dataset.drop ?? "");
      if (!target) return;
      d.zones.push({ el, target, rect: el.getBoundingClientRect() });
      if (dropHints && canDropOn(d.source, target)) el.classList.add("drop-legal");
    });

    document.body.classList.add("dragging-card");
  }

  /**
   * The four foundations act as one target: aim at any of them and the card
   * goes to its own suit's pile. Only the pile it will actually land on is
   * treated as the drop target — so `.drop-active` marks where the card
   * ends up, not where you happened to point. Tableau columns are addressed
   * literally; only foundations reroute.
   */
  function resolveDropTarget(source: DragSource, target: DropTarget): DropTarget {
    if (target.kind !== "foundation") return target;
    const card = sourceCard(source);
    return card ? { kind: "foundation", suit: card.suit } : target;
  }

  function updateDropTarget(d: DragState, x: number, y: number) {
    const hit = d.zones.find(
      ({ rect }) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
    );
    const resolved = hit && resolveDropTarget(d.source, hit.target);
    const target =
      resolved && canDropOn(d.source, resolved)
        ? (d.zones.find((zone) => sameDropTarget(zone.target, resolved)) ?? null)
        : null;
    if ((target?.el ?? null) === d.activeZone) return;

    // Tracking always runs — it's what the drop itself uses. Only the
    // telling-the-player-about-it part is gated.
    if (dropHints) {
      d.activeZone?.classList.remove("drop-active");
      target?.el.classList.add("drop-active");
    }
    d.activeZone = target?.el ?? null;
    d.activeTarget = target?.target ?? null;
  }

  function handleDragMove(e: PointerEvent) {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      activateDrag(d);
    }

    d.layer!.style.transform = `translate(${dx}px, ${dy}px)`;
    updateDropTarget(d, e.clientX, e.clientY);
  }

  function handleDragEnd(e: PointerEvent) {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const target = d.activeTarget;
    teardownDrag(d);

    // Never crossed the threshold: leave it alone and let the browser's
    // click through to the smart-click / select handlers.
    if (!d.active) return;

    swallowNextClick = true;
    if (target && canDropOn(d.source, target)) {
      selection = d.source;
      attemptMoveTo(target);
    } else {
      draw(); // no legal target — the card flies back where it came from
    }
  }

  function handleDragCancel(e: PointerEvent) {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    cancelDrag(d);
  }

  function handleDragKey(e: KeyboardEvent) {
    if (e.key !== "Escape" || !drag) return;
    cancelDrag(drag);
  }

  function cancelDrag(d: DragState) {
    teardownDrag(d);
    if (!d.active) return;
    swallowNextClick = true;
    draw();
  }

  function teardownDrag(d: DragState) {
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", handleDragEnd);
    window.removeEventListener("pointercancel", handleDragCancel);
    window.removeEventListener("keydown", handleDragKey);
    if (d.active) {
      document.body.classList.remove("dragging-card");
      for (const { el } of d.zones) el.classList.remove("drop-legal", "drop-active");
    }
    drag = null;
  }

  /** True when this click is the tail end of a drag and should be ignored. */
  function isDragClick(): boolean {
    if (!swallowNextClick) return false;
    swallowNextClick = false;
    return true;
  }

  function handleStockClick() {
    if (isDragClick()) return;
    if (!canDrawFromStock(state, roundState)) return;

    const prev = snapshot();
    registerStockDraw(state, roundState); // must run before drawFromStock mutates
    drawFromStock(state);
    history.push(prev);
    selection = null;
    draw();
  }

  function handleWasteClick() {
    if (isDragClick()) return;
    const card = state.waste[state.waste.length - 1];
    if (!card) return;

    const alreadySelected = selection?.kind === "waste";
    if (smartClick && !alreadySelected && tryAutoMove(card, { kind: "waste" })) return;

    select({ kind: "waste" });
  }

  function handleTableauClick(col: number, cardIndex: number | null) {
    if (isDragClick()) return;
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

    if (smartClick && !alreadySelected && tryAutoMove(card, { kind: "tableau", col, cardIndex })) return;

    select({ kind: "tableau", col, cardIndex });
  }

  function handleFoundationClick(suit: (typeof SUITS)[number]) {
    if (isDragClick()) return;
    if (selection && !(selection.kind === "foundation" && selection.suit === suit)) {
      attemptMoveTo({ kind: "foundation", suit });
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
      const wasteTopEl = renderCard(wasteTop, true, selection?.kind === "waste");
      makeDraggable(wasteTopEl, { kind: "waste" }, () => [wasteTopEl]);
      wastePile.appendChild(wasteTopEl);
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
      pile.dataset.drop = `foundation:${suit}`;
      const cards = state.foundations[suit];
      const top = cards[cards.length - 1];
      const under = cards[cards.length - 2];
      if (top) {
        if (under) pile.appendChild(renderCard(under, true, false));
        const topEl = renderCard(top, true, selection?.kind === "foundation" && selection.suit === suit);
        makeDraggable(topEl, { kind: "foundation", suit }, () => [topEl]);
        pile.appendChild(topEl);
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
      colEl.dataset.drop = `tableau:${col}`;

      if (column.length === 0) {
        const dropZone = document.createElement("div");
        dropZone.className = "card empty-slot";
        dropZone.addEventListener("click", () => handleTableauClick(col, null));
        colEl.appendChild(dropZone);
      } else {
        // Filled first, then wired for dragging: a face-up card drags the
        // whole run below it, which isn't known until the column is built.
        const cardEls: HTMLElement[] = [];
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
          cardEls.push(cardEl);
          colEl.appendChild(cardEl);
        });
        column.forEach((card, cardIndex) => {
          if (!card.faceUp) return;
          makeDraggable(cardEls[cardIndex], { kind: "tableau", col, cardIndex }, () =>
            cardEls.slice(cardIndex),
          );
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
