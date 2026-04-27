# Traceability matrix — features × tests

This matrix maps each feature/contract in the codebase to the test that protects it.
**Empty cells are gaps** — if you (or Copilot) add a feature in that row, write the
matching test before you ship.

Run everything with: `npm test`

Test files referenced here all live under `tests/`.

---

## 1. Shared logic (`shared/lib.js`)

| Feature / contract                                | Happy path | Edge cases | Error handling | Test file |
|---|---|---|---|---|
| `sanitizeName` — trim, cap to 12, default "Player" | ✅ | ✅ (whitespace-only, null, undefined, non-string) | ✅ (coerces, never returns empty) | `tests/lib/sanitize-name.test.js` |
| `clampName` — preserves empty for live UI         | ✅ | ✅ | — | `tests/lib/sanitize-name.test.js` |
| `NAME_KEY` shared across games                    | ✅ (constant value pinned) | — | — | `tests/lib/sanitize-name.test.js` |
| `loadLeaderboard` — read + parse                  | ✅ | ✅ (missing key, non-array JSON, invalid entries filtered) | ✅ (malformed JSON, throwing storage) | `tests/lib/leaderboard.test.js` |
| `saveLeaderboard` — write JSON                    | ✅ | — | ✅ (returns false when storage throws) | `tests/lib/leaderboard.test.js` |
| `insertScore` — sort desc, cap to LB_MAX          | ✅ | ✅ (custom cap, missing `at`, preserves `at`, no mutation) | ✅ (rejects invalid entries) | `tests/lib/leaderboard.test.js` |
| `personalBest` — max score per player             | ✅ | ✅ (empty list, unknown player, case-sensitive) | — | `tests/lib/leaderboard.test.js` |
| `rankOf` — find inserted entry                    | ✅ | ✅ (returns -1 when not found) | — | `tests/lib/leaderboard.test.js` |
| `isValidEntry` — schema check                     | ✅ | ✅ (NaN, Infinity, wrong types, missing fields, null) | — | `tests/lib/leaderboard.test.js` |
| `makeProblem` (add-it-up math gen) — easy add     | ✅ (sum ≤ 10, both ≥ 1) | ✅ (carry boundary at sum=10) | ✅ (rejects bad op/level) | `tests/lib/make-problem.test.js` |
| `makeProblem` — easy sub                          | ✅ (result ≥ 1) | ✅ (a > b enforced) | ✅ | `tests/lib/make-problem.test.js` |
| `makeProblem` — medium add                        | ✅ (sum ≤ 20) | ✅ (1000 iterations) | ✅ | `tests/lib/make-problem.test.js` |
| `makeProblem` — medium sub                        | ✅ (no negatives) | ✅ (borrow case forced when r ∈ [0.2, 0.65]) | ✅ | `tests/lib/make-problem.test.js` |
| `makeProblem` — digit decomposition               | ✅ | — | — | `tests/lib/make-problem.test.js` |
| `makeProblem` — `hasCarry` / `hasBorrow` flags    | ✅ | ✅ (matches arithmetic) | — | `tests/lib/make-problem.test.js` |
| `makeProblem` — deterministic with seed           | ✅ | — | — | `tests/lib/make-problem.test.js` |
| `recordPlay` — bump game + player counts          | ✅ | ✅ (empty/whitespace name → "Anonymous") | ✅ (rejects missing slug, tolerates malformed store) | `tests/lib/play-tracker.test.js` |
| `PLAY_TRACKER_KEY` constant                       | ✅ | — | — | `tests/lib/play-tracker.test.js` |

---

## 2. Per-game contracts (every folder in `tests/conventions/games-list.js`)

These tests run **once for every game**. Add a new game to `games-list.js` and the
whole suite below auto-applies.

| Contract                                             | Test file |
|---|---|
| Has `index.html`, `style.css`, `game.js`             | `tests/conventions/html-skeleton.test.js` |
| Mobile meta tags (viewport, mobile / apple-web-app)  | `tests/conventions/html-skeleton.test.js` |
| `.nav-row` with `.home-link` + `#help-btn`           | `tests/conventions/html-skeleton.test.js` |
| `#help-modal` element present                        | `tests/conventions/html-skeleton.test.js` |
| Loads `game.js` via relative `<script>`              | `tests/conventions/html-skeleton.test.js` |
| `game.js` is wrapped in an IIFE (no globals)         | `tests/conventions/html-skeleton.test.js` |
| Declares the canonical `LB_KEY` for its slug         | `tests/conventions/leaderboard-keys.test.js` |
| Uses shared `NAME_KEY` = "highway-dash-last-name"    | `tests/conventions/leaderboard-keys.test.js` |
| Caps leaderboard via `slice(0, LB_MAX)`              | `tests/conventions/leaderboard-keys.test.js` |
| Uses lazy `AudioContext` / `ensureAudio()`           | `tests/conventions/audio.test.js` |

## 3. Home page contracts

| Contract                                                            | Test file |
|---|---|
| Every non-hidden game has a card linking to its slug                | `tests/conventions/leaderboard-keys.test.js` |
| Hidden games (e.g. `hotair-balloon`) are NOT linked                 | `tests/conventions/leaderboard-keys.test.js` |
| Every `data-lb` on a card matches a real `LB_KEY` declared by some game.js | `tests/conventions/leaderboard-keys.test.js` |

---

## 4. Known gaps

1. ~~Per-game DOM smoke tests~~ ✅ **Closed.** `tests/smoke/dom-smoke-tests.test.js`
   loads each game in jsdom with mocked canvas + AudioContext, fires `#start-btn`
   click (skipped for `clock-it`, which has no overlay), and asserts no
   `console.error` and no `jsdomError` calls.
2. ~~Help modal toggle behaviour~~ ✅ **Closed.** `tests/smoke/help-modal.test.js`
   covers open / close / Escape / backdrop dismiss for every game. Caught two
   real game bugs in the process (hotair-balloon and excavator-game were
   missing Escape + backdrop handlers).
3. ~~`shared/play-tracker.js` IIFE~~ ✅ **Closed.**
   `tests/lib/play-tracker-iife.test.js` exercises the full
   `<script src=… data-slug=…>` flow: bootstrap from missing/malformed store,
   accumulate plays across loads, default to "Anonymous" when no name.
4. ~~Per-game scoring rules~~ 🟡 **Partially closed (add-it-up).**
   `tests/lib/score-attempt.test.js` covers the canonical first-try / retry
   rule via the new `GameLib.scoreForAttempt`. Add-it-up's game.js was
   refactored to call it. Other games' scoring (whack-a-mole +1/-1, time
   bonuses, etc.) remain untested — extract into `shared/lib.js` as the
   pattern recurs.
5. ~~`getCarFor` (highway-dash)~~ ✅ **Closed.** Extracted as
   `GameLib.pickConfigFor` and `GameLib.setConfigFor` in `shared/lib.js`,
   tested in `tests/lib/pick-config.test.js`. Highway-dash's game.js now
   delegates to it.
6. ~~Game-specific generator helpers~~ 🟡 **Partially closed.**
   `pick`, `pickN`, `shuffle`, `findRecipe` extracted to `shared/lib.js` and
   tested in `tests/lib/utilities.test.js` (deterministic with seeded RNG).
   The full pattern-party / maze-game generators remain in their game.js
   files — they're tightly coupled to per-game pools and are now exercised
   through the smoke test (which actually runs the JS).
7. ~~`stats/` page~~ ✅ **Closed.** `tests/smoke/stats-page.test.js` covers
   empty state, malformed JSON, sort order, unknown-slug fallback, and
   HTML-escaping of player names (XSS).
8. **CSS regressions** — explicitly out of scope for unit tests; rely on
   visual review and the per-game smoke test which would surface DOM-related
   script errors.

### Remaining work (deferred)

- Migrate the rest of the games (`whack-a-mole`, `piano`, etc.) to use
  `GameLib.sanitizeName` / `loadLeaderboard` / `personalBest` so the unit
  tests in `tests/lib/` transitively cover their leaderboard code.
- Extract per-game scoring rules into `GameLib` and test them
  (gap #4 follow-up).
- Add `pretendToBeVisual` rAF cleanup verification (smoke tests rely on
  `dom.window.close()` which is wired up but not asserted).

## 5. How to extend this matrix

When you add a feature:
1. Add the test (happy path + at least one edge case + at least one error path).
2. Add a row to the relevant section above.
3. Run `npm test` — must be green before you commit.
