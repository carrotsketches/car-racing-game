(() => {
    // ---------- Constants ----------
    const CANVAS_W = 360;
    const CANVAS_H = 540;
    const ROUND_SECONDS = 60;
    const CARGO_CAP = 2;   // each plane takes off once it has this many matching bags

    // Four destinations, each paired with a same-colored plane.
    const CITIES = [
        { id: "nyc",     name: "New York", emoji: "🗽", color: "#ff4d5e", x:  45, y: 90, note: 523.25 },
        { id: "china",   name: "China",    emoji: "🐼", color: "#ffc94b", x: 135, y: 90, note: 659.25 },
        { id: "japan",   name: "Japan",    emoji: "🗻", color: "#b36bff", x: 225, y: 90, note: 783.99 },
        { id: "germany", name: "Germany",  emoji: "🏰", color: "#4ac867", x: 315, y: 90, note: 880.00 }
    ];

    // Plane home positions — each plane sits below its matching city.
    const PLANE_Y = 320;
    const PLANES = CITIES.map((c) => ({
        id: c.id,
        color: c.color,
        destCity: c,
        homeX: c.x,
        homeY: PLANE_Y
    }));

    // Airport wrapper around planes + belt.
    const AIRPORT = { x: 10, y: 270, w: 340, h: 250, r: 14 };

    // Conveyor belt sits inside the airport at the bottom.
    const BELT = { x: 20, y: 450, w: 320, h: 60, bagR: 17 };

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

    // ---------- State ----------
    function makePlane(def) {
        return {
            id: def.id,
            color: def.color,
            destCity: def.destCity,
            homeX: def.homeX,
            homeY: def.homeY,
            x: def.homeX,
            y: def.homeY,
            fromX: def.homeX,
            fromY: def.homeY,
            tx: def.homeX,
            ty: def.homeY,
            cargo: [],         // [{color}, ...] up to CARGO_CAP
            state: "idle",     // idle | takeoff | flying | delivering | returning
            progress: 0,
            rejectUntil: 0     // shake/no timestamp cutoff
        };
    }

    const state = {
        running: false,
        score: 0,
        timeLeft: ROUND_SECONDS,
        playerName: "",
        leaderboard: loadLeaderboard(),
        bags: [],              // on belt
        flyingBags: [],        // bags arcing to a plane
        draggingBag: null,     // { color, x, y } — bag currently under the kid's finger
        planes: PLANES.map(makePlane),
        confetti: [],
        floaters: [],
        bagSpawn: { next: 0 },
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

    // ---------- Spawn ----------
    function spawnBag() {
        const color = CITIES[Math.floor(Math.random() * CITIES.length)].color;
        state.bags.push({
            x: BELT.x - 20,
            y: BELT.y + BELT.h / 2,
            r: BELT.bagR,
            color
        });
    }

    // ---------- Render ----------
    function drawSky() {
        const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        g.addColorStop(0, "#6ec6ff");
        g.addColorStop(0.5, "#a6dcff");
        g.addColorStop(1, "#d4ecff");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    function drawClouds() {
        const t = state.elapsed / 1000;
        const clouds = [
            { seed: 30,  y:  30, r: 14, speed: 8 },
            { seed: 220, y:  45, r: 11, speed: 6 },
            { seed: 140, y: 175, r: 12, speed: 7 },
            { seed: 260, y: 220, r: 10, speed: 9 }
        ];
        for (const c of clouds) {
            const x = ((c.seed + t * c.speed) % (CANVAS_W + 80)) - 40;
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.beginPath();
            ctx.arc(x, c.y, c.r, 0, Math.PI * 2);
            ctx.arc(x + c.r * 0.8, c.y, c.r * 0.8, 0, Math.PI * 2);
            ctx.arc(x - c.r * 0.7, c.y, c.r * 0.7, 0, Math.PI * 2);
            ctx.arc(x + c.r * 0.3, c.y - c.r * 0.6, c.r * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawDestinations() {
        for (const city of CITIES) {
            // Landmark emoji (bounces briefly after a delivery).
            let scale = 1;
            if (city.bounceUntil && state.elapsed < city.bounceUntil) {
                const t = 1 - (city.bounceUntil - state.elapsed) / 500;
                scale = 1 + 0.55 * Math.sin(t * Math.PI);
            }
            ctx.save();
            ctx.translate(city.x, city.y);
            ctx.scale(scale, scale);
            ctx.font = "34px system-ui, 'Apple Color Emoji', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(city.emoji, 0, 0);
            ctx.restore();

            // Colored "sign" below with city name
            const bw = 78, bh = 22;
            const bx = city.x - bw / 2, by = city.y + 26;
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            roundRect(bx + 1, by + 2, bw, bh, 6);
            ctx.fill();
            const g = ctx.createLinearGradient(bx, by, bx, by + bh);
            g.addColorStop(0, city.color);
            g.addColorStop(1, shade(city.color, -0.25));
            ctx.fillStyle = g;
            roundRect(bx, by, bw, bh, 6);
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.font = "bold 11px system-ui, sans-serif";
            ctx.fillStyle = "#fff";
            ctx.fillText(city.name.toUpperCase(), city.x, by + bh / 2 + 1);
        }
    }

    function drawAirport() {
        // Shadow under terminal.
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        roundRect(AIRPORT.x + 3, AIRPORT.y + 5, AIRPORT.w, AIRPORT.h, AIRPORT.r);
        ctx.fill();

        // Terminal body.
        const g = ctx.createLinearGradient(0, AIRPORT.y, 0, AIRPORT.y + AIRPORT.h);
        g.addColorStop(0, "#ecdfc6");
        g.addColorStop(1, "#b8a685");
        ctx.fillStyle = g;
        roundRect(AIRPORT.x, AIRPORT.y, AIRPORT.w, AIRPORT.h, AIRPORT.r);
        ctx.fill();
        ctx.strokeStyle = "#8a7655";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dashed tarmac markings across the parking apron.
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(AIRPORT.x + 14, PLANE_Y + 26);
        ctx.lineTo(AIRPORT.x + AIRPORT.w - 14, PLANE_Y + 26);
        ctx.stroke();
        ctx.setLineDash([]);

        // AIRPORT sign tab.
        const lw = 106, lh = 22;
        const lx = AIRPORT.x + (AIRPORT.w - lw) / 2;
        const ly = AIRPORT.y - 11;
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        roundRect(lx + 1, ly + 2, lw, lh, 7);
        ctx.fill();
        ctx.fillStyle = "#2a2a2a";
        roundRect(lx, ly, lw, lh, 7);
        ctx.fill();
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = "bold 12px 'Courier New', monospace";
        ctx.fillStyle = "#ffd23f";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✈  AIRPORT  ✈", lx + lw / 2, ly + lh / 2 + 1);
    }

    function drawSinglePlane(p) {
        const bounce = (p.state === "takeoff") ? -8 * Math.sin(Math.PI * p.progress) : 0;
        const rejectShake = state.elapsed < p.rejectUntil ? Math.sin(state.elapsed / 25) * 4 : 0;

        ctx.save();
        ctx.translate(p.x + rejectShake, p.y + bounce);

        if (p.state === "flying" || p.state === "returning") {
            const tx = p.state === "flying" ? p.tx : p.homeX;
            const ty = p.state === "flying" ? p.ty : p.homeY;
            const ang = Math.atan2(ty - p.fromY, tx - p.fromX);
            ctx.rotate(ang);
        }

        // Shadow under plane.
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.ellipse(0, 9, 15, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = shade(p.color, -0.45);
        ctx.lineWidth = 1.2;

        // Fuselage in plane color with lighter belly.
        const fg = ctx.createLinearGradient(0, -5, 0, 5);
        fg.addColorStop(0, p.color);
        fg.addColorStop(1, shade(p.color, -0.25));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // White nose tip.
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(14, -3);
        ctx.quadraticCurveTo(19, 0, 14, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Upper and lower main wings.
        ctx.fillStyle = shade(p.color, -0.15);
        ctx.beginPath();
        ctx.moveTo(-2, -3); ctx.lineTo(-11, -13); ctx.lineTo(-4, -13); ctx.lineTo(5, -3);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-2, 3); ctx.lineTo(-11, 13); ctx.lineTo(-4, 13); ctx.lineTo(5, 3);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // Tail fin.
        ctx.beginPath();
        ctx.moveTo(-13, -1); ctx.lineTo(-18, -7); ctx.lineTo(-13, -4);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // Cockpit window.
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.ellipse(8, -1, 3, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Cargo indicators on top of plane — drawn upright.
        drawPlaneCargo(p);

        // Parachutes drop during delivering phase, one per delivered bag.
        if (p.state === "delivering" && p.deliveringBags && p.deliveringBags.length > 0) {
            const drop = p.progress;
            const n = p.deliveringBags.length;
            for (let i = 0; i < n; i++) {
                const ox = (i - (n - 1) / 2) * 14;
                const px = p.x + ox;
                const py = p.y + 4 + drop * 22;
                // Canopy.
                ctx.beginPath();
                ctx.arc(px, py - 8, 8, Math.PI, 0);
                ctx.fillStyle = p.deliveringBags[i].color;
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.45)";
                ctx.lineWidth = 1;
                ctx.stroke();
                // Strings.
                ctx.beginPath();
                ctx.moveTo(px - 7, py - 8); ctx.lineTo(px, py);
                ctx.moveTo(px + 7, py - 8); ctx.lineTo(px, py);
                ctx.stroke();
                // Bag emoji.
                ctx.font = "11px system-ui, 'Apple Color Emoji', sans-serif";
                ctx.fillStyle = "#fff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🧳", px, py + 2);
            }
        }
    }

    function drawPlaneCargo(p) {
        const n = CARGO_CAP;
        const slotW = 11, gap = 2;
        const totalW = n * slotW + (n - 1) * gap;
        const startX = p.x - totalW / 2 + slotW / 2;
        const y = p.y - 18;
        for (let i = 0; i < n; i++) {
            const sx = startX + i * (slotW + gap);
            const bag = p.cargo[i];
            // Bag body.
            roundRect(sx - slotW / 2, y - 4, slotW, 9, 1.5);
            if (bag) {
                ctx.fillStyle = bag.color;
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.5)";
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                ctx.fillStyle = "rgba(0,0,0,0.15)";
                ctx.fill();
                ctx.setLineDash([1.5, 1.5]);
                ctx.strokeStyle = "rgba(255,255,255,0.6)";
                ctx.lineWidth = 0.8;
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // Handle arc.
            ctx.beginPath();
            ctx.arc(sx, y - 4, 2.8, Math.PI, 2 * Math.PI);
            ctx.lineWidth = 1;
            ctx.strokeStyle = bag ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.5)";
            ctx.stroke();
        }
    }

    function drawPlanes() {
        for (const p of state.planes) drawSinglePlane(p);
    }

    function drawBelt() {
        ctx.fillStyle = "#2a2a2a";
        roundRect(BELT.x, BELT.y, BELT.w, BELT.h, 8);
        ctx.fill();
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const phase = (state.elapsed / 10) % 20;
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        for (let x = BELT.x - 20 + phase; x < BELT.x + BELT.w; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, BELT.y + BELT.h - 5);
            ctx.lineTo(x + 10, BELT.y + BELT.h - 5);
            ctx.stroke();
        }
    }

    function drawBags() {
        for (const b of state.bags) {
            ctx.beginPath();
            ctx.arc(b.x + 1, b.y + 2, b.r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fillStyle = b.color;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.font = "16px system-ui, 'Apple Color Emoji', sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧳", b.x, b.y);
        }
    }

    function drawFlyingBags() {
        for (const fb of state.flyingBags) {
            const t = fb.progress;
            const x = fb.fromX + (fb.toX - fb.fromX) * t;
            const yLin = fb.fromY + (fb.toY - fb.fromY) * t;
            const y = yLin - 70 * Math.sin(Math.PI * t);
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.fillStyle = fb.color;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.45)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.font = "13px system-ui, 'Apple Color Emoji', sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧳", x, y);
        }
    }

    function drawDraggingBag() {
        const sb = state.draggingBag;
        if (!sb) return;
        // Soft shadow on the "ground" below finger.
        ctx.beginPath();
        ctx.ellipse(sb.x, sb.y + 18, 14, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fill();

        // Match halo when dragging over a valid plane.
        const over = findPlaneAt(sb.x, sb.y);
        if (over && over.color === sb.color && over.state === "idle"
            && over.cargo.length + countFlyingToPlane(over.id) < CARGO_CAP) {
            const pulse = 1 + Math.sin(state.elapsed / 90) * 0.25;
            ctx.beginPath();
            ctx.arc(over.x, over.y, 28 * pulse, 0, Math.PI * 2);
            ctx.fillStyle = sb.color + "44";
            ctx.fill();
        }

        // Bag following the finger, slightly larger so it reads as "picked up".
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, 19, 0, Math.PI * 2);
        ctx.fillStyle = sb.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = "16px system-ui, 'Apple Color Emoji', sans-serif";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🧳", sb.x, sb.y);
    }

    function drawEffects() {
        for (const c of state.confetti) {
            ctx.globalAlpha = Math.max(0, c.life / c.max);
            ctx.fillStyle = c.color;
            ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
        for (const f of state.floaters) {
            ctx.globalAlpha = Math.max(0, f.life / f.max);
            ctx.font = "bold 13px system-ui, sans-serif";
            ctx.fillStyle = f.color;
            ctx.textAlign = "center";
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    function render() {
        drawSky();
        drawClouds();
        drawDestinations();
        drawAirport();
        drawPlanes();
        drawBelt();
        drawBags();
        drawFlyingBags();
        drawDraggingBag();
        drawEffects();
    }

    function update(dt) {
        if (!state.running) return;
        state.elapsed += dt * 1000;
        state.timeLeft = Math.max(0, ROUND_SECONDS - state.elapsed / 1000);
        timeEl.textContent = Math.ceil(state.timeLeft);
        if (state.timeLeft <= 10) timeStatEl.classList.add("low");
        else timeStatEl.classList.remove("low");

        // Bag spawn (ramp: slower early, quicker late).
        state.bagSpawn.next -= dt * 1000;
        if (state.bagSpawn.next <= 0) {
            spawnBag();
            const t = Math.min(1, state.elapsed / (ROUND_SECONDS * 1000));
            state.bagSpawn.next = 1400 - 600 * t;
        }

        // Belt motion.
        const beltSpeed = 60 + Math.min(60, state.elapsed / 700);
        for (const b of state.bags) b.x += beltSpeed * dt;
        state.bags = state.bags.filter((b) => b.x < BELT.x + BELT.w + 30);

        // Floaters + confetti.
        for (const f of state.floaters) { f.y -= 30 * dt; f.life -= dt; }
        state.floaters = state.floaters.filter((f) => f.life > 0);
        for (const c of state.confetti) {
            c.vy += 260 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
        }
        state.confetti = state.confetti.filter((c) => c.life > 0);

        // Flying bags arc to their target plane; on arrival they become cargo.
        for (const fb of state.flyingBags) fb.progress += dt / fb.duration;
        for (const fb of state.flyingBags.filter((f) => f.progress >= 1)) {
            const plane = state.planes.find((p) => p.id === fb.planeId);
            if (plane && plane.state === "idle" && plane.cargo.length < CARGO_CAP) {
                plane.cargo.push({ color: fb.color });
                tone(520, 0.05, "triangle", 0.05);
            }
        }
        state.flyingBags = state.flyingBags.filter((f) => f.progress < 1);

        // Plane state machine — each plane takes off when its cargo is full.
        for (const p of state.planes) {
            if (p.state === "idle" && p.cargo.length >= CARGO_CAP && countFlyingToPlane(p.id) === 0) {
                startTakeoff(p);
            }
            advancePlane(p, dt);
        }

        if (state.timeLeft <= 0) endGame();
    }

    function startTakeoff(p) {
        p.fromX = p.homeX;
        p.fromY = p.homeY;
        p.tx = p.destCity.x;
        p.ty = p.destCity.y;
        p.progress = 0;
        p.state = "takeoff";
        tone(p.destCity.note, 0.14, "triangle", 0.08);
        state.floaters.push({
            text: "✈ off we go!",
            x: p.x, y: p.y - 30,
            life: 0.9, max: 0.9, color: "#ffffff"
        });
    }

    function advancePlane(p, dt) {
        if (p.state === "idle") return;
        const TAKEOFF = 0.22;
        const DELIVER = 0.45;
        const speedPxPerSec = 420;

        if (p.state === "takeoff") {
            p.progress += dt / TAKEOFF;
            if (p.progress >= 1) { p.progress = 0; p.state = "flying"; }
            return;
        }

        if (p.state === "flying" || p.state === "returning") {
            const tx = p.state === "flying" ? p.tx : p.homeX;
            const ty = p.state === "flying" ? p.ty : p.homeY;
            const dx = tx - p.fromX;
            const dy = ty - p.fromY;
            const dist = Math.hypot(dx, dy) || 1;
            const dur = Math.max(0.3, dist / speedPxPerSec);
            p.progress += dt / dur;
            if (p.progress >= 1) p.progress = 1;
            p.x = p.fromX + dx * p.progress;
            p.y = p.fromY + dy * p.progress;
            if (p.progress >= 1) {
                if (p.state === "flying") {
                    p.state = "delivering";
                    p.progress = 0;
                    deliverCargo(p);
                } else {
                    p.state = "idle";
                    p.progress = 0;
                    p.x = p.homeX; p.y = p.homeY;
                    p.fromX = p.homeX; p.fromY = p.homeY;
                    p.deliveringBags = null;
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

    function deliverCargo(p) {
        const bags = p.cargo.slice();
        const n = bags.length;
        p.deliveringBags = bags;
        p.cargo = [];

        if (n === 0) return;

        const points = 10 * n + 5 * Math.max(0, n - 1);
        state.score += points;
        scoreEl.textContent = state.score;

        // Happy chord: root + third + fifth.
        tone(p.destCity.note, 0.22, "triangle", 0.1);
        tone(p.destCity.note * 1.25, 0.22, "triangle", 0.08);
        tone(p.destCity.note * 1.5, 0.22, "triangle", 0.07);

        // Double confetti burst at the destination.
        spawnConfetti(p.destCity.x, p.destCity.y, p.color);
        spawnConfetti(p.destCity.x, p.destCity.y, "#ffffff");

        // +10 pop per delivered bag.
        for (let i = 0; i < n; i++) {
            const ox = (i - (n - 1) / 2) * 22;
            state.floaters.push({
                text: "+10",
                x: p.destCity.x + ox,
                y: p.destCity.y - 20 - i * 4,
                life: 1.1, max: 1.1, color: "#fff2a8"
            });
        }

        // City-name cheer beneath the landmark.
        state.floaters.push({
            text: `${p.destCity.emoji} ${p.destCity.name}!`,
            x: p.destCity.x, y: p.destCity.y + 60,
            life: 1.4, max: 1.4, color: p.color
        });

        // Combo badge for 2+ matches (plane always takes off with n === CARGO_CAP, so this
        // always fires at n>=2, which is the point — full-load cheer).
        if (n >= 2) {
            state.floaters.push({
                text: `COMBO x${n}!`,
                x: p.destCity.x, y: p.destCity.y - 46,
                life: 1.5, max: 1.5, color: "#ffffff"
            });
        }

        // Landmark bounce.
        p.destCity.bounceUntil = state.elapsed + 500;
    }

    function spawnConfetti(x, y, color) {
        for (let i = 0; i < 20; i++) {
            state.confetti.push({
                x, y,
                vx: (Math.random() - 0.5) * 170,
                vy: -85 - Math.random() * 85,
                life: 0.9 + Math.random() * 0.4,
                max: 1.3,
                color: Math.random() < 0.5 ? color : "#fff2d1"
            });
        }
    }

    // ---------- Input ----------
    function canvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const sx = CANVAS_W / rect.width;
        const sy = CANVAS_H / rect.height;
        return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    }

    function tryLoadBag(plane) {
        const sb = state.draggingBag;
        if (!sb) return false;
        if (plane.state !== "idle") {
            plane.rejectUntil = state.elapsed + 350;
            tone(180, 0.1, "sawtooth", 0.05);
            return false;
        }
        if (plane.color !== sb.color) {
            plane.rejectUntil = state.elapsed + 400;
            tone(200, 0.12, "sawtooth", 0.05);
            state.floaters.push({
                text: "wrong plane!",
                x: plane.x, y: plane.y - 28,
                life: 1.0, max: 1.0, color: "#ffd23f"
            });
            return false;
        }
        if (plane.cargo.length + countFlyingToPlane(plane.id) >= CARGO_CAP) {
            plane.rejectUntil = state.elapsed + 250;
            tone(180, 0.1, "sawtooth", 0.05);
            return false;
        }
        // Valid load — short snap arc from drop point onto the plane.
        state.flyingBags.push({
            fromX: sb.x, fromY: sb.y,
            toX: plane.x, toY: plane.y,
            color: sb.color,
            planeId: plane.id,
            progress: 0,
            duration: 0.22
        });
        state.draggingBag = null;
        tone(620, 0.07, "square", 0.05);
        tone(880, 0.06, "square", 0.04);
        return true;
    }

    function countFlyingToPlane(id) {
        return state.flyingBags.filter((f) => f.planeId === id).length;
    }

    function findPlaneAt(x, y) {
        let hit = null, hitDist = Infinity;
        for (const p of state.planes) {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < 36 && d < hitDist) { hit = p; hitDist = d; }
        }
        return hit;
    }

    function returnBagToBelt() {
        const sb = state.draggingBag;
        if (!sb) return;
        state.bags.push({
            x: Math.max(BELT.x + 10, Math.min(BELT.x + BELT.w - 20, sb.x)),
            y: BELT.y + BELT.h / 2,
            r: BELT.bagR,
            color: sb.color
        });
        state.draggingBag = null;
        tone(240, 0.08, "sine", 0.05);
    }

    let activePointerId = null;

    function onPointerDown(e) {
        ensureAudio();
        if (!state.running) return;
        const { x, y } = canvasPos(e);
        for (let i = state.bags.length - 1; i >= 0; i--) {
            const b = state.bags[i];
            if (Math.hypot(b.x - x, b.y - y) <= b.r + 8) {
                state.draggingBag = { color: b.color, x, y };
                state.bags.splice(i, 1);
                activePointerId = e.pointerId;
                if (canvas.setPointerCapture) {
                    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
                }
                tone(520, 0.07, "square", 0.05);
                break;
            }
        }
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (activePointerId !== e.pointerId || !state.draggingBag) return;
        const { x, y } = canvasPos(e);
        state.draggingBag.x = x;
        state.draggingBag.y = y;
        e.preventDefault();
    }

    function onPointerUp(e) {
        if (activePointerId !== e.pointerId) return;
        activePointerId = null;
        if (!state.draggingBag) return;
        const { x, y } = canvasPos(e);
        state.draggingBag.x = x;
        state.draggingBag.y = y;
        const plane = findPlaneAt(x, y);
        if (plane) {
            if (!tryLoadBag(plane) && state.draggingBag) {
                returnBagToBelt();
            }
        } else {
            returnBagToBelt();
        }
        e.preventDefault();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchend",   (e) => e.preventDefault(), { passive: false });

    function loop(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;
        update(dt);
        render();
        if (state.running) requestAnimationFrame(loop);
    }

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
        state.draggingBag = null;
        state.planes = PLANES.map(makePlane);
        state.confetti = [];
        state.floaters = [];
        state.bagSpawn = { next: 400 };
        state.lastTs = 0;

        scoreEl.textContent = "0";
        timeEl.textContent = ROUND_SECONDS;
        timeStatEl.classList.remove("low");
        overlay.classList.add("hidden");

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

        overlayTitle.textContent = "✈ Flight complete!";
        overlayMsg.textContent = `You scored ${state.score} delivering luggage. Fly again?`;
        startBtn.textContent = "Fly Again";
        overlay.classList.remove("hidden");
    }

    startBtn.addEventListener("click", startGame);

    // Initial preview so the canvas isn't blank.
    render();
})();
