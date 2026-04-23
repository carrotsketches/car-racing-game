(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const timeEl = document.getElementById("time");
    const timeStatEl = document.getElementById("time-stat");
    const houseEl = document.getElementById("house");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "crane-truck-leaderboard";
    const LB_MAX = 20;
    const ROUND_MS = 60000;

    const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#a855f7"];
    const TRUCK_COLORS = ["#ef4444", "#3b82f6"];

    const ARM_PIVOT_X = W / 2;
    const ARM_PIVOT_Y = 110;
    const ARM_LEN = 160;
    const ROPE_MIN = 30;
    const GROUND_Y = H - 110;
    const BLOCK_SIZE = 46;
    const PICKUP_RANGE = 30;
    const TRUCK_W = 130;
    const TRUCK_Y = H - 70;

    // "Build a house" feature
    const HOUSE_GOAL = 6;            // bricks needed to finish a house
    const HOUSE_BRICK_W = 20;
    const HOUSE_BRICK_H = 14;
    const HOUSE_COLS = 3;            // bricks per row in the house silhouette
    // Centred between the two inner block spawn slots (see spawnBlocks),
    // in the clear ground gap that doesn't overlap blocks, trucks, or the
    // crane tower treads.
    const HOUSE_CENTER_X = W / 2;
    const HOUSE_BASE_Y = GROUND_Y - 4;

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
        for (const e of state.leaderboard) if (e.name === name && e.score > best) best = e.score;
        return best;
    }
    function sanitizeName(raw) {
        const t = (raw || "").trim().slice(0, 12);
        return t || "Player";
    }

    const state = {
        running: false,
        score: 0,
        streak: 0,
        leaderboard: loadLeaderboard(),
        timeLeft: ROUND_MS,
        t: 0,
        omega: 1.2,
        carrying: null,
        rope: { len: ROPE_MIN, target: ROPE_MIN, dropping: false, raising: false },
        blocks: [],
        trucks: [],
        particles: [],
        playerName: "",
        timeLow: false,
        // build-a-house
        house: { bricks: [], built: 0, flashT: 0 },
    };

    function updateBestDisplay() {
        const name = (nameInput.value || state.playerName || "").trim().slice(0, 12);
        bestEl.textContent = name ? personalBest(name) : 0;
    }

    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) { nameInput.value = savedName; playerNameEl.textContent = savedName; }
    updateBestDisplay();
    if (houseEl) houseEl.textContent = `0/${HOUSE_GOAL}`;
    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        updateBestDisplay();
    });

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
    function playPickup() { tone({ freq: 520, endFreq: 780, duration: 0.12, volume: 0.22 }); }
    function playCorrect() {
        tone({ freq: 660, type: "triangle", duration: 0.12, volume: 0.22 });
        setTimeout(() => tone({ freq: 990, type: "triangle", duration: 0.18, volume: 0.24 }), 110);
    }
    function playWrong() { tone({ freq: 180, type: "sine", duration: 0.22, volume: 0.2 }); }
    function playTick() { tone({ freq: 540, type: "triangle", duration: 0.05, volume: 0.12 }); }
    function playEnd() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }

    function currentAngle() {
        const maxAngle = 0.95;
        return maxAngle * Math.sin(state.t * state.omega);
    }
    function hookPos() {
        const a = currentAngle();
        const tipX = ARM_PIVOT_X + Math.sin(a) * ARM_LEN;
        const tipY = ARM_PIVOT_Y + Math.cos(a) * ARM_LEN;
        return { x: tipX, y: tipY + state.rope.len, armAngle: a, tipX, tipY };
    }

    function spawnBlocks() {
        state.blocks = [];
        // 4 slots, all within the pendulum's horizontal reach
        // (ARM_PIVOT_X ± sin(MAX_ANGLE) * ARM_LEN ≈ [70, 330]) and leaving
        // a clear gap in the centre so the house silhouette has empty
        // ground to sit on.
        const xs = [80, W / 2 - 60, W / 2 + 60, W - 80];
        for (const x of xs) {
            state.blocks.push({
                x,
                y: GROUND_Y - BLOCK_SIZE / 2,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                taken: false,
            });
        }
    }
    function respawnBlock() {
        const empty = state.blocks.filter(b => b.taken);
        if (!empty.length) return;
        const b = empty[Math.floor(Math.random() * empty.length)];
        b.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        b.taken = false;
    }
    function spawnTrucks() {
        state.trucks = [
            { x: 90,       color: TRUCK_COLORS[0] },
            { x: W - 90,   color: TRUCK_COLORS[1] },
        ];
    }
    function nearestBlock(x) {
        let best = null, bestDx = Infinity;
        for (const b of state.blocks) {
            if (b.taken) continue;
            const dx = Math.abs(b.x - x);
            if (dx < PICKUP_RANGE && dx < bestDx) { best = b; bestDx = dx; }
        }
        return best;
    }
    function truckUnder(x) {
        for (const t of state.trucks) {
            if (Math.abs(t.x - x) < TRUCK_W / 2) return t;
        }
        return null;
    }

    function burstConfetti(x, y, color) {
        for (let i = 0; i < 24; i++) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 80 + Math.random() * 160;
            state.particles.push({
                x, y,
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp - 80,
                life: 1,
                color: Math.random() < 0.5 ? color : "#f5a524",
                size: 3 + Math.random() * 3,
            });
        }
    }

    function onTap() {
        if (!state.running) return;
        if (state.rope.dropping || state.rope.raising) return;
        if (state.carrying) {
            releaseBlock();
        } else {
            state.rope.dropping = true;
            // Upper bound on the rope length. The actual drop stops early
            // when the hook reaches the block's vertical level (see loop()),
            // so this just needs to be larger than any realistic drop --
            // GROUND_Y - ARM_PIVOT_Y is enough even when the arm is vertical.
            state.rope.target = GROUND_Y - ARM_PIVOT_Y;
        }
    }
    function releaseBlock() {
        const { x } = hookPos();
        const truck = truckUnder(x);
        if (truck && truck.color === state.carrying.color) {
            state.score += 1;
            state.streak += 1;
            scoreEl.textContent = state.score;
            playCorrect();
            addHouseBrick(state.carrying.color);
            if (state.streak >= 3) {
                burstConfetti(x, TRUCK_Y - 30, state.carrying.color);
                state.streak = 0;
            }
        } else {
            state.streak = 0;
            playWrong();
        }
        state.carrying = null;
        state.rope.raising = true;
        state.rope.target = ROPE_MIN;
    }

    function houseBrickPos(index) {
        // Stack bricks left-to-right, bottom-to-top in a small wall silhouette.
        const row = Math.floor(index / HOUSE_COLS);
        const col = index % HOUSE_COLS;
        const rowW = HOUSE_COLS * HOUSE_BRICK_W;
        const x = HOUSE_CENTER_X - rowW / 2 + col * HOUSE_BRICK_W + HOUSE_BRICK_W / 2;
        const y = HOUSE_BASE_Y - HOUSE_BRICK_H / 2 - row * HOUSE_BRICK_H;
        return { x, y };
    }

    function addHouseBrick(color) {
        const idx = state.house.bricks.length;
        const { x, y } = houseBrickPos(idx);
        state.house.bricks.push({ x, y, color });
        updateHouseHud();
        if (state.house.bricks.length >= HOUSE_GOAL) finishHouse();
    }

    function finishHouse() {
        state.house.built += 1;
        state.score += 5; // bonus for completing a house
        scoreEl.textContent = state.score;
        state.house.flashT = 1.2;
        // celebratory confetti above the completed house
        for (const b of state.house.bricks) burstConfetti(b.x, b.y, b.color);
        burstConfetti(HOUSE_CENTER_X, HOUSE_BASE_Y - 80, "#f5a524");
        playCorrect();
        setTimeout(() => tone({ freq: 880, type: "triangle", duration: 0.2, volume: 0.24 }), 220);
        // clear for the next house
        state.house.bricks = [];
        updateHouseHud();
    }

    function updateHouseHud() {
        if (!houseEl) return;
        houseEl.textContent = `${state.house.bricks.length}/${HOUSE_GOAL}` +
            (state.house.built ? ` (×${state.house.built})` : "");
    }

    function reset() {
        state.score = 0;
        state.streak = 0;
        state.timeLeft = ROUND_MS;
        state.t = 0;
        state.omega = 1.2;
        state.carrying = null;
        state.rope = { len: ROPE_MIN, target: ROPE_MIN, dropping: false, raising: false };
        state.particles = [];
        state.timeLow = false;
        state.house = { bricks: [], built: 0, flashT: 0 };
        timeStatEl.classList.remove("low");
        scoreEl.textContent = 0;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        updateHouseHud();
        spawnBlocks();
        spawnTrucks();
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
        let msg = `${state.playerName} delivered ${state.score} blocks!`;
        if (rank === 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < 10) msg += ` Rank #${rank + 1}.`;
        overlayTitle.textContent = "Time's up!";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Play Again";
        overlay.classList.remove("hidden");
    }

    function drawBackground() {
        ctx.clearRect(0, 0, W, H);
        // sky + ground are painted by canvas CSS gradient; overlay dust line
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.fillRect(0, GROUND_Y, W, 2);
    }
    function drawCrane() {
        const a = currentAngle();
        // base + treads
        ctx.fillStyle = "#333";
        ctx.fillRect(ARM_PIVOT_X - 50, ARM_PIVOT_Y + 120, 100, 28);
        ctx.fillStyle = "#1b2735";
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(ARM_PIVOT_X - 35 + i * 23, ARM_PIVOT_Y + 148, 10, 0, Math.PI * 2);
            ctx.fill();
        }
        // tower
        ctx.fillStyle = "#f5a524";
        ctx.fillRect(ARM_PIVOT_X - 14, ARM_PIVOT_Y, 28, 120);
        ctx.strokeStyle = "#b97010";
        ctx.lineWidth = 2;
        ctx.strokeRect(ARM_PIVOT_X - 14, ARM_PIVOT_Y, 28, 120);
        // arm (rotates about pivot)
        // Use -a so that in the rotated frame, local +y (arm's length axis)
        // maps to world (sin(a), cos(a)) -- matching the rope/hook math below.
        ctx.save();
        ctx.translate(ARM_PIVOT_X, ARM_PIVOT_Y);
        ctx.rotate(-a);
        ctx.fillStyle = "#f5a524";
        ctx.fillRect(-10, -18, 20, 18);
        ctx.fillRect(-6, 0, 12, ARM_LEN);
        ctx.strokeStyle = "#b97010";
        ctx.strokeRect(-6, 0, 12, ARM_LEN);
        // hook end marker
        ctx.restore();
        // rope + hook -- anchor the rope EXACTLY at the arm tip so the cable
        // and the hook are always connected.
        const tipX = ARM_PIVOT_X + Math.sin(a) * ARM_LEN;
        const tipY = ARM_PIVOT_Y + Math.cos(a) * ARM_LEN;
        const hookX = tipX;
        const hookY = tipY + state.rope.len;
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(hookX, hookY);
        ctx.stroke();
        // hook shape
        ctx.fillStyle = "#555";
        ctx.beginPath();
        ctx.moveTo(hookX - 8, hookY);
        ctx.lineTo(hookX + 8, hookY);
        ctx.lineTo(hookX + 5, hookY + 12);
        ctx.lineTo(hookX - 5, hookY + 12);
        ctx.closePath();
        ctx.fill();
        // carried block -- top edge sits flush with the hook's bottom tip
        // (the hook body extends 12 px below hookY), so the block visually
        // hangs snugly from the hook with no gap.
        if (state.carrying) {
            drawBlock3D(hookX, hookY + 12 + BLOCK_SIZE / 2, state.carrying.color);
        }
    }
    function drawBlock3D(x, y, color) {
        const bx = x - BLOCK_SIZE / 2, by = y - BLOCK_SIZE / 2;
        // Drop shadow
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(bx + 4, by + 4, BLOCK_SIZE, BLOCK_SIZE);
        // Main face
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, BLOCK_SIZE, BLOCK_SIZE);
        // Dark outline
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, BLOCK_SIZE, BLOCK_SIZE);
        // Top highlight strip (3D sheen)
        ctx.fillStyle = "rgba(255,255,255,0.30)";
        ctx.fillRect(bx + 2, by + 2, BLOCK_SIZE - 4, 9);
        // Left highlight strip
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(bx + 2, by + 11, 7, BLOCK_SIZE - 13);
        // Bottom-right shadow strip
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(bx + 2, by + BLOCK_SIZE - 9, BLOCK_SIZE - 4, 7);
    }
    function drawBlocks() {
        for (const b of state.blocks) {
            if (b.taken) continue;
            drawBlock3D(b.x, b.y, b.color);
        }
    }
    function drawTrucks() {
        for (const t of state.trucks) {
            // Colored floor zone under this truck
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = t.color;
            ctx.fillRect(t.x - TRUCK_W / 2 - 4, GROUND_Y, TRUCK_W + 8, H - GROUND_Y);
            ctx.restore();

            // Pulse + arrow on the matching truck while carrying
            if (state.carrying && state.carrying.color === t.color) {
                const pulse = 0.5 + 0.5 * Math.sin(state.t * 6);
                ctx.save();
                ctx.shadowColor = t.color;
                ctx.shadowBlur = 14 + 10 * pulse;
                ctx.strokeStyle = t.color;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.65 + 0.35 * pulse;
                ctx.strokeRect(t.x - TRUCK_W / 2 - 4, TRUCK_Y - 52, TRUCK_W + 8, 95);
                ctx.restore();
                const bounce = Math.sin(state.t * 5) * 5;
                ctx.save();
                ctx.fillStyle = "#fff";
                ctx.font = "bold 22px 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                ctx.fillText("▼", t.x, TRUCK_Y - 60 + bounce);
                ctx.restore();
            }

            // Truck body (flatbed)
            ctx.fillStyle = t.color;
            ctx.fillRect(t.x - TRUCK_W / 2, TRUCK_Y - 30, TRUCK_W, 36);

            // Dashed delivery-zone outline on the flatbed
            ctx.save();
            ctx.setLineDash([5, 3]);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(t.x - TRUCK_W / 2 + 6, TRUCK_Y - 26, TRUCK_W - 12, 28);
            ctx.setLineDash([]);
            ctx.restore();

            // "DELIVER" label on the flatbed
            ctx.save();
            ctx.fillStyle = "rgba(255,255,255,0.72)";
            ctx.font = "bold 9px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("DELIVER", t.x + 14, TRUCK_Y - 12);
            ctx.restore();

            // Cabin
            ctx.fillStyle = "#1b2735";
            ctx.fillRect(t.x - TRUCK_W / 2 + 10, TRUCK_Y - 48, 34, 22);
            // Cabin window
            ctx.fillStyle = "rgba(100,180,255,0.35)";
            ctx.fillRect(t.x - TRUCK_W / 2 + 14, TRUCK_Y - 44, 24, 14);

            // Wheels
            ctx.fillStyle = "#222";
            ctx.beginPath();
            ctx.arc(t.x - TRUCK_W / 2 + 22, TRUCK_Y + 12, 10, 0, Math.PI * 2);
            ctx.arc(t.x + TRUCK_W / 2 - 22, TRUCK_Y + 12, 10, 0, Math.PI * 2);
            ctx.fill();
            // Wheel hubcaps
            ctx.fillStyle = "#555";
            ctx.beginPath();
            ctx.arc(t.x - TRUCK_W / 2 + 22, TRUCK_Y + 12, 4, 0, Math.PI * 2);
            ctx.arc(t.x + TRUCK_W / 2 - 22, TRUCK_Y + 12, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    function drawHouse(dt) {
        // Subtle zone background in the center gap between trucks
        const zoneX = HOUSE_CENTER_X - 55, zoneW = 110;
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#f5a524";
        ctx.fillRect(zoneX, GROUND_Y, zoneW, H - GROUND_Y);
        ctx.restore();

        // Ghost outline of the target house — visible enough to guide the player
        ctx.save();
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        for (let i = 0; i < HOUSE_GOAL; i++) {
            const { x, y } = houseBrickPos(i);
            ctx.strokeRect(x - HOUSE_BRICK_W / 2, y - HOUSE_BRICK_H / 2,
                           HOUSE_BRICK_W, HOUSE_BRICK_H);
        }
        // Ghost roof outline
        const rowW = HOUSE_COLS * HOUSE_BRICK_W;
        const ghostRoofBaseY = HOUSE_BASE_Y - Math.ceil(HOUSE_GOAL / HOUSE_COLS) * HOUSE_BRICK_H;
        ctx.beginPath();
        ctx.moveTo(HOUSE_CENTER_X - rowW / 2 - 4, ghostRoofBaseY);
        ctx.lineTo(HOUSE_CENTER_X + rowW / 2 + 4, ghostRoofBaseY);
        ctx.lineTo(HOUSE_CENTER_X, ghostRoofBaseY - 28);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // "🏠 HOUSE" label above the ghost
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = "#f5e6a3";
        ctx.font = "bold 10px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("🏠 BUILD", HOUSE_CENTER_X, ghostRoofBaseY - 32);
        ctx.restore();

        // Delivered bricks
        for (const b of state.house.bricks) {
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x - HOUSE_BRICK_W / 2, b.y - HOUSE_BRICK_H / 2,
                         HOUSE_BRICK_W, HOUSE_BRICK_H);
            ctx.strokeStyle = "rgba(0,0,0,0.35)";
            ctx.strokeRect(b.x - HOUSE_BRICK_W / 2, b.y - HOUSE_BRICK_H / 2,
                           HOUSE_BRICK_W, HOUSE_BRICK_H);
        }

        // Roof peak once the first full row is down, and fully on completion.
        const done = state.house.bricks.length;
        if (done >= HOUSE_COLS) {
            const rows = Math.ceil(done / HOUSE_COLS);
            const roofRowW = HOUSE_COLS * HOUSE_BRICK_W;
            const roofBaseY = HOUSE_BASE_Y - rows * HOUSE_BRICK_H;
            ctx.fillStyle = "#b23a3a";
            ctx.beginPath();
            ctx.moveTo(HOUSE_CENTER_X - roofRowW / 2 - 4, roofBaseY);
            ctx.lineTo(HOUSE_CENTER_X + roofRowW / 2 + 4, roofBaseY);
            ctx.lineTo(HOUSE_CENTER_X, roofBaseY - 28);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.stroke();
        }

        // "House Built!" flash after completion
        if (state.house.flashT > 0) {
            state.house.flashT = Math.max(0, state.house.flashT - dt);
            const a = Math.min(1, state.house.flashT / 1.2);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = "#f5a524";
            ctx.font = "bold 26px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("House Built!", W / 2, H / 2 - 40);
            ctx.font = "16px 'Segoe UI', sans-serif";
            ctx.fillStyle = "#fff";
            ctx.fillText("+5 bonus", W / 2, H / 2 - 12);
            ctx.restore();
        }
    }

    function drawHint() {
        if (!state.running) return;
        let text = null;
        if (state.carrying) {
            text = "Got it! Tap again when over the glowing truck ▼";
        } else if (!state.rope.dropping && !state.rope.raising) {
            text = "Tap to drop the hook onto a block";
        }
        if (!text) return;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.48)";
        ctx.fillRect(W / 2 - 168, H - 46, 336, 28);
        ctx.fillStyle = state.carrying ? "#fde68a" : "#e8eef7";
        ctx.font = "13px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, W / 2, H - 32);
        ctx.restore();
    }

    function drawParticles(dt) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 280 * dt;
            p.life -= dt * 1.1;
            if (p.life <= 0) { state.particles.splice(i, 1); continue; }
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.globalAlpha = 1;
        }
    }

    let lastTime = performance.now();
    function loop(now) {
        const dtMs = now - lastTime;
        lastTime = now;
        const dt = dtMs / 1000;

        drawBackground();

        if (state.running) {
            state.timeLeft -= dtMs;
            if (state.timeLeft <= 0) {
                timeEl.textContent = 0;
                endGame();
            } else {
                const curr = Math.ceil(state.timeLeft / 1000);
                if (curr !== Number(timeEl.textContent)) {
                    timeEl.textContent = curr;
                    if (curr <= 5) playTick();
                }
                const low = curr <= 10;
                if (low !== state.timeLow) {
                    state.timeLow = low;
                    timeStatEl.classList.toggle("low", low);
                }
                state.t += dt;

                // rope animation
                const SPEED = 520;
                if (state.rope.dropping) {
                    state.rope.len = Math.min(state.rope.target, state.rope.len + SPEED * dt);
                    // Stop (and try pickup) as soon as the hook reaches the
                    // block's vertical level -- not at some fixed rope length
                    // -- so the swinging arm angle doesn't overshoot the
                    // blocks off the bottom of the canvas.
                    const hp = hookPos();
                    const blockY = GROUND_Y - BLOCK_SIZE / 2;
                    if (hp.y >= blockY || state.rope.len >= state.rope.target) {
                        state.rope.dropping = false;
                        // try pickup
                        const b = nearestBlock(hp.x);
                        if (b) {
                            state.carrying = { color: b.color };
                            b.taken = true;
                            respawnBlock();
                            playPickup();
                        } else {
                            playWrong();
                        }
                        state.rope.raising = true;
                        state.rope.target = ROPE_MIN;
                    }
                } else if (state.rope.raising) {
                    state.rope.len = Math.max(state.rope.target, state.rope.len - SPEED * dt);
                    if (state.rope.len <= state.rope.target) state.rope.raising = false;
                }
            }
        }

        drawHouse(dt);
        drawTrucks();
        drawBlocks();
        drawCrane();
        drawParticles(dt);
        drawHint();

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); onTap(); });
    window.addEventListener("keydown", (e) => {
        // Don't hijack keyboard activation of focused links/buttons
        // (e.g. pressing Enter on the "← Games" link or name input).
        if (e.target) {
            const tag = e.target.tagName;
            if (tag === "INPUT" || tag === "A" || tag === "BUTTON") return;
        }
        if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); onTap(); }
    });
    startBtn.addEventListener("click", startGame);

    ["touchstart", "touchmove", "touchend"].forEach(evt => {
        canvas.addEventListener(evt, e => e.preventDefault(), { passive: false });
    });
})();

(() => {
    const btn = document.getElementById("help-btn");
    const modal = document.getElementById("help-modal");
    const closeBtn = document.getElementById("help-close");
    if (!btn || !modal) return;
    btn.addEventListener("click", () => modal.removeAttribute("hidden"));
    closeBtn.addEventListener("click", () => modal.setAttribute("hidden", ""));
    modal.addEventListener("click", e => { if (e.target === modal) modal.setAttribute("hidden", ""); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") modal.setAttribute("hidden", ""); });
})();
