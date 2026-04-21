(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const GRID = 5;
    const CELL = W / GRID;

    const scoreEl = document.getElementById("score");
    const comboEl = document.getElementById("combo");
    const bestEl = document.getElementById("best");
    const timeEl = document.getElementById("time");
    const timeStatEl = document.getElementById("time-stat");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");

    const PALETTE = [
        { name: "red",    color: "#ff6b6b", dark: "#9b2f2f", glow: "rgba(255, 107, 107, 0.6)" },
        { name: "blue",   color: "#6cc4ff", dark: "#245a80", glow: "rgba(108, 196, 255, 0.6)" },
        { name: "green",  color: "#8dd9a3", dark: "#2e7a48", glow: "rgba(141, 217, 163, 0.6)" },
        { name: "yellow", color: "#ffd166", dark: "#a37a2a", glow: "rgba(255, 209, 102, 0.6)" },
    ];

    const STOPS = [
        { row: 0, col: 0, idx: 0 },
        { row: 0, col: GRID - 1, idx: 1 },
        { row: GRID - 1, col: GRID - 1, idx: 2 },
        { row: GRID - 1, col: 0, idx: 3 },
    ];

    const ROUND_MS = 90000;
    const COMBO_WINDOW_MS = 6000;
    const MOVE_MS = 110;
    const SPAWN_INTERVAL_MS = 2200;
    const INITIAL_PASSENGERS = 2;
    const MAX_ON_MAP = 3;
    const BUS_CAPACITY = 4;
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "bus-route-rush-leaderboard";
    const LB_MAX = 20;

    function loadLeaderboard() {
        try {
            const raw = localStorage.getItem(LB_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) {
            return [];
        }
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

    const state = {
        running: false,
        score: 0,
        combo: 1,
        lastDeliveryAt: -Infinity,
        timeLeft: ROUND_MS,
        bus: {
            row: 2, col: 2,
            fromRow: 2, fromCol: 2,
            facing: 0,
            animT: 0, animDur: 0,
            bounce: 0,
        },
        passengers: [],   // [{ row, col, idx, bornAt }]
        carried: [],      // [idx, idx, ...]
        popups: [],
        particles: [],
        spawnTimer: 0,
        leaderboard: loadLeaderboard(),
        playerName: "",
        timeLow: false,
        shake: 0,
    };

    // ----- Name input -----
    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) {
        nameInput.value = savedName;
        playerNameEl.textContent = savedName;
    }
    function updateBestDisplay() {
        const name = (nameInput.value || state.playerName || "").trim().slice(0, 12);
        bestEl.textContent = name ? personalBest(name) : 0;
    }
    updateBestDisplay();
    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        updateBestDisplay();
    });
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
    }

    // ----- Audio (Web Audio synth) -----
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function tone({ freq = 440, endFreq = null, type = "sine", duration = 0.15, volume = 0.2 }) {
        const ac = ensureAudio();
        if (!ac) return;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ac.currentTime);
        if (endFreq != null) osc.frequency.linearRampToValueAtTime(endFreq, ac.currentTime + duration);
        gain.gain.setValueAtTime(volume, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + duration);
    }
    function playPickup() {
        tone({ freq: 520, endFreq: 820, type: "triangle", duration: 0.12, volume: 0.2 });
    }
    function playDropoff(bonus) {
        const base = 620 + Math.min(bonus, 8) * 60;
        tone({ freq: base, endFreq: base * 1.5, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: base * 1.3, endFreq: base * 2, type: "triangle", duration: 0.14, volume: 0.18 }), 70);
        setTimeout(() => tone({ freq: base * 1.7, endFreq: base * 2.2, type: "triangle", duration: 0.18, volume: 0.16 }), 150);
    }
    function playHorn() {
        tone({ freq: 260, type: "square", duration: 0.12, volume: 0.18 });
    }
    function playMove() {
        tone({ freq: 180, type: "sine", duration: 0.04, volume: 0.07 });
    }
    function playTick() {
        tone({ freq: 540, type: "triangle", duration: 0.05, volume: 0.12 });
    }
    function playEnd() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }

    // ----- Helpers -----
    function cellKey(r, c) { return r * GRID + c; }
    function stopAt(r, c) {
        return STOPS.find(s => s.row === r && s.col === c) || null;
    }

    function trySpawnPassenger() {
        if (state.passengers.length >= MAX_ON_MAP) return false;
        const taken = new Set();
        STOPS.forEach(s => taken.add(cellKey(s.row, s.col)));
        taken.add(cellKey(state.bus.row, state.bus.col));
        state.passengers.forEach(p => taken.add(cellKey(p.row, p.col)));
        const options = [];
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (!taken.has(cellKey(r, c))) options.push({ r, c });
            }
        }
        if (options.length === 0) return false;
        const pick = options[Math.floor(Math.random() * options.length)];
        const idx = Math.floor(Math.random() * PALETTE.length);
        state.passengers.push({
            row: pick.r,
            col: pick.c,
            idx,
            bornAt: performance.now(),
        });
        return true;
    }

    function tryMove(dRow, dCol) {
        if (!state.running) return;
        const bus = state.bus;
        if (bus.animT < bus.animDur) return;
        const newRow = bus.row + dRow;
        const newCol = bus.col + dCol;
        if (newRow < 0 || newRow >= GRID || newCol < 0 || newCol >= GRID) return;
        bus.fromRow = bus.row;
        bus.fromCol = bus.col;
        bus.row = newRow;
        bus.col = newCol;
        bus.animT = 0;
        bus.animDur = MOVE_MS;
        if (dCol > 0) bus.facing = 0;
        else if (dCol < 0) bus.facing = Math.PI;
        else if (dRow > 0) bus.facing = Math.PI / 2;
        else if (dRow < 0) bus.facing = -Math.PI / 2;
        playMove();
    }

    function onBusArrived() {
        const bus = state.bus;
        bus.bounce = 6;

        // Pickup — while there's a passenger here and we have space
        while (state.carried.length < BUS_CAPACITY) {
            const i = state.passengers.findIndex(p => p.row === bus.row && p.col === bus.col);
            if (i < 0) break;
            const p = state.passengers[i];
            state.carried.push(p.idx);
            state.passengers.splice(i, 1);
            spawnPopup(bus.row, bus.col, "Hi!", PALETTE[p.idx].color);
            spawnConfetti(bus.row, bus.col, PALETTE[p.idx].color, 8, { small: true });
            playPickup();
        }

        // Dropoff — if on a colored stop and carrying any matching passengers
        const stop = stopAt(bus.row, bus.col);
        if (stop) {
            const delivered = state.carried.filter(i => i === stop.idx).length;
            if (delivered > 0) {
                state.carried = state.carried.filter(i => i !== stop.idx);
                const now = performance.now();
                if (now - state.lastDeliveryAt < COMBO_WINDOW_MS) {
                    state.combo = Math.min(state.combo + 1, 9);
                } else {
                    state.combo = 1;
                }
                state.lastDeliveryAt = now;
                const multiBonus = delivered > 1 ? delivered : 0;
                const gained = delivered * state.combo + multiBonus;
                state.score += gained;
                scoreEl.textContent = state.score;
                comboEl.textContent = state.combo;
                let text = "+" + gained;
                if (delivered > 1) text += " 🎉";
                if (state.combo > 1) text += " ×" + state.combo;
                spawnPopup(bus.row, bus.col, text, PALETTE[stop.idx].color);
                spawnConfetti(bus.row, bus.col, PALETTE[stop.idx].color, 18 + delivered * 8);
                state.shake = delivered > 1 ? 10 : 6;
                playDropoff(state.combo + delivered);
                // Refill map quickly after a delivery
                for (let k = 0; k < delivered; k++) trySpawnPassenger();
            }
        }
    }

    function spawnPopup(row, col, text, color) {
        state.popups.push({
            x: col * CELL + CELL / 2,
            y: row * CELL + CELL / 2,
            text, color,
            t: 0,
            life: 800,
        });
    }

    function spawnConfetti(row, col, color, count, opts = {}) {
        const x = col * CELL + CELL / 2;
        const y = row * CELL + CELL / 2;
        const palette = opts.small
            ? [color, "#ffffff"]
            : [color, "#ffffff", "#ffd166", "#6cc4ff", "#ff6b6b", "#8dd9a3"];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (opts.small ? 50 : 90) + Math.random() * (opts.small ? 80 : 200);
            state.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (opts.small ? 60 : 140),
                color: palette[Math.floor(Math.random() * palette.length)],
                t: 0,
                life: 600 + Math.random() * 500,
                size: 3 + Math.random() * (opts.small ? 3 : 5),
                rot: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 10,
            });
        }
    }

    // ----- Rendering -----
    function drawGrid() {
        ctx.fillStyle = "#1d2a1a";
        ctx.fillRect(0, 0, W, H);

        // Road cells
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const x = c * CELL;
                const y = r * CELL;
                const tint = (r + c) % 2 === 0 ? "#2a2a2e" : "#26262a";
                ctx.fillStyle = tint;
                ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
            }
        }

        ctx.strokeStyle = "rgba(255, 230, 140, 0.28)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        for (let i = 1; i < GRID; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL, 0);
            ctx.lineTo(i * CELL, H);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * CELL);
            ctx.lineTo(W, i * CELL);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    function drawStop(stop, tms) {
        const p = PALETTE[stop.idx];
        const x = stop.col * CELL;
        const y = stop.row * CELL;
        const cx = x + CELL / 2;
        const cy = y + CELL / 2;

        // Highlight ring if a matching carried passenger can be delivered here
        const canDeliver = state.carried.includes(stop.idx);
        if (canDeliver) {
            const pulse = (Math.sin(tms / 220) + 1) / 2;
            ctx.globalAlpha = 0.35 + pulse * 0.3;
            ctx.fillStyle = p.color;
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
            ctx.globalAlpha = 1;
        }

        // Pad under stop
        ctx.fillStyle = p.dark;
        roundRect(ctx, x + 6, y + 6, CELL - 12, CELL - 12, 10);
        ctx.fill();

        // Sign post
        ctx.fillStyle = "#b8bcc4";
        ctx.fillRect(cx - 2, cy - 2, 4, CELL / 2 - 8);

        // Sign head
        ctx.fillStyle = p.color;
        roundRect(ctx, cx - CELL * 0.28, cy - CELL * 0.28, CELL * 0.56, CELL * 0.32, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // "BUS" text
        ctx.fillStyle = "#1b2735";
        ctx.font = "bold " + Math.floor(CELL * 0.19) + "px Segoe UI, Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("BUS", cx, cy - CELL * 0.12);
    }

    function drawPassenger(p, tms) {
        const col = PALETTE[p.idx];
        const x = p.col * CELL + CELL / 2;
        const yBase = p.row * CELL + CELL / 2;
        const bob = Math.sin((tms + p.bornAt) / 220) * 3;
        const y = yBase + bob;

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(x, yBase + CELL * 0.28, CELL * 0.22, CELL * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = col.color;
        roundRect(ctx, x - CELL * 0.18, y - CELL * 0.05, CELL * 0.36, CELL * 0.3, 6);
        ctx.fill();

        // Head
        ctx.fillStyle = "#f3d7b5";
        ctx.beginPath();
        ctx.arc(x, y - CELL * 0.14, CELL * 0.13, 0, Math.PI * 2);
        ctx.fill();

        // Hair / cap
        ctx.fillStyle = col.dark;
        ctx.beginPath();
        ctx.arc(x, y - CELL * 0.17, CELL * 0.13, Math.PI, 0);
        ctx.fill();

        // Eyes
        ctx.fillStyle = "#1b2735";
        ctx.beginPath();
        ctx.arc(x - CELL * 0.05, y - CELL * 0.14, 1.6, 0, Math.PI * 2);
        ctx.arc(x + CELL * 0.05, y - CELL * 0.14, 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Smile
        ctx.strokeStyle = "#1b2735";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y - CELL * 0.11, CELL * 0.04, 0, Math.PI);
        ctx.stroke();

        // Waving arrow above passenger (their destination color)
        const arrowY = y - CELL * 0.4;
        ctx.fillStyle = col.color;
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, arrowY + 2);
        ctx.lineTo(x - 7, arrowY - 6);
        ctx.lineTo(x + 7, arrowY - 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function drawBus(tms) {
        const bus = state.bus;
        let t = bus.animDur > 0 ? Math.min(1, bus.animT / bus.animDur) : 1;
        t = 1 - Math.pow(1 - t, 2);
        const row = bus.fromRow + (bus.row - bus.fromRow) * t;
        const col = bus.fromCol + (bus.col - bus.fromCol) * t;
        const cx = col * CELL + CELL / 2;
        const cy = row * CELL + CELL / 2 - bus.bounce;

        const bw = CELL * 0.74;
        const bh = CELL * 0.44;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(bus.facing);

        // Halo glow when carrying any passenger
        if (state.carried.length > 0) {
            const pulse = (Math.sin(tms / 180) + 1) / 2;
            ctx.save();
            ctx.globalAlpha = 0.16 + pulse * 0.18;
            ctx.fillStyle = "#ffd166";
            ctx.beginPath();
            ctx.arc(0, 0, bw * 0.66, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(0, bh * 0.5 + 3, bw * 0.46, bh * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = "#ffd166";
        roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 7);
        ctx.fill();
        ctx.strokeStyle = "#5f4418";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Stripe
        ctx.fillStyle = "#e6a93a";
        ctx.fillRect(-bw / 2 + 2, -2, bw - 4, 4);

        // Windows with carried passenger heads peeking through
        const winCount = 3;
        const winY = -bh / 2 + 5;
        const winH = bh * 0.38;
        const winW = (bw * 0.55) / winCount;
        const winStart = -bw * 0.4;
        for (let i = 0; i < winCount; i++) {
            const wx = winStart + i * (winW + 3);
            ctx.fillStyle = "#b9e6ff";
            ctx.fillRect(wx, winY, winW, winH);
            const carriedIdx = state.carried[i];
            if (carriedIdx != null) {
                const p = PALETTE[carriedIdx];
                // Head
                ctx.fillStyle = "#f3d7b5";
                ctx.beginPath();
                ctx.arc(wx + winW / 2, winY + winH * 0.55, Math.min(winW, winH) * 0.32, 0, Math.PI * 2);
                ctx.fill();
                // Colored hat
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(wx + winW / 2, winY + winH * 0.42, Math.min(winW, winH) * 0.32, Math.PI, 0);
                ctx.fill();
            }
        }

        // "+N" indicator if we have more than what fits in the windows
        if (state.carried.length > winCount) {
            ctx.fillStyle = "#1b2735";
            ctx.font = "bold 10px Segoe UI, Roboto, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("+" + (state.carried.length - winCount),
                bw / 2 - 8, winY + winH / 2);
        }

        // Front windshield (slightly bigger at bus front)
        ctx.fillStyle = "#c9efff";
        ctx.fillRect(bw / 2 - 11, -bh / 2 + 4, 6, bh - 8);

        // Happy bus face on the front
        ctx.fillStyle = "#1b2735";
        ctx.beginPath();
        ctx.arc(bw / 2 - 4, -bh * 0.18, 1.6, 0, Math.PI * 2); // eye
        ctx.arc(bw / 2 - 4,  bh * 0.18, 1.6, 0, Math.PI * 2); // eye
        ctx.fill();
        // smile
        ctx.strokeStyle = "#1b2735";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(bw / 2 - 4, 0, 3, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();

        // Headlights
        ctx.fillStyle = "#fff6c2";
        ctx.beginPath();
        ctx.arc(bw / 2 - 2, -bh / 2 + 5, 2.2, 0, Math.PI * 2);
        ctx.arc(bw / 2 - 2, bh / 2 - 5, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Wheels
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(-bw * 0.28, bh / 2, 4, 0, Math.PI * 2);
        ctx.arc(bw * 0.28, bh / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Row of colored dots above the bus — one per rider — so kids can
        // see at a glance which colors are on board.
        if (state.carried.length > 0) {
            const dotR = 6;
            const gap = 4;
            const tagY = cy - CELL * 0.42;
            const rowW = state.carried.length * (dotR * 2) + (state.carried.length - 1) * gap;
            const padX = 6;
            const padY = 4;
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            roundRect(ctx, cx - rowW / 2 - padX, tagY - dotR - padY,
                rowW + padX * 2, dotR * 2 + padY * 2, dotR + padY);
            ctx.fill();
            let dx = cx - rowW / 2 + dotR;
            for (const idx of state.carried) {
                const p = PALETTE[idx];
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(dx, tagY, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.35)";
                ctx.lineWidth = 1;
                ctx.stroke();
                dx += dotR * 2 + gap;
            }
        }
    }

    function drawPopups(dt) {
        for (let i = state.popups.length - 1; i >= 0; i--) {
            const p = state.popups[i];
            p.t += dt;
            if (p.t >= p.life) {
                state.popups.splice(i, 1);
                continue;
            }
            const prog = p.t / p.life;
            const y = p.y - 34 * prog;
            ctx.globalAlpha = 1 - prog;
            ctx.fillStyle = p.color;
            ctx.font = "bold 18px Segoe UI, Roboto, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth = 3;
            ctx.strokeText(p.text, p.x, y);
            ctx.fillText(p.text, p.x, y);
            ctx.globalAlpha = 1;
        }
    }

    function drawParticles(dt) {
        const dts = dt / 1000;
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.t += dt;
            if (p.t >= p.life) { state.particles.splice(i, 1); continue; }
            p.x += p.vx * dts;
            p.y += p.vy * dts;
            p.vy += 420 * dts;
            p.rot += p.spin * dts;
            const prog = p.t / p.life;
            ctx.save();
            ctx.globalAlpha = 1 - prog;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    function drawComboTimer(tms) {
        if (state.combo <= 1) return;
        const elapsed = tms - state.lastDeliveryAt;
        const remaining = Math.max(0, 1 - elapsed / COMBO_WINDOW_MS);
        ctx.fillStyle = "rgba(255, 209, 102, 0.85)";
        ctx.fillRect(0, 0, W * remaining, 4);
    }

    // ----- Main loop -----
    let lastTime = performance.now();
    function loop(now) {
        const dt = now - lastTime;
        lastTime = now;

        if (state.running) {
            state.timeLeft -= dt;
            if (state.timeLeft <= 0) {
                timeEl.textContent = 0;
                endGame();
            } else {
                const prev = Number(timeEl.textContent);
                const curr = Math.ceil(state.timeLeft / 1000);
                if (curr !== prev) {
                    timeEl.textContent = curr;
                    if (curr <= 5) playTick();
                }
                const low = curr <= 10;
                if (low !== state.timeLow) {
                    state.timeLow = low;
                    timeStatEl.classList.toggle("low", low);
                }
            }

            // Passenger spawner
            state.spawnTimer -= dt;
            if (state.spawnTimer <= 0) {
                trySpawnPassenger();
                state.spawnTimer = SPAWN_INTERVAL_MS;
            }

            // Bus animation
            const bus = state.bus;
            if (bus.animT < bus.animDur) {
                bus.animT += dt;
                if (bus.animT >= bus.animDur) {
                    bus.animT = bus.animDur;
                    onBusArrived();
                }
            }
            if (bus.bounce > 0) bus.bounce = Math.max(0, bus.bounce - dt * 0.04);

            if (state.combo > 1 && now - state.lastDeliveryAt > COMBO_WINDOW_MS) {
                state.combo = 1;
                comboEl.textContent = state.combo;
            }

            if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 0.05);
        }

        // Render
        ctx.save();
        if (state.shake > 0) {
            ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        }
        drawGrid();
        STOPS.forEach(s => drawStop(s, now));
        state.passengers.forEach(p => drawPassenger(p, now));
        drawBus(now);
        drawParticles(dt);
        drawPopups(dt);
        drawComboTimer(now);
        ctx.restore();

        requestAnimationFrame(loop);
    }

    // ----- Round control -----
    function reset() {
        state.score = 0;
        state.combo = 1;
        state.lastDeliveryAt = -Infinity;
        state.timeLeft = ROUND_MS;
        state.timeLow = false;
        state.shake = 0;
        state.popups = [];
        state.particles = [];
        state.carried = [];
        state.passengers = [];
        state.spawnTimer = SPAWN_INTERVAL_MS;
        state.bus.row = 2;
        state.bus.col = 2;
        state.bus.fromRow = 2;
        state.bus.fromCol = 2;
        state.bus.animT = 0;
        state.bus.animDur = 0;
        state.bus.facing = 0;
        state.bus.bounce = 0;
        timeStatEl.classList.remove("low");
        scoreEl.textContent = 0;
        comboEl.textContent = 1;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        for (let i = 0; i < INITIAL_PASSENGERS; i++) trySpawnPassenger();
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        reset();
        overlay.classList.add("hidden");
        state.running = true;
        playHorn();
    }

    function endGame() {
        state.running = false;
        timeStatEl.classList.remove("low");
        state.timeLow = false;
        playEnd();

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();

        const rank = state.leaderboard.indexOf(entry);
        let msg = `${state.playerName} scored ${state.score}!`;
        if (rank === 0 && state.score > 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < 10) msg += ` You're rank #${rank + 1}.`;
        overlayTitle.textContent = "Route complete!";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Drive Again";
        overlay.classList.remove("hidden");
    }

    // ----- Input -----
    const keymap = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
        W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
    };
    window.addEventListener("keydown", (e) => {
        if (!keymap[e.key]) return;
        if (e.target && e.target.tagName === "INPUT") return;
        e.preventDefault();
        const [dr, dc] = keymap[e.key];
        tryMove(dr, dc);
    });

    document.querySelectorAll(".touch-btn[data-dir]").forEach((btn) => {
        btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            const dir = btn.dataset.dir;
            if (dir === "up") tryMove(-1, 0);
            else if (dir === "down") tryMove(1, 0);
            else if (dir === "left") tryMove(0, -1);
            else if (dir === "right") tryMove(0, 1);
        });
    });

    // Swipe on canvas
    let swipeStart = null;
    canvas.addEventListener("pointerdown", (e) => {
        swipeStart = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
        if (!swipeStart) return;
        const dx = e.clientX - swipeStart.x;
        const dy = e.clientY - swipeStart.y;
        swipeStart = null;
        const threshold = 20;
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            tryMove(0, dx > 0 ? 1 : -1);
        } else {
            tryMove(dy > 0 ? 1 : -1, 0);
        }
    });
    canvas.addEventListener("pointercancel", () => { swipeStart = null; });

    startBtn.addEventListener("click", startGame);

    requestAnimationFrame(loop);
})();
