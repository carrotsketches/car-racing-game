# Butterfly Garden — plan

## Theme & audience

A calm pastel meadow with a pastel butterfly that trails the player's
finger. Target ages 4-6: soothing, open-ended, no fail state, pure visual.
Great fine-motor practice on a tablet. No reading required.

## Mechanic (one paragraph)

The butterfly trails the player's finger / mouse with a gentle spring lerp
(`pos += (target - pos) * k`, small k) so movement feels floaty. Flowers of
3-4 colors bloom scattered around the meadow; the butterfly's wings glow
one of those colors. Drifting the butterfly over a matching-color flower
sips nectar (+1, soft chime, sparkle burst); the butterfly's wings then
shift to a new hue and matching flowers glow with a subtle pulse. Drifting
raindrops occasionally cross the meadow — brushing one makes the butterfly
stutter for ~0.7s (no score lost, no game-over). 60-second relaxed round.

## Controls

- Pointermove / touchmove anywhere on the stage
- No buttons during play, no keyboard input
- Cursor hidden on desktop during play so the butterfly *is* the cursor

## Rendering

Canvas 2D (~400×600) for the butterfly + particles; DOM emoji for flowers
so they scale crisply.

- Butterfly: two oscillating wing ellipses (flap via `sin(t * flapRate)`),
  small rounded-rectangle body, two tiny antenna arcs.
- Wing color = current target color; subtle gradient so wings aren't flat.
- Flowers: large emoji 🌸 🌼 🌺 🌻 positioned absolutely on the stage;
  matching-color flowers get a CSS `box-shadow` pulse so kids know where
  to go.
- Sparkles on nectar sip: 8-12 outward-flying small circles with fading
  alpha (reuse the sparkle pattern from `maze-game/game.js`).
- Raindrops: small blue teardrops drifting diagonally; collision = circle
  overlap with butterfly center.

## Game flow

1. Start overlay: "Follow the flowers 🌸 with your finger!" + name input.
2. On start: butterfly spawns in center, wings pick a starting color,
   matching flowers begin pulsing.
3. Each pointermove: update `target = {x, y}`. Update loop lerps `pos`
   toward `target` and draws the butterfly.
4. Collision test butterfly center vs. each flower: if within radius AND
   flower color matches wings → sip (score +1, sparkles, soft chime, flower
   briefly fades + regrows elsewhere, wings shift to a new color).
5. Raindrops spawn every 3-5s, drift across; collision → butterfly jitter
   animation for ~0.7s (no score change).
6. Timer = 60s → end overlay with nectar count; leaderboard updated.

## Data model

```js
state = {
  running: false,
  score: 0,                       // nectar sipped
  playerName: "",
  leaderboard: [...],
  timeLeft: 60,
  pointer: { x: W/2, y: H/2 },    // last pointer position (target)
  butterfly: { x: W/2, y: H/2, color: "pink", flap: 0, stutterUntil: 0 },
  flowers: [{ el, x, y, color }],  // DOM refs + positions
  raindrops: [{ x, y, vx, vy }],
  sparkles: [{ x, y, vx, vy, life }]
}
```

## Reused helpers

- `airport-luggage-game/game.js` — pointermove + touchmove event handlers,
  and mapping pointer coordinates to canvas coords.
- `maze-game/game.js` — sparkle particle pattern (position + velocity +
  life, fading alpha).
- `whack-a-mole/game.js` — overlay start/end flow, leaderboard,
  `sanitizeName`, shared name key `highway-dash-last-name`.
- Shared `tone()` + `ensureAudio()` — very soft sine chime on sip; no
  harsh tones (keep the mood calm).

## New helpers required

- `lerp(a, b, k)` — one-liner.
- `pickFlowerColor(avoid)` — choose next wing color, different from the
  one just sipped, weighted toward colors currently on the field.
- `respectReducedMotion()` — check
  `window.matchMedia("(prefers-reduced-motion: reduce)")` and skip wing
  flap + raindrops if set.

## Files to create

- `butterfly-garden/index.html` — CLAUDE.md skeleton; stage contains
  `<div class="meadow">` (holds flower emoji divs) and a `<canvas>` on top.
- `butterfly-garden/style.css` — butterfly-pink accent `#ec4899`, soft
  sky-to-grass gradient background overriding the dark theme for this one
  game (explicitly pastel to match the mood).
- `butterfly-garden/game.js` — IIFE with state above + rAF loop.

## Home-page registration

- Add card in `/index.html`:
  `<a class="game-card butterfly-garden" href="butterfly-garden/" data-lb="butterfly-garden-leaderboard">`
  emoji 🦋, title "Butterfly Garden", desc "Follow the flowers!".
- Add gradient in `/style.css`:
  `.game-card.butterfly-garden { background: linear-gradient(135deg, rgba(236,72,153,0.22), rgba(168,85,247,0.18)); border-color: rgba(236,72,153,0.4); }`

## Verification checklist

1. Start overlay appears; name prefilled.
2. On start, butterfly appears centered and wings pulse the starting color.
3. Butterfly smoothly trails pointer / finger with a gentle lag.
4. Touching a matching-color flower: score +1, sparkle burst, soft chime,
   butterfly wing color changes.
5. Touching a non-matching flower: no change.
6. Raindrops occasionally appear; brushing one causes brief stutter, no
   score change.
7. Timer ends round at 60s; overlay shows final nectar count.
8. `prefers-reduced-motion: reduce` suppresses flap + raindrops.
9. Leaderboard persists across reload.
10. Works on mobile (touchmove tracked, no scroll during play).
