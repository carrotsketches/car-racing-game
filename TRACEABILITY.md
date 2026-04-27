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

## 4. Known gaps (no automated test yet)

These are fair game for Copilot to add tests for, in priority order:

1. **Per-game DOM smoke tests** — load each `game.js` in `jsdom` with mocked
   canvas + audio, fire `start-btn` click, assert no exception. Would need adding
   `jsdom` as a dev dep.
2. **Help modal toggle behaviour** — `#help-btn` opens, `#help-close` closes.
   Requires DOM-level test (jsdom).
3. **`shared/play-tracker.js` IIFE itself** — currently only the pure `recordPlay`
   logic is tested; the IIFE that reads `document.currentScript.dataset.slug` is
   not. Low value (3 lines of glue), but possible.
4. **Per-game scoring rules** (e.g. whack-a-mole +1 per mole / -1 per bee) —
   would require either extracting score logic into `shared/lib.js` or
   re-implementing in tests as oracles.
5. **`getCarFor` (highway-dash)** — deterministic per-name car colour pick. Not
   tested.
6. **Game-specific generators** — pattern-party pattern gen, maze-game maze
   gen, color-mixing palette pick. Pure logic, easy to extract & test next.
7. **`stats/` page** — reads `games-plays-v1`. Untested.
8. **CSS regressions** — out of scope for unit tests; rely on visual review.

## 5. How to extend this matrix

When you add a feature:
1. Add the test (happy path + at least one edge case + at least one error path).
2. Add a row to the relevant section above.
3. Run `npm test` — must be green before you commit.
