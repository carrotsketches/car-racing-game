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
    const COMBO_WINDOW_MS = 5000;
    const MOVE_MS = 120;
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
            facing: 0, // radians, 0 = right
            animT: 0, animDur: 0,
        },
        passenger: null,
        carrying: null,
        popups: [],
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
        tone({ freq: 520, endFreq: 780, type: "triangle", duration: 0.12, volume: 0.2 });
    }
    function playDropoff(combo) {
        const base = 640 + Math.min(combo, 6) * 60;
        tone({ freq: base, endFreq: base * 1.5, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: base * 1.3, endFreq: base * 2, type: "triangle", duration: 0.12, volume: 0.18 }), 70);
    }
    function playMove() {
        tone({ freq: 180, type: "sine", duration: 0.05, volume: 0.08 });
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
    function isStopCell(r, c) {
        return STOPS.some(s => s.row === r && s.col === c);
    }
    function stopAt(r, c) {
        return STOPS.find(s => s.row === r && s.col === c) || null;
    }

    function spawnPassenger() {
        const bus = state.bus;
        const taken = new Set();
        STOPS.forEach(s => taken.add(cellKey(s.row, s.col)));
        taken.add(cellKey(bus.row, bus.col));
        const options = [];
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (!taken.has(cellKey(r, c))) options.push({ r, c });
            }
        }
        const pick = options[Math.floor(Math.random() * options.length)];
        const idx = Math.floor(Math.random() * PALETTE.length);
        state.passenger = { row: pick.r, col: pick.c, idx, bob: 0 };
    }

    function tryMove(dRow, dCol) {
        if (!state.running) return;
        const bus = state.bus;
        if (bus.animT < bus.animDur) return; // still animating
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
        // Pickup
        if (state.carrying == null && state.passenger &&
            bus.row === state.passenger.row && bus.col === state.passenger.col) {
            state.carrying = state.passenger.idx;
            state.passenger = null;
            spawnPopup(bus.row, bus.col, "Board!", PALETTE[state.carrying].color);
            playPickup();
        }
        // Dropoff
        if (state.carrying != null) {
            const stop = stopAt(bus.row, bus.col);
            if (stop && stop.idx === state.carrying) {
                const now = performance.now();
                if (now - state.lastDeliveryAt < COMBO_WINDOW_MS) {
                    state.combo = Math.min(state.combo + 1, 9);
                } else {
                    state.combo = 1;
                }
                state.lastDeliveryAt = now;
                const gained = state.combo;
                state.score += gained;
                scoreEl.textContent = state.score;
                comboEl.textContent = state.combo;
                spawnPopup(bus.row, bus.col,
                    "+" + gained + (state.combo > 1 ? " ×" + state.combo : ""),
                    PALETTE[state.carrying].color);
                state.carrying = null;
                state.shake = 6;
                playDropoff(state.combo);
                spawnPassenger();
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

    // ----- Rendering -----
    function drawGrid() {
        // Grass background
        ctx.fillStyle = "#1d2a1a";
        ctx.fillRect(0, 0, W, H);

        // Road cells
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const x = c * CELL;
                const y = r * CELL;
                // Slight checker variation for depth
                const tint = (r + c) % 2 === 0 ? "#2a2a2e" : "#26262a";
                ctx.fillStyle = tint;
                ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
            }
        }

        // Lane dashes between cells
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

    function drawStop(stop) {
        const p = PALETTE[stop.idx];
        const x = stop.col * CELL;
        const y = stop.row * CELL;
        const cx = x + CELL / 2;
        const cy = y + CELL / 2;

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
        if (!p) return;
        const col = PALETTE[p.idx];
        const x = p.col * CELL + CELL / 2;
        const yBase = p.row * CELL + CELL / 2;
        const bob = Math.sin(tms / 250) * 3;
        const y = yBase + bob;

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(x, yBase + CELL * 0.28, CELL * 0.22, CELL * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body (colored shirt)
        ctx.fillStyle = col.color;
        roundRect(ctx, x - CELL * 0.18, y - CELL * 0.05, CELL * 0.36, CELL * 0.3, 6);
        ctx.fill();

        // Head
        ctx.fillStyle = "#f3d7b5";
        ctx.beginPath();
        ctx.arc(x, y - CELL * 0.14, CELL * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Hair / cap (dark on top)
        ctx.fillStyle = col.dark;
        ctx.beginPath();
        ctx.arc(x, y - CELL * 0.17, CELL * 0.12, Math.PI, 0);
        ctx.fill();

        // Waving arrow above passenger
        const arrowY = y - CELL * 0.38;
        ctx.fillStyle = col.color;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, arrowY);
        ctx.lineTo(x - 6, arrowY + 8);
        ctx.lineTo(x + 6, arrowY + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function drawBus(tms) {
        const bus = state.bus;
        let t = bus.animDur > 0 ? Math.min(1, bus.animT / bus.animDur) : 1;
        // ease-out
        t = 1 - Math.pow(1 - t, 2);
        const row = bus.fromRow + (bus.row - bus.fromRow) * t;
        const col = bus.fromCol + (bus.col - bus.fromCol) * t;
        const cx = col * CELL + CELL / 2;
        const cy = row * CELL + CELL / 2;

        const bw = CELL * 0.72;
        const bh = CELL * 0.42;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(bus.facing);

        // Halo glow when carrying a passenger (drawn behind the bus)
        if (state.carrying != null) {
            const glowCol = PALETTE[state.carrying];
            const pulse = (Math.sin(tms / 180) + 1) / 2;
            ctx.save();
            ctx.globalAlpha = 0.18 + pulse * 0.22;
            ctx.fillStyle = glowCol.glow;
            ctx.beginPath();
            ctx.arc(0, 0, bw * 0.62, 0, Math.PI * 2);
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
        roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 6);
        ctx.fill();
        ctx.strokeStyle = "#5f4418";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Stripe
        ctx.fillStyle = "#e6a93a";
        ctx.fillRect(-bw / 2 + 2, -2, bw - 4, 4);

        // Windows
        ctx.fillStyle = "#b9e6ff";
        const winH = bh * 0.38;
        const winY = -bh / 2 + 5;
        const winW = bw * 0.18;
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(-bw / 2 + 8 + i * (winW + 3), winY, winW, winH);
        }

        // Windshield (front) — larger window in front direction
        ctx.fillStyle = "#c9efff";
        ctx.fillRect(bw / 2 - 10, -bh / 2 + 4, 6, bh - 8);

        // Front headlight
        ctx.fillStyle = "#fff6c2";
        ctx.beginPath();
        ctx.arc(bw / 2 - 2, -bh / 2 + 6, 2.5, 0, Math.PI * 2);
        ctx.arc(bw / 2 - 2, bh / 2 - 6, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Wheels
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(-bw * 0.28, bh / 2, 4, 0, Math.PI * 2);
        ctx.arc(bw * 0.28, bh / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Destination sign above bus if carrying passenger
        if (state.carrying != null) {
            const col = PALETTE[state.carrying];
            ctx.fillStyle = col.color;
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1.5;
            roundRect(ctx, -bw * 0.18, -bh / 2 - 10, bw * 0.36, 9, 3);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
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
            const y = p.y - 30 * prog;
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
        // Draw a thin bar across the top of canvas
        const barW = W * remaining;
        ctx.fillStyle = "rgba(255, 209, 102, 0.85)";
        ctx.fillRect(0, 0, barW, 4);
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

            // Bus animation
            const bus = state.bus;
            if (bus.animT < bus.animDur) {
                bus.animT += dt;
                if (bus.animT >= bus.animDur) {
                    bus.animT = bus.animDur;
                    onBusArrived();
                }
            }

            // Combo expiry
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
        STOPS.forEach(drawStop);
        drawPassenger(state.passenger, now);
        drawBus(now);
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
        state.carrying = null;
        state.passenger = null;
        state.bus.row = 2;
        state.bus.col = 2;
        state.bus.fromRow = 2;
        state.bus.fromCol = 2;
        state.bus.animT = 0;
        state.bus.animDur = 0;
        state.bus.facing = 0;
        timeStatEl.classList.remove("low");
        scoreEl.textContent = 0;
        comboEl.textContent = 1;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        spawnPassenger();
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
        let msg = `${state.playerName} delivered ${state.score} ${state.score === 1 ? "point" : "points"} worth of passengers!`;
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
