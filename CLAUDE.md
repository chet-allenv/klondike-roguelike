# Klondike Roguelike — Project Plan

A browser-based card game: classic Klondike solitaire reframed as a roguelike
run. Play a hand, hit a score target, draft a power-up, repeat — difficulty
escalates each round until you run out of lives.

Status: **the roguelike round loop is playable end to end** — a run
starts with 3 lives at round 1, each round deals a fresh hand with a
rising score target and capped redeals/undos, and winning/losing a hand
transitions to the next round or ends the run. The UX overhaul (step 5)
is complete: animations and drag-and-drop are both in. Power-up drafting
isn't built yet — round wins go straight to the next round with no choice
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
- Interaction model: **click-to-select, click-to-move**, plus
  drag-and-drop (below). Both are always available; the player picks.
- **Play assists are opt-in, and off by default** (`Assists` in
  `render.ts`, passed via `MountOptions.assists`). Two things that used to
  be baseline behavior are now gated behind this:
  - `smartClick` — clicking a card sends it straight to its destination
    when exactly one is legal (its foundation, or a single valid tableau
    column), instead of just selecting it.
  - `dropHints` — while dragging, every legal drop zone is outlined
    (`.drop-legal`) and the one under the pointer highlights
    (`.drop-active`).

  Both were built as baseline, then turned off: showing the player where
  a card can go does the scanning work that *is* the puzzle, and made
  hands too easy to clear. The code stays fully wired rather than being
  deleted because these are meant to become **power-ups** (see the pool
  below) — earning "the game finds the move for you" as a drafted
  ability is the interesting version of it. Nothing enables them today,
  so a run plays without either; tests opt in explicitly via the
  `SMART_CLICK` / `DROP_HINTS` constants in `render.test.ts`. Note that
  with `smartClick` off, playing a card takes two clicks (select, then
  destination) or one drag — the loss of pace is deliberate.
- **Drag-and-drop** is built (`render.ts`), layered on top of click-to-move
  rather than replacing it — both routes end in the same `attemptMoveTo`
  and the same validators in `klondike.ts`, which didn't change. Mechanics:
  Pointer Events (so mouse/touch/pen all work), a 5px threshold
  (`DRAG_THRESHOLD_PX`) below which a press is still just a click, and
  `setPointerCapture` (guarded — jsdom doesn't implement it) so releasing
  outside the window can't leave a card stuck to the cursor. On crossing
  the threshold the real card elements — the whole run, for a tableau
  drag — are lifted out of the board into a fixed-position `.drag-layer`
  that follows the pointer with a single `transform`; the layer lives
  *inside* `content` so the FLIP snapshot in `draw()` sees the cards where
  they were dropped, which is what makes them fly home on an illegal drop
  and fly into place on a legal one, with no extra animation code.
  Drop zones are declared in the markup as `data-drop="tableau:3"` /
  `data-drop="foundation:hearts"`, and their rects are snapshotted once at
  drag start and hit-tested manually rather than via
  `document.elementFromPoint` (unimplemented in jsdom, and it would need
  `pointer-events: none` juggling in the browser). Every legal zone gets
  `.drop-legal`, the one under the cursor `.drop-active`. Escape or
  `pointercancel` aborts. **The four foundations act as one target**: aim
  at any of them and `resolveDropTarget` rewrites the target to the card's
  own suit, matching what clicking a foundation already did. (This was
  briefly the opposite — a drop named a *specific* pile, so a heart
  dropped on clubs failed; that was reversed as too fiddly.) `canDropOn`
  stays strict on purpose — it answers "can the card land *here*" — so
  the rerouting lives entirely in `resolveDropTarget`, which also means
  `.drop-active` marks the pile the card will actually land on rather
  than the one the pointer is over, and only one foundation ever lights
  up as legal. Tableau columns are addressed literally; only foundations
  reroute. Note the drop is still hit-tested by **pointer position**, not
  by where the dragged card overlaps — deliberate, but the likelier thing
  to revisit if aiming feels off. Every drag ends in a
  `draw()`, so the DOM resyncs from state either way; the synthetic click
  the browser fires after a real drag is swallowed via `swallowNextClick`
  so it can't run smart-click on top of the move just made.
  **Not verified in a real browser** — the two bugs in the animation work
  below were both found by hand-playtesting, and this code has only been
  exercised under jsdom (with a stubbed `getBoundingClientRect`, since
  jsdom does no layout). Treat feel/geometry as unconfirmed.
- **Animations** are implemented via the **FLIP technique** (First-Last-
  Invert-Play), not DOM node reuse/diffing. `draw()` still does a full
  teardown/rebuild every render — that didn't change (it wipes a
  `content` div now rather than `root` itself directly, purely so mount
  setup has a stable node to attach `content` to once; nothing more).
  What changed: before wiping, `captureCardRects()` snapshots
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
  Animations were deliberately sequenced before drag-and-drop (see step 5
  in Next Steps), and the FLIP layer is what drag-and-drop's snap-back /
  snap-into-place reuses.
  - Two issues found via real-browser playtesting (not caught by jsdom
    tests, which don't do real layout). (1) The moving card had no
    elevated `z-index` during flight, so depending on move direction it
    could render *underneath* other cards/piles it passed near — fixed
    by giving the animating card `z-index: 1000` for the flight and
    restoring its resting z-index after (tableau cards also now get an
    explicit `z-index: cardIndex` for deterministic cascade stacking,
    rather than relying on DOM-order painting). (2) Waste/foundation
    piles only ever rendered their single top card, so covering one
    instantly dropped the old card from the DOM — first "fixed" with a
    fade-out exit animation, but the user didn't like that (correctly:
    a fade implies the card left, when it's just been covered) and
    asked for it to visibly land on top instead. Actual fix: `.pile`
    now renders up to *two* cards — the previous top one underneath
    (still genuinely there, just covered) plus the new top one — instead
    of ever swapping/removing the covered card. `.pile` and `.pile .card`
    became `position: relative` / `position: absolute; top:0; left:0`
    (mirroring `.column .card`) so the two cards genuinely overlap. No
    exit animation needed at all: the covered card was already fully
    hidden behind the top card even before this change (same size, same
    position), so keeping it rendered has zero visual cost at rest — the
    only thing it changes is that a new arrival now visibly lands on top
    of *something* mid-flight instead of the slot looking momentarily
    empty underneath it.
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
9. **Auto-Play** — enables the `smartClick` assist for the rest of the
   run: clicking a card with exactly one legal home sends it there in
   one click. Already implemented behind `MountOptions.assists`, so this
   one is just a matter of wiring the draft to flip the flag
10. **Sharp Eye** — enables the `dropHints` assist for the rest of the
    run: legal drop zones light up while you drag. Same deal — the
    behavior exists, it just needs to be granted

This list is a starting point, not final — expect to add/cut during
implementation once playtesting shows what's fun vs. broken. 9 and 10
are a different flavor from the rest: they hand back convenience that
was deliberately taken away from the base game (see the assists note
under "Decisions already made") rather than changing the rules.

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
   - ~~Drag-and-drop~~ done — pointer-event dragging on top of the
     existing move-validation logic (`canPlaceOnTableau`,
     `canPlaceOnFoundation`, etc. in `klondike.ts` didn't change), with
     click-to-move/smart-click still working unchanged for anyone who
     doesn't drag. See the Drag-and-drop note under "Decisions already
     made" — including that it hasn't been playtested in a real browser
     yet, only under jsdom
6. Add `powerups.ts` and the draft screen between rounds
7. Playtest and tune numbers
