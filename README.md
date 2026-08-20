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

Core Klondike is playable and scored: a single hand deals and plays via
click-to-select/click-to-move plus a smart-click auto-move shortcut, with
a live score HUD and unlimited undo. The roguelike layer (lives, rounds,
score *target*, power-ups) isn't built yet — see CLAUDE.md's "Next steps"
for the build order.

## Features

- Project scaffolded with Vite + TypeScript (vanilla, no framework)
- Playable single-hand Klondike: deal, draw/redeal stock, tableau ↔
  foundation ↔ tableau moves, win detection, New Game
- Smart click: clicking a card auto-moves it when it has exactly one
  legal destination; falls back to select-then-click when ambiguous
- Scoring HUD (foundation plays, reveals, waste moves, combo streak,
  foundation-to-tableau penalty) per CLAUDE.md's scoring rules
- Undo button (currently unlimited — see CLAUDE.md's Undo note for how
  this is meant to become a roguelike resource)
- Test suite (Vitest) covering deck/card logic, move validation,
  scoring math, and board interaction
