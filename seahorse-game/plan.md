# Seahorse Splash — design plan

A small pointer-controlled arcade game. Slug: `seahorse-game`.

## Pitch
Glide a seahorse through the ocean with your finger. Touch rising bubbles
to pop them for points; avoid the drifting jellyfish.

## Controls
- Pointer / touch: seahorse spring-lerps toward the cursor (`k = 0.14`).
- The seahorse IS the cursor while playing — `cursor: none` on stage.

## Round structure
- 60 seconds OR 3 hearts — whichever runs out first ends the round.
- Score persists to leaderboard `seahorse-game-leaderboard` (top 20).
- Personal best surfaces in HUD; player name shared via the standard
  `highway-dash-last-name` localStorage key.

## Bubbles (canvas particles)
Rise from below the visible area at randomized x, drifting up with a
gentle horizontal wobble. Three sizes:

| Size   | Radius | Speed | Points | Spawn weight |
|--------|--------|-------|--------|--------------|
| small  | 8      | fast  | 5      | 0.45         |
| medium | 14     | mid   | 3      | 0.35         |
| large  | 22     | slow  | 1      | 0.20         |

A bubble that exits the top is gone (no penalty). Touching one with the
seahorse pops it — small sparkle + soft chime.

Spawn cadence: every ~450 ms, with mild jitter. Cap on-screen bubbles
at 14 to keep the field readable.

## Jellyfish (hazards)
Drift horizontally across the stage in waves with gentle vertical
sinusoidal bob. Two appear at a time once score >= 10; before that, one.
Touching a jellyfish costs a heart and gives the seahorse a 1.2 s
invulnerability flash so you don't lose all hearts in a single brush.

Jellyfish drawing: pinkish translucent bell + 4 wavy tentacles drawn as
quadratic curves; stinger glow.

## Seahorse (canvas drawing)
Drawn from primitives — no asset files. Body is a curved spine of stacked
ellipses (head bulge, snout, belly, coiled tail). Crest fins as small
triangles along the back. Soft golden colour with darker outline; eye
dot; a single dorsal fin that flutters via `sin(t * 12)`.
Faces left or right based on which side of the pointer it is on.

## Audio
Lazy `AudioContext` like other games. `tone(freq, dur, type, gain)`
helper. `popChime()` plays a quick rising arpeggio for a bubble pop;
`hurtBuzz()` plays a short low square wave for a jellyfish hit.

## Files
- `seahorse-game/index.html` — wrapper, HUD, overlay, help modal.
- `seahorse-game/style.css` — dark ocean theme, sun shafts, sandy floor.
- `seahorse-game/game.js` — single IIFE with state, loop, draw, input.
- Home page: card with `data-lb="seahorse-game-leaderboard"` and a
  teal/coral gradient.
