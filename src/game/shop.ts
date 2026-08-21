import { shuffle } from "./cards";
import { type Joker, type JokerId, JOKERS } from "./jokers";
import { type PowerUp, type PowerUpId, POWER_UPS } from "./powerups";
import { type Upgrade, UPGRADES } from "./upgrades";

/** Rerolling the shop costs this, and gets dearer within a single visit. */
export const REROLL_BASE_COST = 2;
export const REROLL_COST_STEP = 1;

export const JOKER_SLOTS = 2;
export const VOUCHER_SLOTS = 1;
export const UPGRADE_SLOTS = 2;

/** How many jokers a run can hold at once. */
export const JOKER_LIMIT = 5;

export type ShopItem =
  | { kind: "joker"; joker: Joker }
  | { kind: "voucher"; voucher: PowerUp }
  | { kind: "upgrade"; upgrade: Upgrade };

export interface ShopStock {
  items: ShopItem[];
  /** How many times this visit has been rerolled, which sets the next price. */
  rerolls: number;
}

export function rerollCost(rerolls: number): number {
  return REROLL_BASE_COST + rerolls * REROLL_COST_STEP;
}

export interface StockInput {
  /** Jokers already held — a run shouldn't be sold a duplicate. */
  jokers: readonly JokerId[];
  /** Vouchers already held, filtered the same way `draftPool` did. */
  vouchers: readonly PowerUpId[];
}

/**
 * Rolls a shop's stock: a couple of jokers, a voucher, and some card
 * upgrades. Slots go unfilled rather than duplicated if a category runs dry
 * (a run holding every joker, say), so callers must not assume a fixed count.
 */
export function rollStock(input: StockInput, rerolls = 0): ShopStock {
  const jokers = shuffle(JOKERS.filter((joker) => !input.jokers.includes(joker.id)))
    .slice(0, JOKER_SLOTS)
    .map((joker): ShopItem => ({ kind: "joker", joker }));

  const vouchers = shuffle(
    POWER_UPS.filter((voucher) => voucher.repeatable || !input.vouchers.includes(voucher.id)),
  )
    .slice(0, VOUCHER_SLOTS)
    .map((voucher): ShopItem => ({ kind: "voucher", voucher }));

  // Upgrades never run out — the same one can be bought repeatedly and
  // applied to different cards.
  const upgrades = shuffle([...UPGRADES])
    .slice(0, UPGRADE_SLOTS)
    .map((upgrade): ShopItem => ({ kind: "upgrade", upgrade }));

  return { items: [...jokers, ...vouchers, ...upgrades], rerolls };
}

export function itemCost(item: ShopItem): number {
  switch (item.kind) {
    case "joker":
      return item.joker.cost;
    case "voucher":
      return item.voucher.cost;
    case "upgrade":
      return item.upgrade.cost;
  }
}

export function itemName(item: ShopItem): string {
  switch (item.kind) {
    case "joker":
      return item.joker.name;
    case "voucher":
      return item.voucher.name;
    case "upgrade":
      return item.upgrade.name;
  }
}

export function itemDescription(item: ShopItem): string {
  switch (item.kind) {
    case "joker":
      return item.joker.description;
    case "voucher":
      return item.voucher.description;
    case "upgrade":
      return item.upgrade.description;
  }
}
