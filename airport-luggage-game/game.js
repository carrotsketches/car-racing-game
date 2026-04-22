(() => {
    // ---------- Constants ----------
    const CANVAS_W = 360;
    const CANVAS_H = 540;
    const ROUND_SECONDS = 60;
    const CARGO_MAX = 6;

    const HOME = { x: 180, y: 360 }; // runway sits at the bottom, just above the belt

    // Cities laid out as a 3x2 grid of destination cards above the runway.
    const CITIES = [
        { id: "nyc",    name: "New York", country: "USA",       emoji: "🗽", color: "#ff4d5e", x:  65, y:  90, note: 523.25 },
        { id: "paris",  name: "Paris",    country: "France",    emoji: "🗼", color: "#4ec0ff", x: 180, y:  90, note: 659.25 },
        { id: "tokyo",  name: "Tokyo",    country: "Japan",     emoji: "🏯", color: "#b36bff", x: 295, y:  90, note: 783.99 },
        { id: "rio",    name: "Rio",      country: "Brazil",    emoji: "🏖️", color: "#3ddc84", x:  65, y: 220, note: 587.33 },
        { id: "cairo",  name: "Cairo",    country: "Egypt",     emoji: "🐪", color: "#ffd23f", x: 180, y: 220, note: 698.46 },
        { id: "sydney", name: "Sydney",   country: "Australia", emoji: "🦘", color: "#ff9f40", x: 295, y: 220, note: 880.00 }
    ];

    const CARD = { w: 92, h: 84, r: 14 };

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
        flyingBags: [],  // tapped bags arcing up to the plane
        cargo: [],       // loaded on plane
        wants: [],       // { cityId, color, newAt } — what each city wants right now
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

    function currentWantInterval() {
        // Ramp from 1800ms → 900ms.
        const t = Math.min(1, state.elapsed / (ROUND_SECONDS * 1000));
        return 1800 - 900 * t;
    }

    function spawnBag() {
        state.bags.push({
            x: BELT.x - BELT.bagR,           // enter from left
            y: BELT.y + BELT.h / 2,
            r: BELT.bagR,
            color: pickColor()
        });
    }

    function spawnWant() {
        // Pick a city with fewer than 3 active wants.
        const candidates = CITIES.filter((c) => {
            return state.wants.filter((w) => w.cityId === c.id).length < 3;
        });
        if (candidates.length === 0) return;
        const city = candidates[Math.floor(Math.random() * candidates.length)];
        // Each city only wants its own color — bag color must match card color.
        state.wants.push({ cityId: city.id, color: city.color, newAt: state.elapsed });
        tone(900, 0.08, "triangle", 0.05); // bell-ding
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

        // Durations (seconds) — tight so kids don't wait.
        const TAKEOFF = 0.22;
        const DELIVER = 0.4;
        const speedPxPerSec = 400;

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
            const dur = Math.max(0.35, dist / speedPxPerSec);
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
        // Match cargo bags to wanted colors at this city.
        const wants = state.wants.filter((w) => w.cityId === city.id);
        const remainingCargo = [];
        for (const bag of state.cargo) {
            const hit = wants.find((w) => w.color === bag.color && !w.claimed);
            if (hit) {
                hit.claimed = true;
                delivered += 1;
            } else {
                remainingCargo.push(bag);
            }
        }
        state.cargo = remainingCargo;
        state.wants = state.wants.filter((w) => !w.claimed);

        if (delivered > 0) {
            const points = 10 * delivered + 5 * Math.max(0, delivered - 1);
            state.score += points;
            scoreEl.textContent = state.score;

            // Happy chord: root + major third + fifth.
            tone(city.note, 0.22, "triangle", 0.1);
            tone(city.note * 1.25, 0.22, "triangle", 0.08);
            tone(city.note * 1.5, 0.22, "triangle", 0.07);

            // Bigger confetti burst.
            spawnConfetti(city.x, city.y, city.color);
            spawnConfetti(city.x, city.y, "#ffffff");

            // Staggered "+10" popups per delivered bag.
            for (let i = 0; i < delivered; i++) {
                const ox = (i - (delivered - 1) / 2) * 22;
                state.floaters.push({ text: "+10", x: city.x + ox, y: city.y - 18 - i * 4, life: 1.1, max: 1.1, color: "#fff2a8" });
            }

            // Combo badge for 2+ matches.
            if (delivered >= 2) {
                state.floaters.push({ text: `COMBO x${delivered}!`, x: city.x, y: city.y - 40, life: 1.6, max: 1.6, color: "#fff" });
            }

            // City name cheer.
            state.floaters.push({ text: `${city.emoji} ${city.name}!`, x: city.x, y: city.y + 52, life: 1.4, max: 1.4, color: city.color });

            // Landmark bounce animation (used by drawCityCard).
            city.bounceUntil = state.elapsed + 500;

            // Full-card clear bonus: every want at this city is gone.
            const leftover = state.wants.filter((w) => w.cityId === city.id).length;
            if (leftover === 0) {
                state.score += 25;
                scoreEl.textContent = state.score;
                spawnFireworks(city.x, city.y);
                state.floaters.push({ text: "CLEARED! +25", x: city.x, y: city.y - 62, life: 2.0, max: 2.0, color: "#ffd23f" });
                tone(city.note * 2, 0.3, "triangle", 0.1);
                tone(city.note * 3, 0.3, "triangle", 0.06);
                city.bounceUntil = state.elapsed + 900;
            }
        } else {
            // Sad trombone: descending tones.
            tone(260, 0.12, "sawtooth", 0.06);
            tone(200, 0.14, "sawtooth", 0.05);
            state.floaters.push({ text: "no match 🙁", x: city.x, y: city.y - 22, life: 1.0, max: 1.0, color: "#e0e0e0" });
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

    // A 360-degree rainbow burst for full-card clears.
    function spawnFireworks(x, y) {
        const palette = CITIES.map((c) => c.color);
        const n = 44;
        for (let i = 0; i < n; i++) {
            const angle = (i / n) * Math.PI * 2;
            const speed = 130 + Math.random() * 90;
            state.confetti.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                life: 1.3 + Math.random() * 0.4,
                max: 1.7,
                color: palette[i % palette.length]
            });
        }
    }

    // ---------- Render ----------
    function drawSky() {
        // Bright daytime sky: sky blue → soft peach at the horizon.
        const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        g.addColorStop(0, "#6ec6ff");
        g.addColorStop(0.45, "#9fdbff");
        g.addColorStop(0.75, "#ffd9b0");
        g.addColorStop(1, "#ffb06b");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    function drawClouds() {
        const t = state.elapsed / 1000;
        // Clouds tucked into the gaps above, between, and below the card rows
        // so they never overlap destinations or the runway.
        const clouds = [
            { seed: 30,  y:  22, r: 14, speed: 8 },
            { seed: 220, y:  30, r: 11, speed: 6 },
            { seed: 100, y: 155, r: 12, speed: 7 },
            { seed: 280, y: 300, r: 11, speed: 9 }
        ];
        for (const c of clouds) {
            const x = ((c.seed + t * c.speed) % (CANVAS_W + 80)) - 40;
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.beginPath();
            ctx.arc(x,             c.y,                  c.r,          0, Math.PI * 2);
            ctx.arc(x + c.r * 0.8, c.y,                  c.r * 0.8,    0, Math.PI * 2);
            ctx.arc(x - c.r * 0.7, c.y,                  c.r * 0.7,    0, Math.PI * 2);
            ctx.arc(x + c.r * 0.3, c.y - c.r * 0.6,      c.r * 0.7,    0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawBagIcon(cx, cy, size, color, filled) {
        const w = size, h = size * 0.8;
        const bx = cx - w / 2, by = cy - h / 2 + 1;

        // Bag body.
        roundRect(bx, by, w, h, 1.5);
        if (filled) {
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.55)";
            ctx.lineWidth = 1.2;
            ctx.stroke();
        } else {
            ctx.fillStyle = "rgba(0,0,0,0.18)";
            ctx.fill();
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Handle.
        ctx.beginPath();
        ctx.arc(cx, by, w * 0.28, Math.PI, 2 * Math.PI);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = filled ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.4)";
        ctx.stroke();

        // Clasp highlight.
        if (filled) {
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fillRect(cx - 0.8, by + 1.5, 1.6, 1.6);
        }
    }

    function drawCityCard(city) {
        const cw = CARD.w, ch = CARD.h, r = CARD.r;
        const x = city.x - cw / 2;
        const y = city.y - ch / 2;

        const wants = state.wants.filter((w) => w.cityId === city.id);
        const hasMatch = state.plane.state === "idle" && state.cargo.length > 0 &&
            wants.some((w) => state.cargo.some((b) => b.color === w.color));

        // Match-hint pulsing halo when current cargo can deliver here.
        if (hasMatch) {
            const pulse = 0.55 + 0.35 * Math.sin(state.elapsed / 150);
            ctx.save();
            ctx.shadowColor = `rgba(255, 245, 160, ${pulse})`;
            ctx.shadowBlur = 18;
            ctx.strokeStyle = `rgba(255, 250, 190, ${pulse})`;
            ctx.lineWidth = 3;
            roundRect(x - 1, y - 1, cw + 2, ch + 2, r + 1);
            ctx.stroke();
            ctx.restore();
        }

        // Drop shadow.
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        roundRect(x + 2, y + 4, cw, ch, r);
        ctx.fill();

        // Card body gradient.
        const g = ctx.createLinearGradient(x, y, x, y + ch);
        g.addColorStop(0, city.color);
        g.addColorStop(1, shade(city.color, -0.35));
        ctx.fillStyle = g;
        roundRect(x, y, cw, ch, r);
        ctx.fill();

        // White glossy border.
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Landmark emoji — bounces briefly after a delivery.
        let emojiScale = 1;
        if (city.bounceUntil && state.elapsed < city.bounceUntil) {
            const t = 1 - (city.bounceUntil - state.elapsed) / 500;
            emojiScale = 1 + 0.55 * Math.sin(t * Math.PI);
        }
        ctx.save();
        ctx.translate(city.x, city.y - 16);
        ctx.scale(emojiScale, emojiScale);
        ctx.font = "30px system-ui, 'Apple Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(city.emoji, 0, 0);
        ctx.restore();

        // City name.
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(city.name.toUpperCase(), city.x, city.y + 14);

        // Wanted-luggage slots (up to 3). New wants pulse briefly after spawn.
        for (let i = 0; i < 3; i++) {
            const sx = city.x - 16 + i * 16;
            const sy = city.y + 30;
            const w = wants[i];
            if (w) {
                const age = (state.elapsed - w.newAt) / 1000;
                const pulse = age < 0.8 ? 1 + Math.sin(age * 12) * 0.35 * (1 - age / 0.8) : 1;
                // Soft halo behind the bag icon.
                ctx.beginPath();
                ctx.arc(sx, sy, 9 * pulse, 0, Math.PI * 2);
                ctx.fillStyle = w.color + "55";
                ctx.fill();
                drawBagIcon(sx, sy, 11 * pulse, w.color, true);
            } else {
                drawBagIcon(sx, sy, 11, null, false);
            }
        }
    }

    function drawCityCards() {
        for (const c of CITIES) drawCityCard(c);
    }

    function drawHomeAirport() {
        // A clean runway strip with dashed centerline.
        const rw = 130, rh = 38;
        const x = HOME.x - rw / 2;
        const y = HOME.y - rh / 2;

        // Runway shadow.
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        roundRect(x + 2, y + 3, rw, rh, 8);
        ctx.fill();

        // Runway body.
        ctx.fillStyle = "#3a4052";
        roundRect(x, y, rw, rh, 8);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Dashed centerline.
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(x + 8, HOME.y);
        ctx.lineTo(x + rw - 8, HOME.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // HOME label.
        ctx.font = "bold 9px 'Courier New', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("HOME AIRPORT", HOME.x, HOME.y + rh / 2 + 10);
    }

    // Darkens or lightens a hex color. amt: -1..1
    function shade(hex, amt) {
        const h = hex.replace("#", "");
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        const t = amt < 0 ? 0 : 255;
        const p = Math.abs(amt);
        const mix = (c) => Math.round((t - c) * p + c);
        const to2 = (n) => n.toString(16).padStart(2, "0");
        return "#" + to2(mix(r)) + to2(mix(g)) + to2(mix(b));
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

        // Soft shadow under the plane.
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(0, 8, 14, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#1c1f2a";
        ctx.lineWidth = 1.2;

        // Main fuselage — elongated ellipse with gradient.
        const fg = ctx.createLinearGradient(0, -5, 0, 5);
        fg.addColorStop(0, "#ffffff");
        fg.addColorStop(1, "#c9d1dc");
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Red nose cone.
        ctx.fillStyle = "#e94560";
        ctx.beginPath();
        ctx.moveTo(14, -3);
        ctx.quadraticCurveTo(20, 0, 14, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Lower main wing (behind body).
        ctx.fillStyle = "#4ec0ff";
        ctx.beginPath();
        ctx.moveTo(-2, 3);
        ctx.lineTo(-12, 14);
        ctx.lineTo(-4, 14);
        ctx.lineTo(5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Upper main wing.
        ctx.beginPath();
        ctx.moveTo(-2, -3);
        ctx.lineTo(-12, -14);
        ctx.lineTo(-4, -14);
        ctx.lineTo(5, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Tail fin (vertical).
        ctx.fillStyle = "#ff9f40";
        ctx.beginPath();
        ctx.moveTo(-13, -1);
        ctx.lineTo(-18, -8);
        ctx.lineTo(-13, -5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Horizontal tail fins.
        ctx.beginPath();
        ctx.moveTo(-13, -1);
        ctx.lineTo(-18, -4);
        ctx.lineTo(-13, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-13, 1);
        ctx.lineTo(-18, 4);
        ctx.lineTo(-13, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cockpit windshield.
        ctx.fillStyle = "#4ec0ff";
        ctx.beginPath();
        ctx.moveTo(6, -2);
        ctx.quadraticCurveTo(12, -4, 12, -1);
        ctx.lineTo(12, 1);
        ctx.quadraticCurveTo(12, -1, 6, -1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Passenger windows.
        ctx.fillStyle = "#ffe27a";
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(2 - i * 3.5, 0, 0.9, 0, Math.PI * 2);
            ctx.fill();
        }

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

    function drawFlyingBags() {
        for (const fb of state.flyingBags) {
            const t = fb.progress;
            const x = fb.fromX + (state.plane.x - fb.fromX) * t;
            const yLin = fb.fromY + (state.plane.y - fb.fromY) * t;
            // Parabolic arc: lift peaks at t=0.5.
            const y = yLin - 80 * Math.sin(Math.PI * t);
            // Shadow trail.
            ctx.beginPath();
            ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.fillStyle = fb.color + "33";
            ctx.fill();
            // Bag.
            ctx.beginPath();
            ctx.arc(x, y, 11, 0, Math.PI * 2);
            ctx.fillStyle = fb.color;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.45)";
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.font = "13px system-ui, sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧳", x, y);
        }
    }

    function render() {
        drawSky();
        drawClouds();
        drawHomeAirport();
        drawCityCards();
        drawPlane();
        drawBelt();
        drawFlyingBags();
        drawEffects();
    }

    // ---------- Update loop ----------
    function update(dt) {
        if (!state.running) return;

        state.elapsed += dt * 1000;
        state.timeLeft = Math.max(0, ROUND_SECONDS - state.elapsed / 1000);
        timeEl.textContent = Math.ceil(state.timeLeft);
        if (state.timeLeft <= 10) timeStatEl.classList.add("low");
        else timeStatEl.classList.remove("low");

        // Bag spawn
        state.bagSpawn.next -= dt * 1000;
        if (state.bagSpawn.next <= 0) {
            spawnBag();
            state.bagSpawn.next = currentBagInterval();
        }

        // Belt motion.
        const beltSpeed = currentBeltSpeed();
        for (const b of state.bags) b.x += beltSpeed * dt;
        state.bags = state.bags.filter((b) => b.x < BELT.x + BELT.w + 30);

        // Flying bags arc up to the plane; when they land they become cargo.
        for (const fb of state.flyingBags) fb.progress += dt / fb.duration;
        for (const fb of state.flyingBags.filter((f) => f.progress >= 1)) {
            if (state.cargo.length < CARGO_MAX) {
                state.cargo.push({ color: fb.color });
                tone(520, 0.05, "triangle", 0.05); // tiny "plop" on land
            }
        }
        state.flyingBags = state.flyingBags.filter((f) => f.progress < 1);

        // Wanted-color spawn
        state.wantSpawnNext = (state.wantSpawnNext || 1500) - dt * 1000;
        if (state.wantSpawnNext <= 0) {
            spawnWant();
            state.wantSpawnNext = currentWantInterval();
        }

        // Plane
        updatePlane(dt);

        // Confetti physics
        for (const c of state.confetti) {
            c.vy += 260 * dt;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.life -= dt;
        }
        state.confetti = state.confetti.filter((c) => c.life > 0);

        // Floaters
        for (const f of state.floaters) {
            f.y -= 30 * dt;
            f.life -= dt;
        }
        state.floaters = state.floaters.filter((f) => f.life > 0);

        // End of round
        if (state.timeLeft <= 0) endGame();
    }

    function loop(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;
        update(dt);
        render();
        if (state.running) requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    function canvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const sx = CANVAS_W / rect.width;
        const sy = CANVAS_H / rect.height;
        return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    }

    function handleTap(x, y) {
        if (!state.running) return;

        // Priority 1: bag on belt — tap launches an arc up to the plane.
        for (let i = state.bags.length - 1; i >= 0; i--) {
            const b = state.bags[i];
            if (Math.hypot(b.x - x, b.y - y) <= b.r + 4) {
                const reserved = state.cargo.length + state.flyingBags.length;
                if (reserved >= CARGO_MAX) {
                    tone(160, 0.1, "sawtooth", 0.05);
                    return;
                }
                state.flyingBags.push({
                    fromX: b.x, fromY: b.y,
                    color: b.color,
                    progress: 0,
                    duration: 0.45
                });
                state.bags.splice(i, 1);
                tone(620, 0.07, "square", 0.05);
                tone(880, 0.06, "square", 0.04);
                return;
            }
        }

        // Priority 2: tap a destination card to fly there.
        if (state.plane.state === "idle") {
            for (const c of CITIES) {
                const dx = Math.abs(c.x - x);
                const dy = Math.abs(c.y - y);
                if (dx <= CARD.w / 2 && dy <= CARD.h / 2) {
                    if (state.cargo.length === 0) {
                        tone(160, 0.1, "sawtooth", 0.05);
                        state.floaters.push({ text: "Load bags first!", x: state.plane.x, y: state.plane.y - 28, life: 1.2, max: 1.2, color: "#ffd23f" });
                        return;
                    }
                    planeFlyTo(c);
                    return;
                }
            }
        }
    }

    canvas.addEventListener("pointerdown", (e) => {
        const { x, y } = canvasPos(e);
        handleTap(x, y);
        e.preventDefault();
    });

    // Prevent stray touch scrolling on the stage.
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchend", (e) => e.preventDefault(), { passive: false });

    // ---------- Start / end ----------
    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.running = true;
        state.score = 0;
        state.elapsed = 0;
        state.timeLeft = ROUND_SECONDS;
        state.bags = [];
        state.flyingBags = [];
        state.cargo = [];
        state.wants = [];
        state.confetti = [];
        state.floaters = [];
        state.plane = { state: "idle", x: HOME.x, y: HOME.y, tx: HOME.x, ty: HOME.y, fromX: HOME.x, fromY: HOME.y, progress: 0, targetCity: null };
        state.bagSpawn = { next: 600, interval: 1500 };
        state.wantSpawnNext = 900;
        state.lastTs = 0;

        scoreEl.textContent = "0";
        timeEl.textContent = ROUND_SECONDS;
        timeStatEl.classList.remove("low");
        overlay.classList.add("hidden");

        // Seed a few wanted colors so kids have targets immediately.
        spawnWant();
        spawnWant();
        spawnWant();

        requestAnimationFrame(loop);
    }

    function endGame() {
        state.running = false;
        timeStatEl.classList.remove("low");
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);
        renderLeaderboard(state.playerName);

        overlayTitle.textContent = `✈ Flight complete!`;
        overlayMsg.textContent = `You scored ${state.score} delivering bags around the world. Fly again?`;
        startBtn.textContent = "Fly Again";
        overlay.classList.remove("hidden");
    }

    startBtn.addEventListener("click", startGame);

    // Initial draw so the canvas isn't blank before the first Start.
    render();
})();
