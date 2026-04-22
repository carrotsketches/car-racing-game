(() => {
    // ---------- Constants ----------
    const CANVAS_W = 360;
    const CANVAS_H = 540;
    const ROUND_SECONDS = 60;
    const CARGO_MAX = 6;

    const HOME = { x: 180, y: 190 }; // airport hub on the world map

    // 6 cities, one per continent. x/y in canvas coords.
    const CITIES = [
        { id: "nyc",    name: "New York", country: "USA",       emoji: "🗽", color: "#ff4d5e", x:  78, y: 150, note: 523.25 },
        { id: "rio",    name: "Rio",      country: "Brazil",    emoji: "🏖️", color: "#3ddc84", x: 118, y: 278, note: 587.33 },
        { id: "paris",  name: "Paris",    country: "France",    emoji: "🗼", color: "#4ec0ff", x: 196, y: 130, note: 659.25 },
        { id: "cairo",  name: "Cairo",    country: "Egypt",     emoji: "🐪", color: "#ffd23f", x: 218, y: 210, note: 698.46 },
        { id: "tokyo",  name: "Tokyo",    country: "Japan",     emoji: "🏯", color: "#b36bff", x: 298, y: 174, note: 783.99 },
        { id: "sydney", name: "Sydney",   country: "Australia", emoji: "🦘", color: "#ff9f40", x: 306, y: 278, note: 880.00 }
    ];

    // Belt lives at the bottom of the canvas; bags travel left→right.
    const BELT = { x: 10, y: 440, w: 340, h: 70, bagR: 18 };

    const NAME_KEY = "highway-dash-last-name"; // shared across games
    const LB_KEY = "airport-luggage-leaderboard";
    const LB_MAX = 20;

    // ---------- DOM refs ----------
    const $ = (id) => document.getElementById(id);
    const canvas = $("stage");
    const ctx = canvas.getContext("2d");
    const overlay = $("overlay");
    const overlayTitle = $("overlay-title");
    const overlayMsg = $("overlay-msg");
    const startBtn = $("start-btn");
    const nameInput = $("name-input");
    const playerNameEl = $("player-name");
    const scoreEl = $("score");
    const bestEl = $("best");
    const timeEl = $("time");
    const timeStatEl = $("time-stat");
    const leaderboardEl = $("leaderboard");

    // ---------- Utilities ----------
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Pilot";
    }

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
        for (const e of state.leaderboard) {
            if (e.name === name && e.score > best) best = e.score;
        }
        return best;
    }

    function renderLeaderboard(highlightName) {
        leaderboardEl.innerHTML = "";
        const top = state.leaderboard.slice(0, 5);
        for (const e of top) {
            const li = document.createElement("li");
            if (highlightName && e.name === highlightName) li.classList.add("me");
            li.innerHTML = `<span class="lb-name">${escapeHtml(e.name)}</span><span class="lb-score">${e.score}</span>`;
            leaderboardEl.appendChild(li);
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    // ---------- Audio (lazy) ----------
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }

    function tone(freq, dur = 0.12, type = "sine", gain = 0.08) {
        const a = ensureAudio();
        if (!a) return;
        const osc = a.createOscillator();
        const g = a.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.value = gain;
        g.gain.setValueAtTime(gain, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        osc.connect(g).connect(a.destination);
        osc.start();
        osc.stop(a.currentTime + dur);
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // ---------- State ----------
    const state = {
        running: false,
        score: 0,
        timeLeft: ROUND_SECONDS,
        playerName: "",
        leaderboard: loadLeaderboard(),
        bags: [],        // on belt
        cargo: [],       // loaded on plane
        passengers: [],  // { cityId, color, spawnedAt }
        confetti: [],
        floaters: [],    // floating city-name text
        plane: { state: "idle", x: HOME.x, y: HOME.y, tx: HOME.x, ty: HOME.y, fromX: HOME.x, fromY: HOME.y, progress: 0, targetCity: null },
        bagSpawn: { next: 0, interval: 1500 },
        lastTs: 0,
        elapsed: 0
    };

    // ---------- Boot: prefill name + best + leaderboard ----------
    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) {
        nameInput.value = savedName;
        playerNameEl.textContent = savedName;
    }
    bestEl.textContent = personalBest(savedName);
    renderLeaderboard(savedName);

    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
        renderLeaderboard(n);
    });

    // ---------- Spawn logic ----------
    function pickColor() {
        // Bags come in any of the 6 city colors.
        return CITIES[Math.floor(Math.random() * CITIES.length)].color;
    }

    function currentBagInterval() {
        // Ramp from 1500ms → 700ms over the round.
        const t = Math.min(1, state.elapsed / (ROUND_SECONDS * 1000));
        return 1500 - 800 * t;
    }

    function currentBeltSpeed() {
        // Ramp from 50 → 110 px/s.
        const t = Math.min(1, state.elapsed / (ROUND_SECONDS * 1000));
        return 50 + 60 * t;
    }

    function currentPassengerInterval() {
        // Ramp from 2000ms → 1000ms.
        const t = Math.min(1, state.elapsed / (ROUND_SECONDS * 1000));
        return 2000 - 1000 * t;
    }

    function spawnBag() {
        state.bags.push({
            x: BELT.x - BELT.bagR,           // enter from left
            y: BELT.y + BELT.h / 2,
            r: BELT.bagR,
            color: pickColor()
        });
    }

    function spawnPassenger() {
        // Pick a city with fewer than 3 waiting passengers.
        const candidates = CITIES.filter((c) => {
            const waiting = state.passengers.filter((p) => p.cityId === c.id).length;
            return waiting < 3;
        });
        if (candidates.length === 0) return;
        const city = candidates[Math.floor(Math.random() * candidates.length)];
        state.passengers.push({
            cityId: city.id,
            color: city.color,
            bob: Math.random() * Math.PI * 2
        });
    }

    // ---------- Plane state machine ----------
    function planeFlyTo(city) {
        if (state.plane.state !== "idle") return false;
        if (state.cargo.length === 0) return false;
        state.plane.fromX = state.plane.x;
        state.plane.fromY = state.plane.y;
        state.plane.tx = city.x;
        state.plane.ty = city.y;
        state.plane.progress = 0;
        state.plane.targetCity = city;
        state.plane.state = "takeoff";
        tone(city.note, 0.14, "triangle", 0.09);
        return true;
    }

    function updatePlane(dt) {
        const p = state.plane;
        if (p.state === "idle") return;

        // Durations (seconds)
        const TAKEOFF = 0.35;
        const DELIVER = 0.6;
        const speedPxPerSec = 260;

        if (p.state === "takeoff") {
            p.progress += dt / TAKEOFF;
            if (p.progress >= 1) { p.progress = 0; p.state = "flying"; }
            return;
        }

        if (p.state === "flying" || p.state === "returning") {
            const tx = p.state === "flying" ? p.tx : HOME.x;
            const ty = p.state === "flying" ? p.ty : HOME.y;
            const dx = tx - p.fromX;
            const dy = ty - p.fromY;
            const dist = Math.hypot(dx, dy) || 1;
            const dur = Math.max(0.6, dist / speedPxPerSec);
            p.progress += dt / dur;
            if (p.progress >= 1) p.progress = 1;
            p.x = p.fromX + dx * p.progress;
            p.y = p.fromY + dy * p.progress;
            if (p.progress >= 1) {
                if (p.state === "flying") {
                    p.state = "delivering";
                    p.progress = 0;
                    deliverCargo(p.targetCity);
                } else {
                    p.state = "idle";
                    p.progress = 0;
                    p.x = HOME.x; p.y = HOME.y;
                }
            }
            return;
        }

        if (p.state === "delivering") {
            p.progress += dt / DELIVER;
            if (p.progress >= 1) {
                p.progress = 0;
                p.fromX = p.x; p.fromY = p.y;
                p.state = "returning";
            }
            return;
        }
    }

    function deliverCargo(city) {
        let delivered = 0;
        // Match cargo bags to waiting passengers at this city by color.
        const waiting = state.passengers.filter((p) => p.cityId === city.id);
        const remainingCargo = [];
        for (const bag of state.cargo) {
            const hit = waiting.find((pax) => pax.color === bag.color && !pax.claimed);
            if (hit) {
                hit.claimed = true;
                delivered += 1;
            } else {
                remainingCargo.push(bag);
            }
        }
        state.cargo = remainingCargo;
        state.passengers = state.passengers.filter((p) => !p.claimed);

        if (delivered > 0) {
            const points = 10 * delivered + 5 * Math.max(0, delivered - 1);
            state.score += points;
            scoreEl.textContent = state.score;
            tone(city.note, 0.18, "triangle", 0.12);
            spawnConfetti(city.x, city.y, city.color);
            state.floaters.push({ text: `${city.emoji} ${city.name}! +${points}`, x: city.x, y: city.y - 22, life: 1.4, max: 1.4, color: city.color });
        } else {
            tone(180, 0.12, "sawtooth", 0.06);
            state.floaters.push({ text: "no match", x: city.x, y: city.y - 22, life: 1.0, max: 1.0, color: "#e0e0e0" });
        }
    }

    function spawnConfetti(x, y, color) {
        for (let i = 0; i < 18; i++) {
            state.confetti.push({
                x, y,
                vx: (Math.random() - 0.5) * 160,
                vy: -80 - Math.random() * 80,
                life: 0.9 + Math.random() * 0.4,
                max: 1.3,
                color: Math.random() < 0.5 ? color : "#fff2d1"
            });
        }
    }

    // Draw a static preview so the canvas isn't blank before the game is wired up.
    function drawPreview() {
        ctx.fillStyle = "#0b1830";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = "#9bb4e0";
        ctx.font = "bold 18px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText("✈ Airport Luggage", CANVAS_W / 2, CANVAS_H / 2 - 8);
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText("tap Start Flight", CANVAS_W / 2, CANVAS_H / 2 + 14);
    }
    drawPreview();

    startBtn.addEventListener("click", () => {
        // Temporary handler until startGame is implemented.
        ensureAudio();
        overlayMsg.textContent = "Game logic is being loaded in follow-up commits — check back soon!";
    });
})();
