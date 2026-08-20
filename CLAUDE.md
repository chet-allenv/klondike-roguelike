# Klondike Roguelike — Project Plan

A browser-based card game: classic Klondike solitaire reframed as a roguelike
run. Play a hand, hit a score target, draft a power-up, repeat — difficulty
escalates each round until you run out of lives.

Status: **the roguelike round loop is playable end to end** — a run
starts with 3 lives at round 1, each round deals a fresh hand with a
rising score target and capped redeals/undos, and winning/losing a hand
transitions to the next round or ends the run. Power-up drafting isn't
built yet — round wins go straight to the next round with no choice
offered (see step 6 below). This file is the source of truth for scope
and design so a future session (or Claude Code) can pick it up and start
building without re-deriving decisions.

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
- **Animations** are implemented via the **FLIP technique** (First-Last-
  Invert-Play), not DOM node reuse/diffing. `draw()` still does a full
  `root.innerHTML = ""` teardown/rebuild every render — that didn't
  change. What changed: before wiping, `captureCardRects()` snapshots
  every `[data-card-id]` element's `getBoundingClientRect()`; after the
  rebuild, `animateCardMoves()` finds each surviving card by that same
  `data-card-id`, and if its position moved, applies an inverse
  `transform` then releases it next frame so the browser animates the
  transform back to identity via the `.card`'s CSS `transition`. Because
  matching is purely by card id, this handles every move type (stock→
  waste, waste→tableau, tableau→tableau, →foundation, foundation→
  tableau) for free, with no per-move-type animation code. A reveal
  (face-down → face-up) is tracked separately via a `previousFaceUp`
  map and triggers a `.revealing` class (a brightness/glow pulse, not a
  true 3D flip — deliberately scoped down, see below). A win triggers
  `.celebrating` on the win banner (bounce-in) and each foundation pile
  (staggered glow pulse) — this is the "victory animation," scoped down
  from the aspirational cascading-cards-flying-across-the-screen
  description to something implementable without a physics/particle
  system. All of it respects `prefers-reduced-motion` (checked once at
  mount via `matchMedia`, plus a CSS `@media` fallback) and skips
  cleanly under jsdom (no layout ⇒ zero deltas ⇒ no-ops), so it didn't
  need any test infrastructure changes. **Not built**: true 3D card-flip
  rotation, a physics-based victory cascade, and stock-redeal-specific
  animation (a redeal swaps which card is "on top" of the pile, so nothing
  currently visually announces it — acceptable gap, not attempted).
  Drag-and-drop is still fully unbuilt — smart click / select-then-move
  remains the only interaction model; this was intentionally sequenced
  before drag-and-drop (see step 5 in Next Steps).
- **Undo and redeals are capped per round** (`roguelike.ts`): 3 undos
  and 2 redeals per round by default (`UNDOS_PER_ROUND`,
  `REDEALS_PER_ROUND`), both picked as reasonable starting points, not
  playtested numbers — tune in step 7. `mountGame` (in `render.ts`) still
  supports *uncapped* freeplay by omitting `redealsAllowed`/
  `undosAllowed` from its options (defaults to unlimited, via an
  `Infinity` allotment internally) — the roguelike run (`ui/app.ts`) is
  what actually passes the caps in. This is also what "Extra Undo" and
  "Extra Redeal" (see Power-ups below) will raise once `powerups.ts`
  exists — they add to `UNDOS_PER_ROUND`/`REDEALS_PER_ROUND` for the
  rest of the run.

## Core loop

1. Player starts a **run** with a fixed number of lives (proposed: 3).
2. Each **round** deals a fresh Klondike hand and shows a **score
   target** for that round.
3. Player plays the hand. Moves score points (see Scoring below).
4. A round ends the moment any of the following happens:
   - **Score reaches the target** — round is won immediately, without
     needing to finish out the hand (implemented: this is the primary
     way rounds end in practice, since it doesn't require a perfect
     clear)
   - All 4 foundations are complete (perfect clear — always also a win,
     since a full clear scores far past any early-round target)
   - The player has no legal moves left and has used all stock
     redeals (stuck) — final score is still checked against the target
     here, so a stuck hand with enough banked score still counts as a
     win
5. If the round is won: player picks 1 of 3 random power-ups (draft,
   not yet built — see step 6), next round begins with a higher target.
6. If the round is lost (stuck below target): player loses a life.
   0 lives ends the run.
7. Run summary screen: rounds cleared, total score, power-ups collected
   (not yet built).

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
  resource per round** — implemented as `REDEALS_PER_ROUND = 2` in
  `roguelike.ts`, which is the real cost

## Round difficulty escalation

- Score target increases each round — implemented in `roguelike.ts` as
  `targetForRound()`: `BASE_TARGET = 200`, `TARGET_GROWTH = 1.25` (+25%
  per round, rounded). Raised from an initial 100, which playtesting
  (well, one round of it) found trivially easy to hit — still not
  seriously tuned, revisit in step 7
- Stock redeals per round may decrease in later rounds — not implemented
  (`REDEALS_PER_ROUND` is currently flat across all rounds); a future
  tuning knob, not a v1 requirement
- Optional later addition: "modifier" rounds (e.g. one foundation
  suit locked, or tableau starts with fewer face-down cards) for
  variety — not in v1 scope

## Power-ups (draft pool, v1 target ~8)

Each round win offers a choice of 3, drawn randomly from the pool below.
Power-ups persist for the rest of the run (stack across rounds) unless
noted as consumable.

1. **Extra Undo** — +1 undo available per round, on top of the base
   `UNDOS_PER_ROUND = 3` (see the Undo note under "Decisions already
   made")
2. **Extra Redeal** — +1 stock redeal per round, on top of the base
   `REDEALS_PER_ROUND = 2`
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
    main.ts            # trivial bootstrap: mounts ui/app.ts into #app
    game/               # pure game logic, no DOM
      cards.ts           # Card model, deck construction/shuffle
      cards.test.ts
      klondike.ts         # tableau/foundation/stock state + move validation
      klondike.test.ts
      scoring.ts          # scoring + combo logic
      scoring.test.ts
      roguelike.ts         # run state: lives, round/target, redeal + undo budgets
      roguelike.test.ts
      powerups.ts           # power-up definitions + effects (not yet built)
    ui/                 # DOM rendering, click handlers, styling
      app.ts              # owns the top-level state machine: sequences
                            # rounds via mountGame, shows round-result /
                            # game-over screens between them
      app.test.ts
      render.ts            # renders + drives ONE hand (freeplay or a
                            # round, via MountOptions); also owns the
                            # FLIP-based move/reveal/victory animations
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
(`powerups.ts`) belong in `game/`.

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
   auto-move shortcut along the way
3. ~~Add `scoring.ts` and a visible score HUD~~ done
4. ~~Add `roguelike.ts` round loop (target, lives, win/loss transition)~~
   done — `ui/app.ts` now sequences rounds via `mountGame`'s `MountOptions`
   (`redealsAllowed`/`undosAllowed`/`target`/`roundInfo`/`onHandEnd`), with
   a round-result screen between rounds and a game-over/"New Run" screen
   when lives hit 0. Also decided the default undos-per-round (3, capped
   the same way as redeals) — both are flat per round for now (see the
   "Round difficulty escalation" note on redeals decreasing later)
5. **UX overhaul**, sequenced as animations first, drag-and-drop later
   (user's call when this was picked up):
   - ~~Animations~~ done — move/reveal/victory animations via the FLIP
     technique (see the Animations note under "Decisions already made"
     for how it works and what's deliberately out of scope: true 3D
     flip, a physics-based cascade, redeal animation)
   - Drag-and-drop — not started. Add mouse-drag interaction on top of
     the existing move-validation logic (`canPlaceOnTableau`,
     `canPlaceOnFoundation`, etc. in `klondike.ts` don't change), with
     click-to-move/smart-click staying as the fallback for anyone who
     doesn't drag
6. Add `powerups.ts` and the draft screen between rounds
7. Playtest and tune numbers
