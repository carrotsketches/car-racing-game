(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const heartsEl = document.getElementById("hearts");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "critter-cruise-leaderboard";
    const LB_MAX = 20;

    const W = canvas.width;   // 480
    const H = canvas.height;  // 360
    const GROUND_Y = H - 70;  // base road surface y (hills oscillate around this)

    const GRAVITY = 2200;
    const JUMP_VELOCITY = -780;
    const MAX_FALL_SPEED = 1400;

    const CAR_X = 100;
    const CAR_W = 78;
    const CAR_H = 48;

    const MAX_HEARTS = 3;
    const INVINCIBLE_MS = 1200;

    const BASE_SPEED = 180;     // px/s
    const MAX_SPEED = 360;
    const SPEED_RAMP = 6;       // px/s added per second

    const BOOST_MS = 2000;
    const BOOST_MULT = 1.8;

    // Rolling-hill terrain: ground y at a given world x (world x = screen x + state.distance).
    function terrainY(worldX) {
        return GROUND_Y
            - Math.sin(worldX * 0.017) * 16
            - Math.sin(worldX * 0.006 + 1.3) * 10;
    }
    function groundAtScreen(screenX) {
        return terrainY(screenX + state.distance);
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
        for (const e of state.leaderboard) if (e.name === name && e.score > best) best = e.score;
        return best;
    }
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
    }

    const state = {
        running: false,
        score: 0,
        distance: 0,
        speed: BASE_SPEED,
        playerName: "",
        leaderboard: loadLeaderboard(),
        hearts: MAX_HEARTS,
        invincibleUntil: 0,
        boostUntil: 0,
        car: { y: GROUND_Y - CAR_H, vy: 0, grounded: true, bounce: 0, tilt: 0 },
        items: [],         // { x, yOffset, type: "coin"|"star"|"cone"|"booster", taken: false }
        clouds: [],
        trees: [],         // background trees (parallax)
        bushes: [],        // foreground bushes
        streaks: [],       // speed streaks during boost
        roadDashOffset: 0,
        nextItemIn: 0,
        flashUntil: 0,
    };

    for (let i = 0; i < 5; i++) state.clouds.push({ x: Math.random() * W, y: 30 + Math.random() * 80, s: 0.6 + Math.random() * 0.6 });
    for (let i = 0; i < 5; i++) state.trees.push({ x: Math.random() * W, h: 60 + Math.random() * 40, kind: Math.random() < 0.5 ? "pine" : "round" });
    for (let i = 0; i < 6; i++) state.bushes.push({ x: Math.random() * W, yOffset: 30 + Math.random() * 25 });

    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) {
        nameInput.value = savedName;
        playerNameEl.textContent = savedName;
    }
    bestEl.textContent = personalBest(savedName);

    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    function updateHearts() {
        heartsEl.textContent = "❤️".repeat(state.hearts) + "🤍".repeat(MAX_HEARTS - state.hearts);
    }
    updateHearts();

    // ----- Audio -----
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function tone({ freq = 440, endFreq = null, type = "sine", duration = 0.12, volume = 0.18 }) {
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
    function playJump()  { tone({ freq: 420, endFreq: 680, type: "triangle", duration: 0.12, volume: 0.16 }); }
    function playCoin()  { tone({ freq: 880, endFreq: 1320, type: "triangle", duration: 0.1, volume: 0.2 }); }
    function playStar()  { tone({ freq: 660, endFreq: 990, type: "sine", duration: 0.16, volume: 0.22 }); setTimeout(() => tone({ freq: 990, endFreq: 1320, type: "sine", duration: 0.16, volume: 0.22 }), 80); }
    function playHit()   { tone({ freq: 240, endFreq: 70, type: "square", duration: 0.28, volume: 0.22 }); }
    function playEnd()   { tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 }); setTimeout(() => tone({ freq: 392, type: "triangle", duration: 0.2, volume: 0.22 }), 140); }
    function playBoost() {
        tone({ freq: 300, endFreq: 1100, type: "sawtooth", duration: 0.22, volume: 0.18 });
        setTimeout(() => tone({ freq: 700, endFreq: 1500, type: "triangle", duration: 0.28, volume: 0.16 }), 120);
    }

    // ----- Spawning -----
    // Items store `yOffset` relative to the ground at their current screen x,
    // so they bob with the hills naturally as they scroll past.
    function spawnItem() {
        const r = Math.random();
        let type;
        if (state.lastItemType === "cone") {
            // Never two cones in a row — player can't jump both
            type = r < 0.6 ? "coin" : "star";
        } else if (r < 0.45) {
            type = "coin";
        } else if (r < 0.72) {
            type = "star";
        } else if (r < 0.88) {
            type = "cone";
        } else {
            type = "booster";
        }

        let yOffset;
        if (type === "cone")         yOffset = -20;
        else if (type === "booster") yOffset = -6;
        else if (type === "star")    yOffset = -90 - Math.random() * 30;
        else                         yOffset = -30 - Math.random() * 40;

        state.items.push({ x: W + 40, yOffset, type, taken: false });
        state.lastItemType = type;
        return type;
    }

    // ----- Game flow -----
    function reset() {
        state.score = 0;
        state.distance = 0;
        state.speed = BASE_SPEED;
        state.hearts = MAX_HEARTS;
        state.invincibleUntil = 0;
        state.boostUntil = 0;
        state.items = [];
        state.streaks = [];
        state.lastItemType = null;
        state.nextItemIn = 500;
        state.roadDashOffset = 0;
        state.flashUntil = 0;
        state.car.y = groundAtScreen(CAR_X + CAR_W / 2) - CAR_H;
        state.car.vy = 0;
        state.car.grounded = true;
        state.car.bounce = 0;
        state.car.tilt = 0;
        scoreEl.textContent = 0;
        updateHearts();
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
        if (!state.running) return;
        state.running = false;
        playEnd();

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);

        const rank = state.leaderboard.indexOf(entry);
        let msg = `${state.playerName} scored ${state.score}!`;
        if (state.score > 0 && rank === 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < 10) msg += ` You're rank #${rank + 1}.`;

        overlayTitle.textContent = "Game Over";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Play Again";
        setTimeout(() => overlay.classList.remove("hidden"), 400);
    }

    function jump() {
        if (!state.running) return;
        if (state.car.grounded) {
            state.car.vy = JUMP_VELOCITY;
            state.car.grounded = false;
            playJump();
        }
    }

    // ----- Input -----
    startBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startGame();
    });
    canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        jump();
    });
    window.addEventListener("keydown", (e) => {
        if (e.code === "Space" || e.code === "ArrowUp") {
            e.preventDefault();
            if (state.running) jump();
            else if (!overlay.classList.contains("hidden") && document.activeElement !== nameInput) startGame();
        }
    });
    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        canvas.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });

    // ----- Update -----
    function update(dt) {
        // Clouds always drift
        for (const c of state.clouds) {
            c.x -= 10 * c.s * dt;
            if (c.x < -60) { c.x = W + 40; c.y = 30 + Math.random() * 80; c.s = 0.6 + Math.random() * 0.6; }
        }

        if (!state.running) return;

        // Ramp base speed; boost applies a multiplier on top
        state.speed = Math.min(MAX_SPEED, state.speed + SPEED_RAMP * dt);
        const now = performance.now();
        const boosting = now < state.boostUntil;
        const effectiveSpeed = boosting ? state.speed * BOOST_MULT : state.speed;

        // Distance-based score tick (1 point per ~30px)
        const prevDist = state.distance;
        state.distance += effectiveSpeed * dt;
        const distPts = Math.floor(state.distance / 30) - Math.floor(prevDist / 30);
        if (distPts > 0) {
            state.score += boosting ? distPts * 2 : distPts;
            scoreEl.textContent = state.score;
        }

        // Car physics against rolling terrain
        const carGroundY = groundAtScreen(CAR_X + CAR_W / 2) - CAR_H;
        state.car.vy += GRAVITY * dt;
        if (state.car.vy > MAX_FALL_SPEED) state.car.vy = MAX_FALL_SPEED;
        state.car.y += state.car.vy * dt;
        if (state.car.y >= carGroundY) {
            if (!state.car.grounded && state.car.vy > 300) state.car.bounce = 6;
            state.car.y = carGroundY;
            state.car.vy = 0;
            state.car.grounded = true;
        } else {
            // Falling off a hill crest
            state.car.grounded = false;
        }
        if (state.car.bounce > 0) state.car.bounce = Math.max(0, state.car.bounce - 30 * dt);

        // Tilt car to match local ground slope for a coaster feel
        const slope = (groundAtScreen(CAR_X + 18) - groundAtScreen(CAR_X - 18)) / 36;
        const targetTilt = state.car.grounded ? Math.atan(slope) : state.car.tilt * 0.9;
        state.car.tilt += (targetTilt - state.car.tilt) * Math.min(1, dt * 10);

        // Background parallax
        for (const t of state.trees) {
            t.x -= effectiveSpeed * 0.5 * dt;
            if (t.x < -40) { t.x = W + 40 + Math.random() * 60; t.h = 60 + Math.random() * 40; t.kind = Math.random() < 0.5 ? "pine" : "round"; }
        }
        for (const b of state.bushes) {
            b.x -= effectiveSpeed * dt;
            if (b.x < -40) { b.x = W + 40 + Math.random() * 60; b.yOffset = 30 + Math.random() * 25; }
        }

        // Road dash scroll
        state.roadDashOffset = (state.roadDashOffset + effectiveSpeed * dt) % 40;

        // Spawn items
        state.nextItemIn -= effectiveSpeed * dt;
        if (state.nextItemIn <= 0) {
            const spawned = spawnItem();
            const minGap = 110, maxGap = 260;
            state.nextItemIn = minGap + Math.random() * (maxGap - minGap);
            // After a cone, enforce a larger gap so the player can land + re-jump
            if (spawned === "cone") state.nextItemIn = Math.max(state.nextItemIn, 280);
            // Boosters deserve a bit of breathing room too
            if (spawned === "booster") state.nextItemIn = Math.max(state.nextItemIn, 200);
        }

        // Speed streaks while boosting
        if (boosting) {
            if (Math.random() < 0.55) {
                state.streaks.push({
                    x: CAR_X + CAR_W + 4,
                    y: state.car.y + 10 + Math.random() * (CAR_H - 10),
                    life: 0.35,
                    max: 0.35,
                    len: 20 + Math.random() * 30,
                });
            }
        }
        for (const s of state.streaks) {
            s.x -= (effectiveSpeed * 1.6) * dt;
            s.life -= dt;
        }
        state.streaks = state.streaks.filter((s) => s.life > 0 && s.x > -60);

        // Move and collide items
        for (const it of state.items) {
            it.x -= effectiveSpeed * dt;
            if (it.taken) continue;

            // Resolve item screen y from current ground at its x
            const itemY = groundAtScreen(it.x) + it.yOffset;

            if (it.type === "cone") {
                // Boost plows through cones harmlessly
                if (boosting || now <= state.invincibleUntil) continue;
                const coneHalfW = 9;
                const coneTipY = itemY - 16;
                const carLeft = CAR_X + 8;
                const carRight = CAR_X + CAR_W - 8;
                const carBottom = state.car.y + CAR_H;
                if (
                    carRight > it.x - coneHalfW &&
                    carLeft < it.x + coneHalfW &&
                    carBottom > coneTipY
                ) {
                    it.taken = true;
                    state.hearts -= 1;
                    updateHearts();
                    state.invincibleUntil = now + INVINCIBLE_MS;
                    state.flashUntil = now + 120;
                    playHit();
                    if (state.hearts <= 0) {
                        endGame();
                        return;
                    }
                }
                continue;
            }

            if (it.type === "booster") {
                // Pad sits on the road; auto-collect when car overlaps horizontally
                // and is near the ground (driving over, not sailing high above).
                const padHalfW = 16;
                const carLeft = CAR_X + 6;
                const carRight = CAR_X + CAR_W - 6;
                const carBottom = state.car.y + CAR_H;
                const padY = itemY;
                if (
                    carRight > it.x - padHalfW &&
                    carLeft < it.x + padHalfW &&
                    carBottom > padY - 24
                ) {
                    it.taken = true;
                    state.boostUntil = now + BOOST_MS;
                    state.score += 15;
                    scoreEl.textContent = state.score;
                    playBoost();
                }
                continue;
            }

            // Coins / stars: generous pickup radius so they feel snappy
            const ir = 18;
            if (
                it.x > CAR_X - ir && it.x < CAR_X + CAR_W + ir &&
                itemY > state.car.y - ir && itemY < state.car.y + CAR_H + ir
            ) {
                it.taken = true;
                if (it.type === "coin") {
                    state.score += 5;
                    playCoin();
                } else {
                    state.score += 20;
                    playStar();
                }
                scoreEl.textContent = state.score;
            }
        }

        // Cull off-screen items
        while (state.items.length && state.items[0].x < -40) state.items.shift();
    }

    // ----- Draw helpers -----
    function drawCloud(c) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(c.x,       c.y,      14 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 16,  c.y - 5,  11 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 28,  c.y,      13 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 14,  c.y + 5,  13 * c.s, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawCityBack() {
        ctx.fillStyle = "rgba(160, 180, 220, 0.55)";
        const baseY = GROUND_Y - 40;
        // Procedural skyline based on sine
        let x = 0;
        while (x < W) {
            const h = 40 + Math.abs(Math.sin(x * 0.13)) * 60;
            const w = 24 + Math.abs(Math.cos(x * 0.21)) * 18;
            ctx.fillRect(x, baseY - h, w, h);
            x += w + 2;
        }
    }

    function drawTree(t) {
        const baseY = groundAtScreen(t.x) - 2;
        if (t.kind === "pine") {
            // Trunk
            ctx.fillStyle = "#6b3f1d";
            ctx.fillRect(t.x - 3, baseY - 12, 6, 14);
            // Layered triangles
            ctx.fillStyle = "#2f7f34";
            ctx.strokeStyle = "#235f27";
            ctx.lineWidth = 1.5;
            const layers = 3;
            for (let i = 0; i < layers; i++) {
                const ly = baseY - 12 - i * (t.h / layers) * 0.6;
                const lw = 26 - i * 5;
                ctx.beginPath();
                ctx.moveTo(t.x, ly - t.h / layers * 0.9);
                ctx.lineTo(t.x - lw, ly);
                ctx.lineTo(t.x + lw, ly);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        } else {
            ctx.fillStyle = "#6b3f1d";
            ctx.fillRect(t.x - 3, baseY - 12, 6, 14);
            ctx.fillStyle = "#3ea64a";
            ctx.strokeStyle = "#2a7f34";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(t.x, baseY - 20 - t.h * 0.35, t.h * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    function drawBush(b) {
        const by = groundAtScreen(b.x + 10) + b.yOffset;
        ctx.fillStyle = "#4a9d57";
        ctx.strokeStyle = "#2f7a3c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x,      by, 10, 0, Math.PI * 2);
        ctx.arc(b.x + 10, by, 9,  0, Math.PI * 2);
        ctx.arc(b.x + 20, by, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    function drawRoad() {
        const step = 6;
        // Road surface: contoured polygon from terrain curve down 60px
        ctx.fillStyle = "#6c6c76";
        ctx.beginPath();
        ctx.moveTo(0, groundAtScreen(0));
        for (let x = step; x <= W; x += step) ctx.lineTo(x, groundAtScreen(x));
        ctx.lineTo(W, groundAtScreen(W) + 60);
        for (let x = W - step; x >= 0; x -= step) ctx.lineTo(x, groundAtScreen(x) + 60);
        ctx.closePath();
        ctx.fill();

        // Top edge highlight
        ctx.strokeStyle = "#4f4f58";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, groundAtScreen(0));
        for (let x = step; x <= W; x += step) ctx.lineTo(x, groundAtScreen(x));
        ctx.stroke();

        // Dashed center line, rotated along local slope
        ctx.fillStyle = "#fff";
        for (let x = -state.roadDashOffset; x < W; x += 40) {
            const gy = groundAtScreen(x);
            const localSlope = (groundAtScreen(x + 6) - groundAtScreen(x - 6)) / 12;
            ctx.save();
            ctx.translate(x, gy + 28);
            ctx.rotate(Math.atan(localSlope));
            ctx.fillRect(0, -2, 22, 4);
            ctx.restore();
        }
    }

    function drawCar() {
        const carY = state.car.y - state.car.bounce;
        const now = performance.now();
        const invis = now < state.invincibleUntil;
        if (invis && Math.floor(now / 80) % 2 === 0) return;

        // Shadow sits on the ground directly beneath the car
        const shadowY = groundAtScreen(CAR_X + CAR_W / 2) + 4;
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.beginPath();
        ctx.ellipse(CAR_X + CAR_W / 2, shadowY, CAR_W / 2 - 4, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pivot at the car's midpoint so tilt looks like the chassis is on the hill
        const pivotX = CAR_X + CAR_W / 2;
        const pivotY = carY + CAR_H;
        ctx.save();
        ctx.translate(pivotX, pivotY);
        ctx.rotate(state.car.tilt);
        ctx.translate(-pivotX, -pivotY);

        // Body lower
        ctx.fillStyle = "#ffd14d";
        ctx.strokeStyle = "#2b2416";
        ctx.lineWidth = 2;
        roundRect(CAR_X, carY + 16, CAR_W, CAR_H - 16, 10);
        ctx.fill();
        ctx.stroke();

        // Body upper (cabin)
        ctx.fillStyle = "#ffd14d";
        ctx.beginPath();
        ctx.moveTo(CAR_X + 14, carY + 16);
        ctx.quadraticCurveTo(CAR_X + 20, carY - 4, CAR_X + 36, carY - 4);
        ctx.lineTo(CAR_X + CAR_W - 20, carY - 4);
        ctx.quadraticCurveTo(CAR_X + CAR_W - 10, carY - 4, CAR_X + CAR_W - 8, carY + 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Window
        ctx.fillStyle = "#cde9ff";
        ctx.beginPath();
        ctx.moveTo(CAR_X + 20, carY + 14);
        ctx.quadraticCurveTo(CAR_X + 24, carY, CAR_X + 38, carY);
        ctx.lineTo(CAR_X + CAR_W - 22, carY);
        ctx.quadraticCurveTo(CAR_X + CAR_W - 14, carY, CAR_X + CAR_W - 12, carY + 14);
        ctx.closePath();
        ctx.fill();
        // Window frame
        ctx.strokeStyle = "#2b2416";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Driver (cute cat/fox head)
        const dx = CAR_X + 44;
        const dy = carY + 6;
        // Head
        ctx.fillStyle = "#e08a3a";
        ctx.strokeStyle = "#2b2416";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(dx, dy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Ears
        ctx.fillStyle = "#e08a3a";
        ctx.beginPath();
        ctx.moveTo(dx - 7, dy - 4);
        ctx.lineTo(dx - 10, dy - 12);
        ctx.lineTo(dx - 3, dy - 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(dx + 3, dy - 7);
        ctx.lineTo(dx + 10, dy - 12);
        ctx.lineTo(dx + 7, dy - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Snout + eye
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(dx + 2, dy + 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(dx + 3, dy, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Headlight — extra glow during boost
        const boosting = now < state.boostUntil;
        if (boosting) {
            ctx.fillStyle = "rgba(255, 220, 120, 0.55)";
            ctx.beginPath();
            ctx.arc(CAR_X + CAR_W - 6, carY + 28, 10, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "#fff4bc";
        ctx.strokeStyle = "#2b2416";
        ctx.beginPath();
        ctx.arc(CAR_X + CAR_W - 6, carY + 28, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Wheels
        const wheelY = carY + CAR_H - 2;
        drawWheel(CAR_X + 16, wheelY);
        drawWheel(CAR_X + CAR_W - 16, wheelY);

        ctx.restore();
    }

    function drawWheel(x, y) {
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#888";
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
    }

    function drawItem(it) {
        if (it.taken) return;
        const iy = groundAtScreen(it.x) + it.yOffset;
        if (it.type === "coin") {
            ctx.save();
            ctx.translate(it.x, iy);
            const wobble = 1 + Math.sin(performance.now() / 150 + it.x) * 0.1;
            ctx.scale(wobble, 1);
            ctx.fillStyle = "#f5c451";
            ctx.strokeStyle = "#a67a1d";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#b98a27";
            ctx.font = "bold 12px serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("$", 0, 1);
            ctx.restore();
        } else if (it.type === "star") {
            ctx.save();
            ctx.translate(it.x, iy);
            ctx.rotate(Math.sin(performance.now() / 300 + it.x) * 0.2);
            ctx.fillStyle = "#ffe066";
            ctx.strokeStyle = "#c79a1f";
            ctx.lineWidth = 1.5;
            drawStar(0, 0, 11, 5, 0.5);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else if (it.type === "cone") {
            // Traffic cone sitting on road, tilted with the slope
            const slope = (groundAtScreen(it.x + 6) - groundAtScreen(it.x - 6)) / 12;
            ctx.save();
            ctx.translate(it.x, iy + 10);
            ctx.rotate(Math.atan(slope));
            ctx.fillStyle = "#ff8232";
            ctx.strokeStyle = "#2b2416";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, -28);
            ctx.lineTo(-10, 0);
            ctx.lineTo(10, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.fillRect(-8, -12, 16, 3);
            ctx.fillRect(-6, -20, 12, 3);
            ctx.fillStyle = "#2b2416";
            ctx.fillRect(-12, 0, 24, 3);
            ctx.restore();
        } else if (it.type === "booster") {
            // Glowing chevron pad lying flat on the road, tilted with the slope
            const slope = (groundAtScreen(it.x + 6) - groundAtScreen(it.x - 6)) / 12;
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
            ctx.save();
            ctx.translate(it.x, iy + 4);
            ctx.rotate(Math.atan(slope));
            // Pad base
            ctx.fillStyle = "#1a1620";
            ctx.strokeStyle = "#ffb347";
            ctx.lineWidth = 2;
            roundRect(-18, -7, 36, 14, 4);
            ctx.fill();
            ctx.stroke();
            // Chevron arrows pointing forward (right)
            ctx.fillStyle = `rgba(255, 180, 60, ${0.55 + pulse * 0.45})`;
            for (let i = -1; i <= 1; i++) {
                const ax = i * 9 - 2;
                ctx.beginPath();
                ctx.moveTo(ax - 4, -4);
                ctx.lineTo(ax + 4, 0);
                ctx.lineTo(ax - 4, 4);
                ctx.lineTo(ax - 1, 0);
                ctx.closePath();
                ctx.fill();
            }
            // Glow halo
            ctx.fillStyle = `rgba(255, 220, 120, ${0.15 + pulse * 0.18})`;
            ctx.beginPath();
            ctx.ellipse(0, -2, 24, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawStar(cx, cy, outerR, points, innerRatio) {
        const innerR = outerR * innerRatio;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = -Math.PI / 2 + (i * Math.PI) / points;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);

        // Background
        for (const c of state.clouds) drawCloud(c);
        drawCityBack();
        for (const t of state.trees) drawTree(t);

        // Road
        drawRoad();

        // Foreground elements
        for (const it of state.items) drawItem(it);

        // Speed streaks behind/around the car while boosting
        for (const s of state.streaks) {
            const a = Math.max(0, s.life / s.max);
            ctx.fillStyle = `rgba(255, 210, 120, ${0.55 * a})`;
            ctx.fillRect(s.x, s.y, s.len, 2.5);
        }

        drawCar();
        for (const b of state.bushes) drawBush(b);

        // Boost tint overlay
        if (performance.now() < state.boostUntil) {
            ctx.fillStyle = "rgba(255, 180, 60, 0.08)";
            ctx.fillRect(0, 0, W, H);
        }

        // Hit flash
        if (performance.now() < state.flashUntil) {
            ctx.fillStyle = "rgba(255, 80, 80, 0.3)";
            ctx.fillRect(0, 0, W, H);
        }
    }

    // ----- Loop -----
    let lastTime = performance.now();
    function loop(now) {
        const dt = Math.min(0.033, (now - lastTime) / 1000);
        lastTime = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
})();
