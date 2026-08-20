# Klondike Roguelike — Project Plan

A browser-based card game: classic Klondike solitaire reframed as a roguelike
run. Play a hand, hit a score target, draft a power-up, repeat — difficulty
escalates each round until you run out of lives.

Status: **playable single hand, with scoring** — a full hand of Klondike
deals and plays, scores per CLAUDE.md's rules, and supports undo. The
roguelike layer (lives, rounds, power-ups) isn't built yet. This file is
the source of truth for scope and design so a future session (or Claude
Code) can pick it up and start building without re-deriving decisions.

## Git workflow

- **Do not create commits.** Stage changes (`git add`) and leave them
  staged for the user to review and commit themselves.
- **Never push to the remote.** Pushing is entirely the user's call.

## Documentation workflow

- Keep [README.md](./README.md)'s "Features" section up to date as
  gameplay features land (e.g. "playable single-hand Klondike", "scoring
  HUD", "roguelike round loop", "power-up drafting"). CLAUDE.md is the
  design/scope doc for contributors picking up the project; README.md is
  what a user or new machine needs to set up and see what currently
  works.

## Decisions already made

- Base game: **Klondike** (draw pile, 7 tableau columns, 4 foundations,
  build down in alternating colors).
- Platform: **local project on disk**, not a hosted artifact — this is
  meant to be a real codebase the user keeps and extends.
- Stack: Vite + TypeScript, vanilla DOM (no framework). The game state is
  small enough that React/etc. would be overhead, not help.
- Interaction model: **click-to-select, click-to-move**, plus a **smart
  click** shortcut layered on top — clicking a card sends it straight to
  its destination when there's exactly one legal home (its foundation,
  or a single valid tableau column); if the destination is ambiguous or
  there isn't one, it falls back to select-then-click-destination so the
  player keeps full control over genuinely ambiguous moves. Full
  drag-and-drop is still a possible later addition as a pure UX layer on
  top of the same move-validation logic, but isn't built.
- **Animations** (card flips, move transitions, drag feedback, and
  **victory animations** — e.g. the classic cascading-cards celebration
  when all 4 foundations complete) belong in that same UX layer —
  presentation-only, no game-logic changes needed, since `render.ts`
  already derives everything from `GameState` and `isWon()` already
  detects the win. Not built yet, and not a drop-in addition: `draw()`
  currently does a full `root.innerHTML = ""` teardown/rebuild on every
  move, so there's no DOM continuity between old and new card positions
  for a transition to animate between. Adding real animations means
  reworking `render()` to diff/reuse DOM nodes (e.g. keyed by card `id`)
  instead of wiping and rebuilding, then layering CSS transitions on top
  — worth its own pass, not a quick add-on alongside other work. (A
  simple entrance animation on the existing win banner itself wouldn't
  need this rework, since it's a one-off overlay rather than a
  transition between two card layouts — but a true cascade would.)
- **Undo** is unlimited in the base game (no per-round resource limit
  yet) — click Undo to step back one move at a time, score included.
  This is deliberately a base-game convenience, not a final balance
  decision: the roguelike layer already plans an "Extra Undo" power-up
  (see Power-ups below), which implies undos should become a **limited
  per-round resource** once `roguelike.ts` exists, with a base allotment
  smaller than "unlimited." Revisit the default undo count per round
  when building step 4.

## Core loop

1. Player starts a **run** with a fixed number of lives (proposed: 3).
2. Each **round** deals a fresh Klondike hand and shows a **score
   target** for that round.
3. Player plays the hand. Moves score points (see Scoring below).
4. A round ends when either:
   - All 4 foundations are complete (perfect clear — big bonus), or
   - The player has no legal moves left and has used all stock
     redeals (stuck).
5. If final score >= target: round is won, player picks 1 of 3 random
   power-ups (draft), next round begins with a higher target.
6. If final score < target: player loses a life. 0 lives ends the run.
7. Run summary screen: rounds cleared, total score, power-ups collected.

No early "bank score and quit" option in v1 — keeps the state machine
simple. Could be a later addition.

## Scoring (starting values, tune by playtesting)

- Card played to foundation: **+10** (before multipliers)
- Tableau card flipped face-up (reveal): **+5**
- Waste → tableau move: **+5**
- Foundation → tableau move (undoing progress): **-15** (discourages
  using foundations as scratch space)
- Consecutive foundation plays (combo): each play in a streak adds
  +2 on top of base, streak resets on any non-foundation move
- Stock redeal: no direct penalty; instead redeals are a **limited
  resource per round** (proposed: 2), which is the real cost

## Round difficulty escalation

- Score target increases each round (e.g. +25% per round, tune later)
- Stock redeals per round may decrease in later rounds
- Optional later addition: "modifier" rounds (e.g. one foundation
  suit locked, or tableau starts with fewer face-down cards) for
  variety — not in v1 scope

## Power-ups (draft pool, v1 target ~8)

Each round win offers a choice of 3, drawn randomly from the pool below.
Power-ups persist for the rest of the run (stack across rounds) unless
noted as consumable.

1. **Extra Undo** — +1 undo available per round (the base game currently
   has *unlimited* undo with no per-round cap — see the Undo note under
   "Decisions already made"; this power-up only becomes meaningful once
   `roguelike.ts` caps the base allotment)
2. **Extra Redeal** — +1 stock redeal per round
3. **Peek Stock** — reveal the next 3 cards in the stock pile
4. **Wild Card** (consumable) — one card usable as any rank/suit,
   consumed on use
5. **Score Multiplier** — permanent x1.1 to all scoring (stacks
   multiplicatively across picks)
6. **Combo Keeper** — combo streak no longer resets on a single
   non-foundation move (one "grace" move per streak)
7. **Thin Deck** — permanently remove one random rank's worth of
   cards (4 cards) from the deck for the rest of the run, shortening
   future hands
8. **Second Chance** — the first round loss in a run doesn't cost a
   life (one-time, consumed when triggered)

This list is a starting point, not final — expect to add/cut during
implementation once playtesting shows what's fun vs. broken.

## File structure

```
klondike-roguelike/
  index.html
  src/
    main.ts            # bootstraps the app, owns top-level state machine
    game/               # pure game logic, no DOM
      cards.ts           # Card model, deck construction/shuffle
      cards.test.ts
      klondike.ts         # tableau/foundation/stock state + move validation
      klondike.test.ts
      scoring.ts          # scoring + combo logic
      scoring.test.ts
      roguelike.ts         # run state: lives, round number, target, draft pool (not yet built)
      powerups.ts           # power-up definitions + effects (not yet built)
    ui/                 # DOM rendering, click handlers, styling
      render.ts
      render.test.ts
      style.css
  scripts/
    setup.mjs           # `npm run setup` — installs deps, verifies build/tests
  package.json
  tsconfig.json
  vitest.config.ts
```

Tests are colocated with the file they cover (`foo.ts` + `foo.test.ts`)
rather than mirrored into a separate tree — keep new tests next to the
module they test. `game/` holds framework-free logic (no DOM access);
`ui/` holds everything that touches `document`. New logic modules
(`scoring.ts`, `roguelike.ts`, `powerups.ts`) belong in `game/`.

## Open questions for next session

- Exact escalation curve for score targets and redeal counts (needs
  playtesting, can't be decided on paper)
- Whether power-ups should have rarity tiers (common/rare) once the
  pool grows past ~8
- Whether to add a "shop" (spend accumulated score on power-ups)
  instead of a free draft — free draft is simpler for v1
- Visual style: plain CSS card faces vs. an existing card SVG set

## Next steps when building resumes

1. ~~Scaffold with `npm create vite@latest solitaire-roguelike -- --template vanilla-ts`~~ done
2. ~~Implement `cards.ts` + `klondike.ts` first, with the click-to-move
   UI, and get a fully playable single hand of standard Klondike
   working (no roguelike layer yet)~~ done — also picked up a smart-click
   auto-move shortcut and an unlimited base-game Undo along the way
3. ~~Add `scoring.ts` and a visible score HUD~~ done (score only for
   now — the round *target* half of the HUD needs `roguelike.ts`, step 4)
4. Add `roguelike.ts` round loop (target, lives, win/loss transition).
   Decide the default undos-per-round here (see the Undo note above)
5. Add `powerups.ts` and the draft screen between rounds
6. Playtest and tune numbers
