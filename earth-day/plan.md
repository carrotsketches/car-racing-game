# Earth Day — plan

## Theme & audience

Earth Day recycling game. Today (April 22) is Earth Day, giving this a
timely release hook. Target ages 4-6: a binary sort (recycling vs. trash)
that matches real-world curb bins kids see at home and at school.
Categorization is a pre-literacy skill.

## Mechanic (one paragraph)

Items drift down from the top of the screen — recyclables like 📰
newspaper, 🥤 cup, 🍾 bottle, 🗞️ magazine, 📦 cardboard box, 🥫 can —
and trash like 🍌 banana peel, 🍎 apple core, 🧻 used tissue, 🦴 bone,
🍕 pizza slice, 👟 old shoe. Two bins sit at the bottom: **blue =
recycling**, **gray = trash**. The player either **taps the correct bin**
while an item is falling, or **swipes the item** toward a bin. Correct
sort → +1 + happy chime + leaf-confetti burst. Wrong bin → sad tone, item
returns briefly to the queue so the player can try again (no penalty, no
game-over). 60-second round; fall speed ramps gently over time. Easy mode
spawns one item at a time; Medium allows up to two on screen.

## Controls

- Tap either bin (moves the **lowest** active item into that bin)
- Or swipe/drag an item toward a bin (pointermove from item to bin target)
- Keyboard `←` (trash) / `→` (recycling) for desktop, for accessibility
- A small Easy / Medium toggle (pill style) on the start overlay

## Rendering

DOM-only. Simpler than canvas here, and emoji scales crisply on mobile.

- `<div class="stage">` with `position: relative`.
- Falling items: absolutely-positioned `<div class="item">` with emoji;
  `transform: translate3d(x, y, 0)` updated per frame via rAF.
- Bins: flexbox row at bottom; each is a large rounded rect with a wide
  tap target, a color accent, and a label icon (♻️ / 🗑️) rather than
  words (keeps the game pre-literacy).
- Confetti: tiny 🍃 leaf emojis spawned via DOM nodes that animate with
  `transform: translate + rotate`, fading out; reused pattern from
  `color-mixing/game.js` floaters (check that file for the exact idiom).

## Game flow

1. Start overlay: "Sort into recycling or trash!" + name + Easy/Medium
   toggle.
2. On start: hide overlay, spawn first item at random x near the top.
3. Each frame: advance each item's y by `speed * dt`.
4. On tap/swipe to a bin: remove item from stage; if item's `category`
   matches bin → +1 + chime + leaf confetti; else soft thunk + item is
   pushed back to top with a small cooldown.
5. If an item reaches the bottom without being sorted → it's auto-sorted
   into whichever bin it's closest to (still scored normally; ensures the
   stage never clogs).
6. Spawn speed ramps slightly every 10s; Medium allows 2 concurrent items.
7. Timer = 60s → end overlay with score.

## Data model

```js
state = {
  running: false,
  score: 0,
  playerName: "",
  leaderboard: [...],
  timeLeft: 60,
  difficulty: "easy",              // "easy" | "medium"
  items: [                         // active falling items
    { el, x, y, vy, emoji, category }  // category = "recycle" | "trash"
  ],
  spawnCooldown: 0,
  ramp: 1                          // multiplier on vy
}

const CATALOG = [
  { emoji: "📰", category: "recycle" },
  { emoji: "🥤", category: "recycle" },
  { emoji: "🍾", category: "recycle" },
  { emoji: "🗞️", category: "recycle" },
  { emoji: "📦", category: "recycle" },
  { emoji: "🥫", category: "recycle" },
  { emoji: "🍌", category: "trash" },
  { emoji: "🍎", category: "trash" },
  { emoji: "🧻", category: "trash" },
  { emoji: "🦴", category: "trash" },
  { emoji: "🍕", category: "trash" },
  { emoji: "👟", category: "trash" }
]
```

## Reused helpers

- `whack-a-mole/game.js` — overlay flow, leaderboard, `sanitizeName`,
  shared name key `highway-dash-last-name`.
- `add-it-up/game.js` — `.mode-toggle` pill UI for the Easy / Medium
  difficulty switch on the overlay.
- `color-mixing/game.js` — small-element floater/confetti DOM pattern for
  the leaf 🍃 burst.
- Shared `tone()` + `ensureAudio()` — 2-note rising chime on correct,
  single low thud on wrong.

## New helpers required

- `spawnItem()` — picks a random entry from `CATALOG`, creates a
  `<div class="item">` with the emoji, adds to stage, pushes to
  `state.items`.
- `sortInto(item, category)` — removes DOM node, updates score, plays
  correct/wrong effect.
- `nearestItemToBottom(items)` — used when player taps a bin without
  pointing at a specific item.

## Files to create

- `earth-day/index.html` — CLAUDE.md skeleton; stage contains two bin
  buttons and items spawned at runtime.
- `earth-day/style.css` — leaf-green accent `#22c55e`; blue bin `#3b82f6`,
  gray bin `#6b7280`; large emoji items (~48px).
- `earth-day/game.js` — IIFE with state above + rAF loop.

## Home-page registration

- Add card in `/index.html`:
  `<a class="game-card earth-day" href="earth-day/" data-lb="earth-day-leaderboard">`
  emoji 🌎, title "Earth Day", desc "Sort recycling from trash!".
- Add gradient in `/style.css`:
  `.game-card.earth-day { background: linear-gradient(135deg, rgba(34,197,94,0.22), rgba(59,130,246,0.18)); border-color: rgba(34,197,94,0.4); }`

## Verification checklist

1. Start overlay appears; name prefilled; Easy/Medium toggle works.
2. On start, items fall smoothly from the top at a readable speed.
3. Tapping the recycling bin on a recyclable item scores +1 with chime
   and leaf confetti.
4. Tapping the trash bin on a food-waste item scores +1 with chime.
5. Wrong sort plays soft thunk and returns item to queue.
6. Items that reach the bottom auto-sort and don't clog the stage.
7. Medium mode shows up to 2 concurrent items.
8. 60-second timer counts down; end overlay shows score.
9. Leaderboard persists across reload.
10. Works on mobile (large bin tap targets, no pinch zoom, no scroll).
