# Klondike Roguelike

A browser-based card game: classic Klondike solitaire reframed as a
roguelike run. Play a hand, hit a score target, draft a power-up, repeat —
difficulty escalates each round until you run out of lives.

See [CLAUDE.md](./CLAUDE.md) for full design and scope notes.

## Setup

Requires [Node.js](https://nodejs.org/) 20+ and npm.

```sh
npm run setup
```

This installs dependencies and runs a typecheck + test pass to confirm
the project works on your machine. (Equivalent to `npm install` if you'd
rather do it manually.)

```sh
npm run dev
```

Starts the Vite dev server (default: http://localhost:5173) with hot
reload.

## Scripts

- `npm run setup` — install dependencies and verify the project builds
  and tests pass (for a fresh clone / new machine)
- `npm run dev` — start the local dev server
- `npm run build` — type-check and build a production bundle to `dist/`
- `npm run preview` — serve the built `dist/` bundle locally
- `npm run deploy` — build for production, then serve that build with
  `preview` (no external hosting is configured yet — this just proves
  the production bundle works)
- `npm run test` — run the test suite once
- `npm run test:watch` — run the test suite in watch mode
- `npm run typecheck` — type-check without emitting/building

## Status

The roguelike round loop is playable end to end: a run starts with 3
lives at round 1, each round deals a fresh Klondike hand with a rising
score target and capped redeals/undos, and clearing or busting a hand
transitions to the next round (or ends the run at 0 lives). Power-up
drafting isn't built yet — round wins currently go straight to the next
round — see CLAUDE.md's "Next steps" for the build order.

## Features

- Project scaffolded with Vite + TypeScript (vanilla, no framework)
- Full Klondike hand: deal, draw/redeal stock, tableau ↔ foundation ↔
  tableau moves, win detection
- Click a card to select it, then click where it goes
- Named board areas: Deck, Waste, Foundations and Tableau each sit in a
  labelled box, so it's clear what each region is
- **Chips x mult scoring**: every move contributes chips, and mult grows
  with your combo streak, your jokers and your upgraded cards
- Undo button, capped at 3 per round (unlimited in freeplay)
- **Roguelike run**: lives, round number, rising score target, capped
  stock redeals (2/round) and undos (3/round), round-result screen
  between hands, game-over/"New Run" screen at 0 lives. Once the stock is
  spent and no redeals remain, clicking it calls the round
- **Money**: cleared rounds pay out — a base reward, $1 per unspent
  redeal and undo, a bonus for overshooting the target, and interest on
  what you've banked. Gold cards and money jokers pay during the hand
- **A shop between rounds**, selling three things that stack for the rest
  of the run:
  - **Jokers** (13) — passive modifiers that fire per scoring card, e.g.
    +4 mult on hearts, or x1.5 mult once your combo hits 3. Five slots
  - **Vouchers** (8) — extra undos/redeals, a score multiplier, peeking
    at the stock, combo protection, a spare life, and the two play assists
  - **Card upgrades** (6) — Bonus, Mult, Gold, Foil, Holographic and
    Polychrome, applied to a single card, a whole suit, or a whole rank.
    The deck always stays 52 cards; upgrades only decorate them
- Animations: cards slide when moved (any pile to any pile), a subtle
  glow pulse when a face-down card is revealed, and a win celebration
  (banner pop + foundation glow) on victory. Respects
  `prefers-reduced-motion`
- Drag-and-drop: pick up a card (or a whole tableau run) and drop it on
  a column or foundation. An illegal drop flies the card home; Escape
  cancels. Works with touch and pen as well as mouse
- Play assists (auto-move on click, and highlighting legal drop targets)
  start **off** — finding a card's destination yourself is the puzzle.
  Each is earned by drafting the matching power-up (Auto-Play, Sharp Eye)
- Test suite (Vitest) covering deck/card logic, move validation, round
  logic, scoring math, and board interaction
