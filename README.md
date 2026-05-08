# Fun Games

A small collection of browser-based mini-games built with vanilla HTML5 Canvas and JavaScript. Open `index.html` in a modern browser — no build step required.

## Games

### Quick Reflexes & Timing
- **Highway Dash** 🚗 — dodge oncoming traffic and grab coins while the speed ramps up
- **Whack-a-Mole** 🐹 — tap the moles as fast as you can and skip the bees 🐝
- **Cuckoo Clock** 🕰️ — wait for the cuckoo to pop, then tap as fast as you can
- **Flying Bird** 🐤 — tap to flap, dodge the pipes (hidden difficulty)

### Brain Teasers & Puzzle
- **Add It Up!** ➕ — quick-fire addition & subtraction practice
- **Piano Memory** 🎹 — Simon-style melody recall on a 7-key piano
- **Bunny Maze** 🐰 — navigate a procedurally generated maze to find the carrot
- **Pattern Party** 🧩 — match and arrange patterns
- **Clock It!** ⏰ — set an analog clock to match the target time
- **Color Mixing** 🎨 — blend two paint pots to match the target color

### Driving & Navigation
- **Bus Route Rush** 🚌 — drive a bus around a city grid, pick up colored passengers, and drop them at matching stops. Chain deliveries to build a combo multiplier!
- **Critter Cruise** 🚙 — one-button platformer hopping over rolling terrain
- **Tow Truck** 🚛 — rescue broken cars and deliver them to matching-color garages

### Construction & Action
- **Crane Truck** 🏗️ — use a pendulum crane to swing, drop, and match colored blocks to trucks. Build a house with your deliveries!
- **Excavator Dig** ⛏️ — rotate the excavator arm to dig dirt and dump it in trucks for points

### Nature & Exploration
- **Butterfly Garden** 🦋 — guide your butterfly finger-trail over matching-color flowers to sip nectar
- **Earth Day** 🌎 — sort falling items into recycling ♻️ or trash 🗑️ bins
- **Seahorse Splash** 🐚 — race through coral collecting treasures
- **Airport Luggage** ✈️ — drag colored luggage onto matching airplanes

### Stories & Creativity
- **Unicorn Storyteller** 🦄 — pick word tiles to build magical sentences and watch the unicorn act them out

### Bonus (Hidden)
- **Hot Air Balloon** 🎈 — hold to rise and tap letter balloons in order to spell sight words (hidden from home page)

## Layout

```
/
├── index.html                   # Game picker with per-game leaderboards
├── style.css                    # Shared picker styling
├── stats/                        # Stats page tracking all plays
├── README.md
├── CLAUDE.md                     # Development guide
├── shared/                       # Shared utilities (play-tracker.js, lib.js)
├── highway-dash/                 # Each game's folder (index.html, style.css, game.js)
├── whack-a-mole/
├── add-it-up/
├── piano/
├── bus-route-rush/
├── clock-it/
├── color-mixing/
├── critter-cruise/
├── airport-luggage-game/
├── maze-game/
├── crane-truck/
├── tow-truck/
├── butterfly-garden/
├── earth-day/
├── cuckoo-clock/
├── unicorn-storyteller/
├── seahorse-game/
├── excavator-game/
├── hotair-balloon/               # (hidden from home page)
└── hard/                         # Sub-gateway for harder games
    └── flappy-bird/              # (hidden from home page)
```

## Features

- **Leaderboards**: Each game tracks the top 20 scores per device (stored in localStorage)
- **Play Tracking**: Stats page shows most-played games and most-active players
- **Persistent Names**: Player names are saved across games
- **Mobile-Friendly**: Touch controls and responsive design on all devices
- **No Build Step**: Just open `index.html` in a browser — everything runs vanilla JS

## Getting Started

1. Clone this repository
2. Open `index.html` in your favorite browser
3. Pick a game and start playing!
4. Check `stats/` to see your play statistics across all games

---

Made with ❤️ for kids and curious minds everywhere!
