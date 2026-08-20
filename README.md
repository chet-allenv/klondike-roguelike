# Klondike Roguelike

A browser-based card game: classic Klondike solitaire reframed as a
roguelike run. Play a hand, hit a score target, draft a power-up, repeat —
difficulty escalates each round until you run out of lives.

See [CLAUDE.md](./CLAUDE.md) for full design and scope notes.

## Setup

Requires [Node.js](https://nodejs.org/) 20+ and npm.

```sh
npm install
npm run dev
```

This starts the Vite dev server (default: http://localhost:5173) with
hot reload.

## Scripts

- `npm run dev` — start the local dev server
- `npm run build` — type-check and build a production bundle to `dist/`
- `npm run preview` — serve the built `dist/` bundle locally

## Status

Early scaffolding — the project structure is set up but gameplay isn't
implemented yet. See CLAUDE.md's "Next steps" for the build order.

## Features

- Project scaffolded with Vite + TypeScript (vanilla, no framework)
