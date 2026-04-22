# CLAUDE.md

Guidance for Claude Code when working in this repo. Read this first — it avoids re-scanning the codebase.

## What this repo is

A static, no-build collection of small browser games. The root is a game launcher; each game lives in its own subfolder.

```
/
├── index.html               # Home page (game grid + per-card leaderboards)
├── style.css                # Home styles (cards, grid, leaderboard pills)
├── README.md
├── highway-dash/            # Dodge traffic on a highway
├── whack-a-mole/            # Tap moles, skip bees
├── add-it-up/               # Arithmetic quiz
├── piano/                   # Piano memory (Simon-style) + free play
├── bus-route-rush/          # Grid bus dispatcher, color-matched pickups
├── clock-it/                # Set an analog clock to match a target time
├── color-mixing/            # Pick two paint pots to match a target color
├── critter-cruise/          # One-button hopper over rolling terrain
├── airport-luggage-game/    # Drag colored luggage onto matching planes
├── maze-game/               # Bunny through a procedurally generated maze
├── crane-truck/             # Pendulum crane: drop hook, match block to truck
├── tow-truck/               # Rescue broken cars, deliver to matching garage
├── butterfly-garden/        # Finger-trail butterfly sipping matching flowers
├── earth-day/               # Falling items sorted into recycling vs. trash
└── hard/                    # Sub-gateway for harder games (e.g. flappy-bird)
    └── flappy-bird/         # Tap-to-flap, dodge pipes
```

Most game folders contain exactly three files: `index.html`, `style.css`, `game.js`. No build step, no deps. Open `index.html` in a browser to run. `hard/` is a gateway page, not a game.

### Existing games at a glance

Use this table instead of re-scanning each folder.

| Slug | Theme | Core mechanic | Input | Render |
|---|---|---|---|---|
| highway-dash | Car race | Dodge traffic, grab coins | keys + lane buttons | canvas 2D |
| whack-a-mole | Garden | Tap moles, skip bees | tap | DOM + CSS |
| add-it-up | Math | Solve + / − problems | keypad | DOM |
| piano | Music | Simon memory + free play | tap | DOM |
| bus-route-rush | Transit | Grid pickup/drop-off, color match | keys/swipe | canvas 2D |
| clock-it | Time | Set analog clock to target | keypad | SVG + DOM |
| color-mixing | Art | Blend two pots to match target | tap | DOM + CSS |
| critter-cruise | Platformer | One-button jump over hills | tap/space | canvas 2D |
| airport-luggage-game | Airport | Drag luggage onto matching plane | drag | canvas 2D |
| maze-game | Bunny | Navigate procedural maze to carrot | keys/swipe | canvas 2D |
| crane-truck | Construction | Pendulum crane drop + color-match delivery | tap/space | canvas 2D |
| tow-truck | Rescue | 3-lane drive, hold-to-winch, color-match garage | lane + hold buttons | canvas 2D |
| butterfly-garden | Nature | Finger-trail butterfly, match-color flowers | pointer move | canvas + DOM emoji |
| earth-day | Environment | Falling-item sort into 2 bins (♻️ / 🗑️) | tap bin / swipe | DOM |
| hard/flappy-bird | Flappy | Tap to flap, dodge pipes | tap | canvas 2D |

Each `.game-card` on the home page carries a `data-lb="<slug>-leaderboard"` attribute; the home-page script reads it to render the card's top-3 entries inline.

## Shared conventions

- **Player name** is stored in `localStorage` under the shared key `highway-dash-last-name` (legacy name, kept for cross-game persistence).
- **Leaderboard** per game: localStorage key `"<slug>-leaderboard"`, value is an array of `{ name, score, at }`, sorted desc by `score`, capped at 20 entries.
- **Audio** uses `window.AudioContext` (or `webkitAudioContext`), created lazily via an `ensureAudio()` helper that also resumes a suspended context.
- **Mobile tags** in every game's `<head>`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  ```
- **Color theme**: dark radial background (`radial-gradient(circle at top, #1b2735 0%, #090a0f 100%)`), per-game accent color.
- **Home link** in every game: `<a class="home-link" href="../">← Games</a>`.
- **Prevent stray touch behavior** on the game surface with `touchstart/move/end` preventDefault listeners.

## Adding a new game

Follow this recipe — don't invent a new structure.

### 1. Create the folder

```
<slug>/
├── index.html
├── style.css
└── game.js
```

Use `whack-a-mole/` or `piano/` as the template (they share the cleanest structure).

### 2. `<slug>/index.html` skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <title><Game Name></title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="game-wrapper">
        <a class="home-link" href="../">← Games</a>
        <header>
            <h1><Game Name></h1>
            <div class="hud">
                <div class="stat" id="player-tag">👤 <span id="player-name">—</span></div>
                <div class="stat">Score: <span id="score">0</span></div>
                <div class="stat">Best: <span id="best">0</span></div>
            </div>
        </header>

        <div class="stage">
            <!-- game-specific UI -->

            <div id="overlay" class="overlay">
                <div class="panel">
                    <h2 id="overlay-title">Ready?</h2>
                    <p id="overlay-msg">How to play…</p>
                    <label class="name-row" for="name-input">
                        <span>Name</span>
                        <input id="name-input" type="text" maxlength="12" autocomplete="off"
                               spellcheck="false" placeholder="Player" />
                    </label>
                    <button id="start-btn">Start</button>
                </div>
            </div>
        </div>

        <footer><p>Short tip.</p></footer>
    </div>

    <script src="game.js"></script>
</body>
</html>
```

### 3. `<slug>/game.js` skeleton

```js
(() => {
    // DOM refs
    const overlay = document.getElementById("overlay");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");

    const NAME_KEY = "highway-dash-last-name"; // shared across games
    const LB_KEY = "<slug>-leaderboard";
    const LB_MAX = 20;

    function loadLeaderboard() {
        try {
            const raw = localStorage.getItem(LB_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }
    function saveLeaderboard() {
        try { localStorage.setItem(LB_KEY, JSON.stringify(state.leaderboard)); } catch (_) {}
    }
    function personalBest(name) {
        let best = 0;
        for (const e of state.leaderboard) if (e.name === name && e.score > best) best = e.score;
        return best;
    }
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
    }

    const state = { running: false, score: 0, playerName: "", leaderboard: loadLeaderboard() };

    // Prefill name
    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) { nameInput.value = saved; playerNameEl.textContent = saved; }
    bestEl.textContent = personalBest(saved);

    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    // Audio (lazy)
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        // reset state, hide overlay, etc.
        overlay.classList.add("hidden");
        state.running = true;
    }

    function endGame() {
        state.running = false;
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);
        // show game-over overlay
        overlay.classList.remove("hidden");
    }

    startBtn.addEventListener("click", startGame);
})();
```

### 4. Register on the home page

**`index.html`** — add a card inside `.game-grid`:

```html
<a class="game-card <slug>" href="<slug>/" data-lb="<slug>-leaderboard">
    <div class="emoji" aria-hidden="true">🎮</div>
    <div class="title"><Game Name></div>
    <div class="desc">One-line hook.</div>
    <div class="badge">Play</div>
    <div class="card-leaderboard"></div>
</a>
```

The `data-lb` must match the game's `LB_KEY`. The home page auto-renders the top 3 entries.

**`style.css`** — add a card gradient:

```css
.game-card.<slug> {
    background: linear-gradient(135deg, rgba(R, G, B, 0.22), rgba(R2, G2, B2, 0.18));
    border-color: rgba(R, G, B, 0.4);
}
```

### 5. Optional: mode toggles

If the game has multiple modes (see `add-it-up` and `piano`), use pill-style toggles:

```html
<div class="mode-toggle" role="group" aria-label="Pick mode">
    <button type="button" class="toggle-btn selected" data-mode="a">A</button>
    <button type="button" class="toggle-btn" data-mode="b">B</button>
</div>
```

Wire them up in JS to call a `setMode(mode)` function that safely stops any in-progress game (set `running=false`, clear visual state, hide/show overlay as needed).

## Workflow (Claude)

1. **Develop on the assigned branch** (e.g. `claude/add-<feature>-<id>`). The harness enforces this — don't push elsewhere.
2. **Commit** with clear messages, ending with the Claude Code session footer.
3. **Rebase** onto the latest base branch before pushing:
   ```
   git fetch origin <base-branch>
   git rebase origin/<base-branch>
   ```
   (Base branch is this repo's default — check with `git remote show origin | grep "HEAD branch"`.)
4. **Push** with `-u origin <branch>` (force-with-lease only if the rebase rewrote history).
5. **Create a PR** via the GitHub MCP tools (`mcp__github__create_pull_request`). Never use `gh` — it's not available.
6. **Always reply with the PR URL** so the user can jump to it.

For follow-up commits on the same branch: push, and the existing PR updates automatically — no new PR needed. Still rebase first if the base has moved.
