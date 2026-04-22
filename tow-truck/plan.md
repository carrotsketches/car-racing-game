# Tow Truck — plan

## Theme & audience

Cheerful roadside-rescue theme: bright red tow truck drives along a country
road, stops to rescue broken-down cars, delivers them to color-matched
garages. Target ages 4-6: a clear sequential story (find → rescue → deliver)
that kids intuitively follow without reading.

## Mechanic (one paragraph)

A side-scrolling road auto-scrolls to the right. Broken-down cars appear
up ahead in one of three colors. The player steers the tow truck between
three lanes (via on-screen ← / → buttons, or keyboard arrows) to pull
alongside a broken car, then **presses and holds** the winch button to reel
the car onto the flatbed (a small meter fills while held; release too early
and it pops off). Further down the road, three color-coded garages appear;
the player tows the car to the matching-color garage and taps the drop-off
button. Correct garage = score + happy tone; wrong garage = car slides off,
no score, no penalty. 60-second round; speed ramps slightly.

## Controls

- On-screen lane buttons `◀` and `▶` (same layout as `highway-dash/`)
- On-screen winch button `⛓` — **tap-and-hold** to reel, tap again to drop
- Keyboard `←` / `→` / `Space` for desktop
- Winch has a visible fill meter so the kid knows how long to hold

## Rendering

Canvas 2D, ~400×600.

- Horizontal parallax: far hills (slow), near trees/bushes (medium), road
  stripes (fast). Reuse the parallax approach from `critter-cruise/game.js`.
- Tow truck sprite = red body, cab, flatbed rectangle, two spinning wheels
  (rotate by camera speed). Hook and short chain extend behind the flatbed.
- Broken cars = rounded rectangle bodies in 3 colors, with a little "💨"
  smoke puff emoji above to cue that they're broken.
- Garages = three colored doorways along the roadside; matching color band
  above the door.
- Chain animation: when reeling, draw a dashed line between hook and car;
  car slides toward flatbed as meter fills.

## Game flow

1. Start overlay: "Rescue the broken cars! Hold ⛓ to winch, drive to the
   matching garage." + name input.
2. On start: camera begins auto-scrolling, truck centered in middle lane.
3. Broken car spawns in a random lane up ahead. Player switches lanes to
   meet it.
4. When adjacent (same lane, overlapping x range), winch button activates.
   Hold to fill meter; meter full = car is on flatbed.
5. Garage row appears after pickup. Player lines up with matching color and
   taps winch to drop. Correct = +1 + chime + confetti. Wrong = car slides
   off, soft tone.
6. Timer = 60s; ends game. Overlay shows final score.

## Data model

```js
state = {
  running: false,
  score: 0,
  playerName: "",
  leaderboard: [...],
  timeLeft: 60,
  cameraX: 0,
  truck: { lane: 1, x: 80 },           // 3 lanes
  carried: null,                        // {color} or null
  winchProgress: 0,                     // 0..1 while holding
  winching: false,
  entities: [                           // cars & garages along the road
    { type: "car", x, lane, color, rescued: false },
    { type: "garage", x, lane, color }
  ],
  speed: 120                            // px / s, ramps slightly
}
```

## Reused helpers

- `highway-dash/game.js` — lane-button HTML + CSS, lane math, touch
  controls, rAF loop.
- `critter-cruise/game.js` — parallax scrolling layers.
- `whack-a-mole/game.js` — overlay start/end flow, leaderboard pattern,
  `sanitizeName`, shared name key `highway-dash-last-name`.
- Shared `tone()` + `ensureAudio()` — winch tick (rapid short notes while
  reeling), delivery chime, wrong-drop thunk.

## New helpers required

- `pointerDownOn(button) / pointerUpOn(button)` — wrap pointerdown and
  pointerup on the winch button to track hold duration cross-platform.
- `isAdjacent(truck, entity)` — lane match + x within `ADJ_RANGE`.
- `drawChain(ctx, from, to, taut)` — dashed line with slight sag when taut.

## Files to create

- `tow-truck/index.html` — CLAUDE.md skeleton; stage contains the canvas,
  three lane buttons, and a winch button with a fill bar inside.
- `tow-truck/style.css` — rescue-red accent `#ef4444`; lane buttons reuse
  highway-dash proportions.
- `tow-truck/game.js` — IIFE with state above + rAF loop.

## Home-page registration

- Add card in `/index.html`:
  `<a class="game-card tow-truck" href="tow-truck/" data-lb="tow-truck-leaderboard">`
  emoji 🚛, title "Tow Truck", desc "Rescue the broken cars!".
- Add gradient in `/style.css`:
  `.game-card.tow-truck { background: linear-gradient(135deg, rgba(239,68,68,0.22), rgba(185,28,28,0.18)); border-color: rgba(239,68,68,0.4); }`

## Verification checklist

1. Start overlay appears; name prefilled.
2. Road scrolls smoothly, wheels rotate, parallax looks right.
3. Lane buttons (and arrow keys) switch truck between 3 lanes.
4. Broken car spawns; truck can pull alongside.
5. Holding winch fills meter; when full, car attaches to flatbed.
6. Garage row appears; matching color drop-off scores +1 with confetti.
7. Wrong garage plays soft tone and resets the car.
8. Timer runs; end overlay shows score and updates personal best.
9. Leaderboard persists across reload.
10. Works on mobile (no pinch zoom, no scroll, lane buttons sized for small
    fingers).
