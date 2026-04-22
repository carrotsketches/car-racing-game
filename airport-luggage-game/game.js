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

    // ---------- Render ----------
    // Very rough continent silhouettes as filled polygons on the canvas.
    const CONTINENTS = [
        // North America
        [[30,95],[110,90],[135,135],[120,180],[80,200],[45,170]],
        // South America
        [[100,230],[145,225],[155,295],[125,345],[100,320]],
        // Europe
        [[175,100],[225,100],[230,150],[195,160],[180,140]],
        // Africa
        [[200,165],[250,170],[260,250],[225,310],[200,260]],
        // Asia
        [[235,95],[330,90],[345,180],[290,200],[250,170],[235,130]],
        // Australia
        [[285,275],[335,270],[340,310],[300,320]]
    ];

    function drawSky() {
        // Sunset gradient inside the canvas.
        const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        g.addColorStop(0, "#ffb26b");
        g.addColorStop(0.35, "#ff6b9a");
        g.addColorStop(0.7, "#5b2a8c");
        g.addColorStop(1, "#0b1c3a");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Stars in the upper band.
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        for (let i = 0; i < 14; i++) {
            const sx = ((i * 37) % CANVAS_W);
            const sy = (i * 13) % 70 + 10;
            ctx.fillRect(sx, sy, 2, 2);
        }
    }

    function drawWorldMap() {
        // Ocean band behind continents.
        ctx.fillStyle = "rgba(30, 80, 140, 0.35)";
        roundRect(10, 80, CANVAS_W - 20, 260, 18);
        ctx.fill();

        // Latitude grid.
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        for (let y = 110; y < 340; y += 30) {
            ctx.beginPath();
            ctx.moveTo(14, y);
            ctx.lineTo(CANVAS_W - 14, y);
            ctx.stroke();
        }

        // Continents.
        ctx.fillStyle = "#2fa36b";
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        for (const poly of CONTINENTS) {
            ctx.beginPath();
            ctx.moveTo(poly[0][0], poly[0][1]);
            for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }

    function drawCityPins() {
        for (const c of CITIES) {
            // Pin base circle
            ctx.beginPath();
            ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
            ctx.fillStyle = c.color;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Landmark emoji
            ctx.font = "14px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(c.emoji, c.x, c.y - 18);

            // Waiting passengers as small dots above the pin.
            const waiting = state.passengers.filter((p) => p.cityId === c.id);
            for (let i = 0; i < waiting.length; i++) {
                const px = c.x - 8 + i * 8;
                const py = c.y + 14;
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fillStyle = waiting[i].color;
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.4)";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    function drawHomeAirport() {
        // Runway patch under HOME.
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        roundRect(HOME.x - 22, HOME.y - 10, 44, 20, 6);
        ctx.fill();
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.textAlign = "center";
        ctx.fillText("HOME", HOME.x, HOME.y + 22);
    }

    function drawPlane() {
        const p = state.plane;
        let x = p.x, y = p.y;
        let bounce = 0;

        if (p.state === "takeoff") bounce = -8 * Math.sin(Math.PI * p.progress);
        if (p.state === "delivering") {
            // Hover + mini wiggle while the parachute drops.
            bounce = Math.sin(p.progress * Math.PI * 2) * 2;
        }

        // Contrail dots while flying/returning.
        if (p.state === "flying" || p.state === "returning") {
            const dx = p.x - p.fromX;
            const dy = p.y - p.fromY;
            for (let i = 1; i <= 6; i++) {
                const t = Math.max(0, p.progress - i * 0.05);
                const cx = p.fromX + dx * t;
                const cy = p.fromY + dy * t;
                ctx.beginPath();
                ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.4 - i * 0.05})`;
                ctx.fill();
            }
        }

        ctx.save();
        ctx.translate(x, y + bounce);
        // Rotate toward target during flight.
        if (p.state === "flying" || p.state === "returning") {
            const tx = p.state === "flying" ? p.tx : HOME.x;
            const ty = p.state === "flying" ? p.ty : HOME.y;
            const ang = Math.atan2(ty - p.fromY, tx - p.fromX);
            ctx.rotate(ang);
        }
        // Plane body
        ctx.fillStyle = "#fdf6e3";
        ctx.strokeStyle = "#2e3440";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, -5);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-8, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Wing
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        ctx.lineTo(-6, -10);
        ctx.lineTo(2, -2);
        ctx.closePath();
        ctx.fillStyle = "#ff9f40";
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Parachute during delivery
        if (p.state === "delivering" && p.targetCity) {
            const drop = p.progress;
            const px = p.x;
            const py = p.y + 4 + drop * 22;
            ctx.fillStyle = p.targetCity.color;
            ctx.beginPath();
            ctx.arc(px, py - 8, 9, Math.PI, 0);
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px - 8, py - 8); ctx.lineTo(px, py);
            ctx.moveTo(px + 8, py - 8); ctx.lineTo(px, py);
            ctx.stroke();
            ctx.font = "12px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🧳", px, py + 2);
        }
    }

    function drawBelt() {
        // Belt body
        ctx.fillStyle = "#2a2a2a";
        roundRect(BELT.x, BELT.y, BELT.w, BELT.h, 10);
        ctx.fill();
        ctx.strokeStyle = "#444";
        ctx.stroke();

        // Animated belt lines (visual only).
        const phase = (state.elapsed / 10) % 20;
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 2;
        for (let x = BELT.x - 20 + phase; x < BELT.x + BELT.w; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, BELT.y + BELT.h - 4);
            ctx.lineTo(x + 10, BELT.y + BELT.h - 4);
            ctx.stroke();
        }

        // Bags
        for (const b of state.bags) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fillStyle = b.color;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.45)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.font = "16px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧳", b.x, b.y);
        }

        // Cargo indicator above the belt (plane's capacity).
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillStyle = "#fdf6e3";
        ctx.textAlign = "left";
        ctx.fillText(`Cargo ${state.cargo.length}/${CARGO_MAX}`, BELT.x + 6, BELT.y - 10);
        for (let i = 0; i < CARGO_MAX; i++) {
            const cx = BELT.x + 86 + i * 14;
            const cy = BELT.y - 14;
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fillStyle = state.cargo[i] ? state.cargo[i].color : "rgba(255,255,255,0.15)";
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawEffects() {
        // Confetti
        for (const c of state.confetti) {
            const a = Math.max(0, c.life / c.max);
            ctx.globalAlpha = a;
            ctx.fillStyle = c.color;
            ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
        }
        ctx.globalAlpha = 1;

        // Floating text
        for (const f of state.floaters) {
            const a = Math.max(0, f.life / f.max);
            ctx.globalAlpha = a;
            ctx.font = "bold 13px system-ui, sans-serif";
            ctx.fillStyle = f.color;
            ctx.textAlign = "center";
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    function render() {
        drawSky();
        drawWorldMap();
        drawCityPins();
        drawHomeAirport();
        drawPlane();
        drawBelt();
        drawEffects();
    }

    render();

    startBtn.addEventListener("click", () => {
        // Temporary handler until startGame is implemented.
        ensureAudio();
        overlayMsg.textContent = "Game logic is being loaded in follow-up commits — check back soon!";
    });
})();
