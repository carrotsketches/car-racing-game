# Airport Luggage — World Map Edition

## Context

The user (building mini-games for kids) wants a new game where the player:
- loads colored 🧳 luggage from a conveyor belt onto an airplane,
- flies the plane to a city on a world map,
- hands bags to waiting passengers whose color matches the bag.

On top of the original 3-city sketch ("Redburg / Bluebay / Greendale"), the explicit new goal is:

> "I want more cities in the world map, the kids can pick. the goal is to let them learn the world."

So the game doubles as light geography exposure: the playfield is a recognizable world map with real cities, named and labeled, each paired with a distinctive color and landmark emoji. Gameplay stays identical to the user's pre-written spec; the twist is the map and the expanded city roster.

This slots into the existing mini-games repo (`/home/user/car-racing-game/`), follows the conventions in `CLAUDE.md`, and matches the implementation style of `bus-route-rush/` (canvas-based, 60-second round, tap input, single overlay for start + game-over + leaderboard).

## City roster (6 cities across 6 continents)

Fixed color per city — all passengers at that city wear that color, and only matching-color bags count as a successful delivery. Colors are the 6 primary "kid palette" shades so they're easy to tell apart on the belt.

| City          | Continent     | Landmark emoji | Color  | Hex       |
|---------------|---------------|----------------|--------|-----------|
| New York      | North America | 🗽             | red    | `#ef4444` |
| Rio           | South America | 🏖️             | green  | `#22c55e` |
| Paris         | Europe        | 🗼             | blue   | `#3b82f6` |
| Cairo         | Africa        | 🐪             | yellow | `#eab308` |
| Tokyo         | Asia          | 🏯             | purple | `#a855f7` |
| Sydney        | Oceania       | 🦘             | orange | `#f97316` |

Each city pin shows its emoji + name label. On delivery, a small floating `+10 Paris, France!` style text appears so kids see city names repeatedly.

## Files to create

```
airport-luggage-game/
├── index.html
├── style.css
└── game.js
```

Plus edits to:

- `/home/user/car-racing-game/index.html` — add a `.game-card.airport-luggage-game` entry inside `.game-grid` (matches existing card shape: emoji/title/desc/badge, **no** `data-lb` — existing cards don't use it despite what `CLAUDE.md` suggests).
- `/home/user/car-racing-game/style.css` — add one gradient block mirroring `.game-card.bus-route-rush` (ocean-blue → runway-orange accent).

## Canvas layout (360 × 540)

```
 y=0   ┌────────────────────────────────────┐
       │                                    │
       │      WORLD MAP + SKY (y=0..380)    │
       │   ocean bg, continent blobs,       │
       │   6 city pins w/ name+emoji,       │
       │   plane flies in this region,      │
       │   HQ marker at (180, 190)          │
       │                                    │
 y=380 ├────────────────────────────────────┤
       │   CONVEYOR BELT (y=380..470)       │
       │   bags scroll right→left           │
 y=470 ├────────────────────────────────────┤
       │   GROUND STRIP (y=470..540)        │
       │   decorative runway + cargo count  │
 y=540 └────────────────────────────────────┘
```

- World map drawn with `ctx` — dark navy ocean + simple continent polygons in muted green. Cities rendered as colored pins (14 px radius) with landmark emoji above pin and `"Paris"` label below. Waiting passengers appear as small colored figures clustered around the pin (up to 4).
- Home base (HQ) is a neutral grey airport icon at centre-ocean. Plane sits here when idle.
- Plane drawn as ✈️ emoji, canvas-rotated to face its target. Cargo shown as up to 6 coloured dots below the plane. Cargo display also mirrored as a small row in the ground strip so it's readable when the plane is offscreen.

## Plane state machine

Per the user spec:

```
idle ──tap city──▶ takeoff ──▶ flying ──▶ delivering ──▶ returning ──▶ idle
```

- `idle`: plane parked at HQ. Taps on city pins accepted.
- `takeoff`: 250 ms scale/fade-in pop above HQ.
- `flying`: linear interp from HQ → city over ~900 ms.
- `delivering`: 800 ms at city. Resolve matches now: for every bag whose colour == city colour AND the city still has a waiting passenger of that colour, remove the bag, remove the person, award points. Non-matching bags stay in cargo.
- `returning`: linear interp city → HQ over ~900 ms.
- Transitions back to `idle`.

**Luggage loading stays available in every state** — taps on belt bags always work (as long as cargo < 6). City taps are ignored when state ≠ `idle`.

## Gameplay rules

- **Round length**: 60 s. Timer in HUD; `.low` class when ≤ 10 s (mirrors `bus-route-rush/style.css`).
- **Belt**: bags spawn off the right edge at a color chosen uniformly from the 6 city colors. Belt speed starts 50 px/s and scales to ~110 px/s by t = 60 s. Bag auto-despawns if it falls off the left edge (missed).
- **Spawn interval**: starts at 1.5 s, decays linearly to 0.7 s over 60 s.
- **People spawn**: every 2.0 s → 1.0 s (same ramp), pick a random city whose waiting queue is < 4, add one passenger of that city's colour.
- **Cargo max**: 6 bags; UI ignores further bag taps until cargo drops.
- **Scoring per delivery trip**: if `n` matched bags delivered:
  - `n == 0`: +0
  - `n >= 1`: `10 * n + 5 * (n - 1)` → 10 / 25 / 40 / 55 / 70 / 85
- **End**: timer hits 0 → `endGame()` → save leaderboard entry `{ name, score, at: Date.now() }` to localStorage key `airport-luggage-leaderboard`, show final overlay with top 10 and highlight current entry.

## Key modules inside `game.js`

Structured to match `bus-route-rush/game.js`:

1. DOM refs, `NAME_KEY = "highway-dash-last-name"`, `LB_KEY = "airport-luggage-leaderboard"`, `LB_MAX = 20`.
2. `loadLeaderboard()`, `saveLeaderboard()`, `personalBest(name)`, `sanitizeName(raw)` — identical to bus-route-rush.
3. `ensureAudio()` — lazy `AudioContext`. Add three simple tones: `playLoad()` (tap bag), `playDeliver()` (ding on each match), `playFail()` (thud on 0-match arrival), `playTick()` (final-5-seconds beep).
4. `CITIES` const array (6 cities incl. `{id, name, country, color, emoji, x, y}`) and `HOME` point.
5. `state` object: `{ running, score, timeLeft, elapsed, playerName, leaderboard, plane, bags, waiting, spawnTimers, floaters }`.
6. `spawnBag()`, `spawnPerson()`, `update(dt)`:
   - advance belt bags (despawn off-left)
   - advance plane via switch on `state.plane.state`
   - advance floating `+N City` texts (800 ms life, fade out)
   - spawn timers with tier ramp
   - tick timer → `endGame()` at 0
7. `render()`:
   - draw ocean, continents, city pins (with passenger cluster), HQ
   - draw plane (rotated) + cargo dots
   - draw conveyor belt (striped pattern moving) + bags (rounded rects with handle)
   - draw ground strip + cargo mirror
   - draw floaters
8. `handlePointer(e)` — translate via `canvas.getBoundingClientRect()` + scaling. Hit-test bags first (they're higher priority and time-sensitive), then city pins if plane idle, else HQ (no-op).
9. `startGame()`, `endGame()` — matches bus-route-rush pattern: overlay text swap, `Drive Again` → `Fly Again`, show rank.
10. Main loop: `performance.now()` dt, `requestAnimationFrame`.

## Audio

Minimal: `ensureAudio()` + short sine-wave blips — same style as other games. Don't overthink.

## Home-page registration

Inside `.game-grid` in `/home/user/car-racing-game/index.html`, add the new card at the end:

```html
<a class="game-card airport-luggage-game" href="airport-luggage-game/">
    <div class="emoji" aria-hidden="true">✈️</div>
    <div class="title">Airport Luggage</div>
    <div class="desc">Load bags, fly the world, match colors to people!</div>
    <div class="badge">New</div>
</a>
```

And in `/home/user/car-racing-game/style.css`, add a gradient block after `.game-card.critter-cruise`:

```css
.game-card.airport-luggage-game {
    background: linear-gradient(135deg, rgba(78, 192, 255, 0.22), rgba(255, 159, 64, 0.2));
    border-color: rgba(78, 192, 255, 0.4);
}
```

## Files to modify — summary

| Path                                                 | Change                          |
|------------------------------------------------------|---------------------------------|
| `/home/user/car-racing-game/airport-luggage-game/index.html` | create — overlay skeleton per CLAUDE.md + `<canvas id="stage" width="360" height="540">` |
| `/home/user/car-racing-game/airport-luggage-game/style.css`  | create — body radial bg, stage sizing, HUD, overlay, leaderboard list styling |
| `/home/user/car-racing-game/airport-luggage-game/game.js`    | create — ~500 LOC game implementing the above |
| `/home/user/car-racing-game/index.html`              | add `.game-card.airport-luggage-game` inside `.game-grid` |
| `/home/user/car-racing-game/style.css`               | add `.game-card.airport-luggage-game` gradient |

## Reused patterns (no re-invention)

- `loadLeaderboard` / `saveLeaderboard` / `personalBest` / `sanitizeName`: copy from `/home/user/car-racing-game/bus-route-rush/game.js:46-57` and nearby.
- Timer + `low` class: `/home/user/car-racing-game/bus-route-rush/game.js:629-694` and `style.css:76-81`.
- Pointer handling + `preventDefault` touch guards: `/home/user/car-racing-game/critter-cruise/game.js:259-261`.
- Overlay HTML skeleton: `/home/user/car-racing-game/bus-route-rush/index.html:28-44`.
- `startGame` / `endGame` overlay-swap + rank message: `/home/user/car-racing-game/bus-route-rush/game.js:724-757`.
- Home card + gradient style: `/home/user/car-racing-game/index.html:17-79`, `/home/user/car-racing-game/style.css:99-147`.

## Verification

1. Open `/home/user/car-racing-game/airport-luggage-game/index.html` directly in a browser.
2. Smoke-play:
   - Enter a name and tap Start.
   - Tap bags on the belt → they animate to the plane, cargo dots update.
   - Wait for a passenger to appear at a city, tap that city → plane takes off, flies, delivers, returns.
   - Confirm score increments and combo math (`10n + 5(n-1)`) by loading 3 matching bags and delivering in one trip → expect +40.
   - Confirm city taps do nothing while plane is flying.
   - Confirm cargo cap at 6 (extra bag taps ignored).
   - Let timer expire → end-game overlay appears, leaderboard entry saved, top-10 list shown with current run highlighted.
3. Check DevTools localStorage has `airport-luggage-leaderboard` with the entry and `highway-dash-last-name` with the chosen name.
4. Go back to `/home/user/car-racing-game/index.html` — new card appears, clicking it loads the game.
5. Mobile check: narrow DevTools to ~400 px wide, confirm canvas still fits and taps register correctly on belt bags + city pins.
6. Commit to `claude/airport-luggage-game-7DyAz`, push, **do not** open a PR unless the user asks.

## Open uncertainties worth flagging

- **Country name reinforcement**: plan shows "Paris, France!" as a float — if the kids should also see the country name in the HUD/overlay while *choosing* a city, I can add a small label under each pin. Default: country only shown on the delivery floater so the pin stays uncluttered.
- **City roster size**: 6 was chosen to fit clearly in 360 px. Going to 8+ cities would start to crowd the map; if the user wants more, I'd recommend increasing canvas width to 420 px instead of cramming.
