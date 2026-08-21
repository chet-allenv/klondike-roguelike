import { rankLabel, SUIT_SYMBOL, SUITS } from "../game/cards";
import { type Payout, roundPayout } from "../game/economy";
import { jokerById, jokerRoundEndMoney } from "../game/jokers";
import type { GameState } from "../game/klondike";
import { effectsOf, powerUpById } from "../game/powerups";
import {
  adjustMoney,
  createRun,
  grantDeckUpgrade,
  grantJoker,
  grantPowerUp,
  REDEALS_PER_ROUND,
  resolveRound,
  type RoundOutcome,
  type RunState,
  targetForRound,
  UNDOS_PER_ROUND,
} from "../game/roguelike";
import {
  itemCost,
  itemDescription,
  itemName,
  JOKER_LIMIT,
  rerollCost,
  rollStock,
  type ShopItem,
  type ShopStock,
} from "../game/shop";
import { describeScope, type Upgrade, type UpgradeScope } from "../game/upgrades";
import { type HandEndResult, mountGame } from "./render";

export interface AppOptions {
  /**
   * Deals each round's hand. Defaults to a fresh random deal; injectable so
   * tests can put a known board on the table.
   */
  deal?: () => GameState;
  /**
   * The score target for a given round. Defaults to the run's escalation
   * curve; injectable so tests can force a round to be won or lost without
   * having to actually play it out.
   */
  targetFor?: (round: number) => number;
}

/** Bootstraps and drives the full roguelike run: hands, payouts, and the shop. */
export function mountApp(root: HTMLElement, options: AppOptions = {}): void {
  const { deal, targetFor = targetForRound } = options;
  let run: RunState = createRun();
  let stock: ShopStock | null = null;
  /** Set while the player is choosing what a bought upgrade attaches to. */
  let pendingUpgrade: Upgrade | null = null;

  function startRound() {
    const target = targetFor(run.round);
    // Read once per round: vouchers fold into one effects object that sets
    // the hand up. Jokers and deck upgrades are passed through to be
    // consulted per scoring card.
    const effects = effectsOf(run.powerUps);

    mountGame(root, {
      initialState: deal?.(),
      redealsAllowed: REDEALS_PER_ROUND + effects.extraRedeals,
      undosAllowed: UNDOS_PER_ROUND + effects.extraUndos,
      target,
      scoreMultiplier: effects.scoreMultiplier,
      comboKeeper: effects.comboKeeper,
      peekStock: effects.peekStock,
      jokers: run.jokers.map(jokerById),
      deckUpgrades: run.deckUpgrades,
      assists: { smartClick: effects.smartClick, dropHints: effects.dropHints },
      roundInfo: {
        round: run.round,
        lives: run.lives,
        money: run.money,
        powerUps: run.powerUps.map((id) => powerUpById(id).name),
        jokers: run.jokers.map((id) => jokerById(id).name),
      },
      onHandEnd: (result) => finishRound(result, target),
    });
  }

  function finishRound(result: HandEndResult, target: number) {
    const round = run.round;
    const outcome = resolveRound(run, result.score, target);
    const payout = roundPayout(outcome.result === "won", {
      round,
      score: result.score,
      target,
      redealsLeft: result.redealsLeft,
      undosLeft: result.undosLeft,
      // Interest is charged on what was held going in, before this payout.
      moneyHeld: run.money,
      jokerMoney: jokerRoundEndMoney(run.jokers.map(jokerById)),
      inHandMoney: result.money,
    });

    run = adjustMoney(outcome.run, payout.total);
    showRoundResult(outcome, payout, result.score, target);
  }

  function showRoundResult(outcome: RoundOutcome, payout: Payout, score: number, target: number) {
    root.innerHTML = "";
    pendingUpgrade = null;

    const panel = document.createElement("div");
    panel.className = "round-result";

    const heading = document.createElement("h2");
    heading.textContent = outcome.result === "won" ? "Round Cleared!" : "Round Lost";
    panel.appendChild(heading);

    const scoreLine = document.createElement("p");
    scoreLine.textContent = `Score: ${score} / ${target}`;
    panel.appendChild(scoreLine);

    if (outcome.secondChanceUsed) {
      const saved = document.createElement("p");
      saved.className = "second-chance";
      saved.textContent = "Second Chance absorbed it — no life lost.";
      panel.appendChild(saved);
    }

    panel.appendChild(payoutTable(payout));

    if (run.gameOver) {
      appendRunSummary(panel);
    } else if (outcome.result === "won") {
      stock = rollStock({ jokers: run.jokers, vouchers: run.powerUps });
      panel.appendChild(shopPanel());
    } else {
      const livesLine = document.createElement("p");
      livesLine.textContent = `Lives: ${run.lives}`;
      panel.appendChild(livesLine);
      panel.appendChild(button("continue", "Continue", startRound));
    }

    root.appendChild(panel);
  }

  /** Shows the payout line by line, so the money rules are visible rather than folklore. */
  function payoutTable(payout: Payout): HTMLElement {
    const table = document.createElement("dl");
    table.className = "payout";

    const lines: [string, number][] = [
      ["Round cleared", payout.base],
      ["Unspent redeals & undos", payout.leftovers],
      ["Score overshoot", payout.overshoot],
      ["Interest", payout.interest],
      ["Jokers", payout.jokers],
      ["Earned in hand", payout.inHand],
    ];

    for (const [label, amount] of lines) {
      if (amount === 0) continue;
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = `$${amount}`;
      table.append(term, value);
    }

    const totalTerm = document.createElement("dt");
    totalTerm.className = "payout-total";
    totalTerm.textContent = payout.total > 0 ? "Payout" : "No payout";
    const totalValue = document.createElement("dd");
    totalValue.className = "payout-total";
    totalValue.textContent = `$${payout.total}`;
    table.append(totalTerm, totalValue);

    return table;
  }

  function shopPanel(): HTMLElement {
    const shop = document.createElement("div");
    shop.className = "shop";

    const header = document.createElement("div");
    header.className = "shop-header";
    header.innerHTML = `<span class="shop-title">Shop</span><span class="shop-money">$${run.money}</span>`;
    shop.appendChild(header);

    if (pendingUpgrade) {
      shop.appendChild(scopePicker(pendingUpgrade));
      return shop;
    }

    const items = document.createElement("div");
    items.className = "shop-items";
    for (const item of stock?.items ?? []) items.appendChild(shopCard(item));
    shop.appendChild(items);

    const actions = document.createElement("div");
    actions.className = "shop-actions";
    const cost = rerollCost(stock?.rerolls ?? 0);
    const reroll = button("reroll", `Reroll ($${cost})`, () => {
      if (run.money < cost) return;
      run = adjustMoney(run, -cost);
      stock = rollStock({ jokers: run.jokers, vouchers: run.powerUps }, (stock?.rerolls ?? 0) + 1);
      refreshShop();
    });
    reroll.disabled = run.money < cost;
    actions.appendChild(reroll);
    actions.appendChild(button("continue", "Next Round", startRound));
    shop.appendChild(actions);

    return shop;
  }

  function shopCard(item: ShopItem): HTMLElement {
    const cost = itemCost(item);
    const atJokerLimit = item.kind === "joker" && run.jokers.length >= JOKER_LIMIT;
    const affordable = run.money >= cost && !atJokerLimit;

    const card = document.createElement("button");
    card.className = `shop-item shop-${item.kind}`;
    card.dataset.itemKind = item.kind;
    card.dataset.itemId =
      item.kind === "joker"
        ? item.joker.id
        : item.kind === "voucher"
          ? item.voucher.id
          : item.upgrade.id;
    card.disabled = !affordable;

    const name = document.createElement("span");
    name.className = "shop-item-name";
    name.textContent = itemName(item);

    const price = document.createElement("span");
    price.className = "shop-item-price";
    price.textContent = `$${cost}`;

    const description = document.createElement("span");
    description.className = "shop-item-description";
    description.textContent = atJokerLimit
      ? `Joker slots full (${JOKER_LIMIT}).`
      : itemDescription(item);

    card.append(name, price, description);
    card.addEventListener("click", () => buy(item));
    return card;
  }

  function buy(item: ShopItem) {
    const cost = itemCost(item);
    if (run.money < cost) return;

    if (item.kind === "joker") {
      if (run.jokers.length >= JOKER_LIMIT) return;
      run = grantJoker(adjustMoney(run, -cost), item.joker.id);
    } else if (item.kind === "voucher") {
      run = grantPowerUp(adjustMoney(run, -cost), item.voucher.id);
    } else {
      // Upgrades aren't finished until they're pointed at something.
      run = adjustMoney(run, -cost);
      pendingUpgrade = item.upgrade;
    }

    if (stock) stock = { ...stock, items: stock.items.filter((sold) => sold !== item) };
    refreshShop();
  }

  /**
   * Where a bought upgrade goes: one specific card, a whole suit, or a whole
   * rank. All three are the same record on the run — see UpgradeScope.
   */
  function scopePicker(upgrade: Upgrade): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "scope-picker";

    const prompt = document.createElement("p");
    prompt.className = "scope-prompt";
    prompt.textContent = `Apply ${upgrade.name} to:`;
    picker.appendChild(prompt);

    const attach = (scope: UpgradeScope) => {
      run = grantDeckUpgrade(run, { scope, upgrade: upgrade.id });
      pendingUpgrade = null;
      refreshShop();
    };

    picker.appendChild(scopeGroup("Suits", "scope-suits", SUITS.map((suit) => ({
      label: SUIT_SYMBOL[suit],
      className: suit === "hearts" || suit === "diamonds" ? "red" : "",
      scope: { kind: "suit", suit } as UpgradeScope,
    })), attach));

    picker.appendChild(scopeGroup("Ranks", "scope-ranks", Array.from({ length: 13 }, (_, i) => ({
      label: rankLabel(i + 1),
      className: "",
      scope: { kind: "rank", rank: i + 1 } as UpgradeScope,
    })), attach));

    const cards = SUITS.flatMap((suit) =>
      Array.from({ length: 13 }, (_, i) => ({
        label: `${rankLabel(i + 1)}${SUIT_SYMBOL[suit]}`,
        className: suit === "hearts" || suit === "diamonds" ? "red" : "",
        scope: { kind: "card", cardId: `${suit}-${i + 1}` } as UpgradeScope,
      })),
    );
    picker.appendChild(scopeGroup("A single card", "scope-cards", cards, attach));

    return picker;
  }

  function scopeGroup(
    title: string,
    className: string,
    entries: { label: string; className: string; scope: UpgradeScope }[],
    attach: (scope: UpgradeScope) => void,
  ): HTMLElement {
    const group = document.createElement("div");
    group.className = `scope-group ${className}`;

    const heading = document.createElement("span");
    heading.className = "scope-group-title";
    heading.textContent = title;
    group.appendChild(heading);

    const row = document.createElement("div");
    row.className = "scope-row";
    for (const entry of entries) {
      const choice = document.createElement("button");
      choice.className = `scope-choice ${entry.className}`.trim();
      choice.textContent = entry.label;
      choice.dataset.scope =
        entry.scope.kind === "card"
          ? `card:${entry.scope.cardId}`
          : entry.scope.kind === "suit"
            ? `suit:${entry.scope.suit}`
            : `rank:${entry.scope.rank}`;
      choice.addEventListener("click", () => attach(entry.scope));
      row.appendChild(choice);
    }
    group.appendChild(row);

    return group;
  }

  /** Re-renders just the shop in place, leaving the round result above it alone. */
  function refreshShop() {
    const existing = root.querySelector(".shop");
    if (!existing) return;
    existing.replaceWith(shopPanel());
  }

  function appendRunSummary(panel: HTMLElement) {
    const cleared = run.roundsCleared;
    const summary = document.createElement("p");
    summary.textContent = `Run over — ${cleared} round${cleared === 1 ? "" : "s"} cleared.`;
    panel.appendChild(summary);

    const jokers = document.createElement("p");
    jokers.className = "collected-jokers";
    jokers.textContent = run.jokers.length
      ? `Jokers: ${run.jokers.map((id) => jokerById(id).name).join(", ")}`
      : "Jokers: none";
    panel.appendChild(jokers);

    const collected = document.createElement("p");
    collected.className = "collected";
    collected.textContent = run.powerUps.length
      ? `Vouchers: ${run.powerUps.map((id) => powerUpById(id).name).join(", ")}`
      : "Vouchers: none";
    panel.appendChild(collected);

    const upgrades = document.createElement("p");
    upgrades.className = "collected-upgrades";
    upgrades.textContent = run.deckUpgrades.length
      ? `Deck: ${run.deckUpgrades
          .map((entry) => `${entry.upgrade} on ${describeScope(entry.scope, rankLabel)}`)
          .join(", ")}`
      : "Deck: unmodified";
    panel.appendChild(upgrades);

    panel.appendChild(
      button("continue", "New Run", () => {
        run = createRun();
        startRound();
      }),
    );
  }

  function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement("button");
    el.className = className;
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  startRound();
}
