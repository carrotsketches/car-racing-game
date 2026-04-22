# Crane Truck — plan

## Theme & audience

Bright construction-site theme with a yellow tower crane swinging over a
yard. Target ages 4-6: one-button timing, visual color matching, no reading,
no fail state (round ends by clock, not by losing lives).

## Mechanic (one paragraph)

A crane arm swings left-right like a pendulum over a yard of colored blocks
on the ground. The player **taps** (or presses space / clicks) to drop the
hook. If the hook lands on a block, the block is lifted and the arm carries
it back through the swing; the player taps again to release over a
matching-color truck bed below. Correct delivery = +1 and a happy chime,
plus a confetti burst on 3-in-a-row streaks. Miss the block or wrong truck
= soft "oops" tone, no penalty. 60-second round.

## Controls

- Tap / click / touch anywhere on the stage
- Keyboard `Space` or `Enter`
- No directional input; the pendulum does the positioning for you

## Rendering

Canvas 2D (single ~400×600 canvas, like `highway-dash/`).

- Crane base = rounded rect + treads at bottom-left
- Tower = vertical rect
- Arm = rotates about a pivot at the tower top, angle `= MAX * sin(t * ω)`
  with `ω` ramping slightly each round for a gentle difficulty curve
- Rope = straight line from arm tip down to hook
- Hook = small trapezoid at end of rope; y = arm tip + ropeLen (ropeLen
  animates when dropping/raising)
- Blocks = 4-6 colored rounded squares lined up across the ground
- Two colored trucks = simple rectangular body + `conic-gradient`-style
  wheels (or two dark circles)

## Game flow

1. Start overlay: name input + "Tap to drop, match the color!" hint.
2. On start: hide overlay, spawn blocks, arm starts swinging, timer = 60s.
3. Each tap:
   - If idle → drop hook; if hook meets a block's x-range, attach block,
     raise hook.
   - If carrying → release block; if truck below matches block color, score;
     otherwise block falls back to ground (or into wrong truck with a shake).
4. New block respawns in the gap after each successful pickup so the yard
   never empties.
5. Timer hits 0 → end overlay with final score; leaderboard updated;
   replay button resets state.

## Data model

```js
state = {
  running: false,
  score: 0,
  streak: 0,
  playerName: "",
  leaderboard: [...],
  timeLeft: 60,
  arm: { angle: 0, omega: 1.2, maxAngle: 0.9 },
  rope: { len: 60, targetLen: 60, dropping: false, raising: false },
  carrying: null,            // block ref or null
  blocks: [{ x, color }],    // on ground
  trucks: [{ x, color }],    // 2 trucks at fixed positions
  particles: []              // confetti on streak
}
```

## Reused helpers

- `whack-a-mole/game.js` — overlay start/end flow, `sanitizeName`,
  `loadLeaderboard / saveLeaderboard / personalBest` pattern.
- `highway-dash/game.js` (~lines 569-576) — confetti particle loop; copy
  `particles.push({x, y, vx, vy, life, color})` and its update + draw block.
- `critter-cruise/game.js` — requestAnimationFrame loop pattern with a
  `dt`-based update step; reuse the timer decrement.
- Shared `tone()` + `ensureAudio()` — pickup chime (short high note), drop
  chime (two-note down-up on correct, single low note on wrong).

## New helpers required

- `hookBoxAtX(x)` — returns nearest block within a pickup width, or null.
- `truckUnderX(x)` — returns the truck whose bed contains `x`, or null.
- `dropHook() / raiseHook()` — animates `rope.len` toward `targetLen`.

## Files to create

- `crane-truck/index.html` — follow CLAUDE.md skeleton; add a `#stage`
  with a single `<canvas id="game" width="400" height="600">`.
- `crane-truck/style.css` — construction-yellow accent `#f5a524`;
  dark radial background from CLAUDE.md conventions.
- `crane-truck/game.js` — IIFE with the state above + rAF loop.

## Home-page registration

- Add card in `/index.html` inside `.game-grid`:
  `<a class="game-card crane-truck" href="crane-truck/" data-lb="crane-truck-leaderboard">` …
  emoji 🏗️, title "Crane Truck", desc "Swing, drop, deliver!".
- Add gradient to `/style.css`:
  `.game-card.crane-truck { background: linear-gradient(135deg, rgba(245,165,36,0.22), rgba(234,88,12,0.18)); border-color: rgba(245,165,36,0.4); }`

## Verification checklist

1. Start overlay appears; name prefilled from `highway-dash-last-name`.
2. On start, pendulum swings smoothly and is visually centered.
3. Tap drops the hook; hook catches a block it passes over.
4. Second tap drops the block; matching-truck delivery scores +1 with chime.
5. Wrong-color drop plays soft tone and resets the block.
6. Streak of 3 triggers confetti burst.
7. 60-second timer counts down visibly; end overlay shows score and best.
8. Leaderboard persists after a page reload.
9. Works on mobile viewport (no pinch zoom, no scroll during play).
10. Home-page card shows correct gradient and top-3 leaderboard entries.
