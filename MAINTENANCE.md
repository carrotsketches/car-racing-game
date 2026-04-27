# MAINTENANCE.md — keeping this repo healthy with limited AI assistance

Audience: a human reviewer using GitHub Copilot (or any small-context AI) to make
**incremental edits** to this repo. The goal of this guide is to make those edits
safe by encoding the project's invariants into tests Copilot can run on every
change.

The big-picture project guide is [`CLAUDE.md`](./CLAUDE.md). Read that first if
you've never touched the repo. **This file is the operating manual.**

---

## TL;DR for the impatient

```bash
npm test                  # run the full suite (fast, no deps)
```

If `npm test` is green, your edit is structurally sound. If it's red, **don't
push** — the failing test names tell you what contract you broke.

There are **no runtime npm dependencies**. Tests use the Node 20+ built-in test
runner (`node:test`). `node_modules/` is empty by design.

---

## What is — and isn't — covered by tests

| Layer                                | Tested? | How                                                                 |
|---|---|---|
| Pure helpers in `shared/lib.js`      | ✅      | Unit tests in `tests/lib/` (happy / edge / error)                    |
| File skeleton of every game folder   | ✅      | Static checks in `tests/conventions/html-skeleton.test.js`           |
| Leaderboard key drift                | ✅      | `tests/conventions/leaderboard-keys.test.js`                         |
| Home page card ↔ game wiring         | ✅      | Same file                                                            |
| Audio init pattern                   | ✅      | `tests/conventions/audio.test.js`                                    |
| **Visual / playable correctness**    | ❌      | You must open `index.html` in a browser and play it.                 |
| **Per-game scoring rules**           | ❌      | See gap list at the bottom of `TRACEABILITY.md`.                     |

The full feature ↔ test mapping lives in [`TRACEABILITY.md`](./TRACEABILITY.md).

---

## The Copilot loop (autonomous fix-until-green)

Use this loop in any agentic Copilot/Cursor mode. **Copy-paste this into the
prompt.**

> Run `npm test`. If anything fails, read the failing test name, open the file
> the test points at, and fix the source — not the test — until `npm test`
> reports `pass <total>` and `fail 0`. Re-run after every edit. Stop only when
> all tests pass. Do not change tests in `tests/conventions/` — those encode
> repo-wide invariants. Do not add new npm dependencies.

The exact command is:

```bash
npm test
```

Pass criteria, taken from the spec reporter:

```
ℹ tests <N>
ℹ pass  <N>
ℹ fail  0
```

If you're scripting it: `npm test --silent` exits non-zero on failure.

### When Copilot wants to change a test

If a `tests/conventions/*` test is failing, the **convention itself** changed —
not just one game. Examples:
- Renaming `NAME_KEY` (would log every player out of every game).
- Removing the help button from the skeleton.
- Decapping the leaderboard.

These are repo-wide decisions. **Reject** the AI's suggestion to "just update
the test"; either revert the change or update the convention deliberately
(which means updating CLAUDE.md, every game, and the test in one PR).

If a `tests/lib/*` test is failing, look at it carefully — it might be the test
that's wrong (this guide was written after exactly that happened during setup).

---

## Adding a new game (Copilot-safe recipe)

1. Follow the file skeleton in `CLAUDE.md` § "Adding a new game".
2. Register the game in **two** places:
   - `index.html` — add the `<a class="game-card …>` card.
   - `tests/conventions/games-list.js` — add a `{ slug, lbKey, hasLeaderboard }` row.
3. Run `npm test`. The convention suite will tell you exactly what's missing
   (mobile meta, help button, IIFE wrap, audio init, etc.).
4. Open the game in a browser. Tests don't catch gameplay regressions.

---

## Editing existing games

Most edits to a single `<slug>/game.js` won't break any test — the game logic
isn't unit-tested. **That's the risk Copilot edits introduce.** Mitigations:

1. **Prefer the shared lib.** If your edit touches name handling, leaderboard
   ops, or play counts, route it through `shared/lib.js`. That code IS tested.
   To make a game use the lib in the browser:
   ```html
   <script src="../shared/lib.js"></script>
   <script src="game.js"></script>
   ```
   then in `game.js`: `const { sanitizeName, insertScore, personalBest } = window.GameLib;`
2. **Don't rename `LB_KEY`.** It will silently orphan every saved leaderboard.
   The convention test pins each game's key.
3. **Don't drop the IIFE wrapper.** Globals from one game can collide with
   another (the home page loads them via `<a>`, not at the same time, but stats
   and beta pages share scope).
4. **After every edit:** `npm test` and then load the game in a browser.

---

## Pull request checklist

Before merging an AI-assisted PR, confirm:

- [ ] `npm test` is green.
- [ ] You opened the affected game in a browser and played it.
- [ ] No new files in `node_modules/`, no new entries in `package.json` deps.
- [ ] If a `tests/conventions/*` test was modified, the change is in CLAUDE.md too.
- [ ] If a new game was added, it's in `tests/conventions/games-list.js`.
- [ ] If a new shared helper was added, it has tests in `tests/lib/`.

---

## Test architecture in 60 seconds

```
tests/
├── lib/                       # Unit tests: pure functions in shared/lib.js
│   ├── sanitize-name.test.js
│   ├── leaderboard.test.js
│   ├── make-problem.test.js
│   └── play-tracker.test.js
├── conventions/               # Repo-wide static checks (one assertion × N games)
│   ├── games-list.js          # ← Source of truth: which folders are games
│   ├── html-skeleton.test.js  # Mobile meta, nav-row, help modal, IIFE wrap
│   ├── leaderboard-keys.test.js
│   └── audio.test.js
└── helpers/
    ├── memory-storage.js      # localStorage stub
    └── seeded-rng.js          # Deterministic RNG for math-gen tests
```

Why no jsdom / mocha / jest? Because:
1. The repo is "no build, no deps" by design (see CLAUDE.md).
2. Node 20+ ships a perfectly good test runner.
3. Static checks catch ~90% of the regressions Copilot introduces, without
   needing to simulate a DOM.

---

## Common Copilot failure modes (and the test that catches each)

| AI mistake                                              | Test that fails                            |
|---|---|
| Adds a game folder but forgets the home-page card       | `home page: every non-hidden game card links to its slug` |
| Renames `LB_KEY` → all old scores orphaned              | `<slug>: declares LB_KEY = "<expected>"` |
| Drops mobile meta tags from a game's `<head>`           | `<slug>: index.html declares mobile meta tags` |
| Removes the help button from the skeleton               | `<slug>: nav-row contains home link + help button` |
| Forgets `slice(0, LB_MAX)` — leaderboard grows forever  | `<slug>: caps leaderboard via LB_MAX` |
| Uses a different name key — player name doesn't persist | `<slug>: shares NAME_KEY = "highway-dash-last-name"` |
| Drops IIFE wrapper — globals leak                       | `<slug>: game.js is wrapped in an IIFE` |
| Inlines AudioContext eagerly — broken on iOS Safari     | `<slug>: uses lazy ensureAudio()` |
| Adds a `data-lb="…"` to a home card with a typo         | `home page: cards with data-lb point to a real LB_KEY` |
| Forgets `personalBest` returns 0 for missing player     | `personalBest: returns 0 for unknown player` |
| Persists `NaN` / wrong types in leaderboard JSON        | `loadLeaderboard: filters out invalid entries` |
| Caches `localStorage.getItem` without try/catch         | `loadLeaderboard: returns [] when storage throws` |

---

## Extending coverage when you have time

The "Known gaps" section in `TRACEABILITY.md` lists what's not yet tested. Top
two recommendations:

1. **Add jsdom-based DOM smoke tests.** One test per game: load the HTML, fire
   the start button, assert no console errors. Catches a huge class of
   regressions a static test can't.
2. **Migrate `sanitizeName` / `loadLeaderboard` / `personalBest` calls in each
   `game.js` to use `window.GameLib.*`.** Then the unit tests in `tests/lib/`
   transitively cover every game.
