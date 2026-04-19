(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const coinsEl = document.getElementById("coins");
    const heartsEl = document.getElementById("hearts");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const carPicker = document.getElementById("car-picker");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const leaderboardListEl = document.getElementById("leaderboard-list");

    const LB_KEY = "highway-dash-leaderboard";
    const NAME_KEY = "highway-dash-last-name";
    const LB_MAX = 20;
    const LB_SHOW = 10;

    const W = canvas.width;
    const H = canvas.height;
    const LANE_COUNT = 3;
    const LANE_WIDTH = W / LANE_COUNT;
    const CAR_W = 44;
    const CAR_H = 72;
    const COIN_SIZE = 26;
    const MAX_HEARTS = 3;
    const INVINCIBLE_MS = 1500;

    const PLAYER_COLORS = ["#f5c451", "#e74c3c", "#3498db", "#2ecc71", "#9b59b6"];
    const OBSTACLE_COLORS = ["#e67e22", "#1abc9c", "#ecf0f1", "#34495e", "#e84393"];

    const state = {
        running: false,
        player: { x: W / 2 - CAR_W / 2, y: H - CAR_H - 30, color: PLAYER_COLORS[0] },
        playerName: "",
        obstacles: [],
        coins: [],
        stripes: [],
        score: 0,
        coinCount: 0,
        leaderboard: loadLeaderboard(),
        lastRank: null,
        hearts: MAX_HEARTS,
        invincibleUntil: 0,
        speed: 3,
        baseSpeed: 3,
        maxSpeed: 7,
        spawnTimer: 0,
        coinTimer: 0,
        keys: {},
    };

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
        try {
            localStorage.setItem(LB_KEY, JSON.stringify(state.leaderboard));
        } catch (_) {}
    }

    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
    }

    function personalBest(name) {
        let best = 0;
        for (const entry of state.leaderboard) {
            if (entry.name === name && entry.score > best) best = entry.score;
        }
        return best;
    }

    function renderLeaderboard() {
        leaderboardListEl.innerHTML = "";
        const top = state.leaderboard.slice(0, LB_SHOW);
        if (top.length === 0) {
            const li = document.createElement("li");
            li.className = "empty";
            li.textContent = "No races yet — be the first!";
            leaderboardListEl.appendChild(li);
            return;
        }
        top.forEach((entry, i) => {
            const li = document.createElement("li");
            const isMe = state.lastRank != null && state.leaderboard[state.lastRank] === entry;
            if (isMe) li.classList.add("me");
            const rank = document.createElement("span");
            rank.className = "rank";
            rank.textContent = i + 1;
            const name = document.createElement("span");
            name.className = "name";
            name.textContent = entry.name;
            const score = document.createElement("span");
            score.className = "score";
            score.textContent = entry.score;
            li.append(rank, name, score);
            leaderboardListEl.appendChild(li);
        });
    }

    function updateBestDisplay() {
        bestEl.textContent = state.playerName ? personalBest(state.playerName) : 0;
    }

    // Prefill name input from storage
    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) {
        nameInput.value = savedName;
        playerNameEl.textContent = savedName;
        bestEl.textContent = personalBest(savedName);
    }

    nameInput.addEventListener("input", () => {
        const name = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = name || "—";
        bestEl.textContent = name ? personalBest(name) : 0;
    });

    renderLeaderboard();

    const STRIPE_COUNT = 10;
    for (let i = 0; i < STRIPE_COUNT; i++) {
        state.stripes.push({ y: (H / STRIPE_COUNT) * i });
    }

    // ----- Car picker -----
    function buildCarPicker() {
        PLAYER_COLORS.forEach((color, i) => {
            const btn = document.createElement("button");
            btn.className = "car-swatch" + (i === 0 ? " selected" : "");
            btn.style.background = color;
            btn.type = "button";
            btn.setAttribute("role", "radio");
            btn.setAttribute("aria-checked", i === 0 ? "true" : "false");
            btn.addEventListener("click", () => {
                state.player.color = color;
                carPicker.querySelectorAll(".car-swatch").forEach((el) => {
                    el.classList.toggle("selected", el === btn);
                    el.setAttribute("aria-checked", el === btn ? "true" : "false");
                });
                playBlip();
            });
            carPicker.appendChild(btn);
        });
    }
    buildCarPicker();

    // ----- Sounds (Web Audio synth, no files) -----
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
        if (endFreq != null) {
            osc.frequency.linearRampToValueAtTime(endFreq, ac.currentTime + duration);
        }
        gain.gain.setValueAtTime(volume, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + duration);
    }
    function playCoin() {
        tone({ freq: 880, endFreq: 1400, type: "sine", duration: 0.12, volume: 0.2 });
        setTimeout(() => tone({ freq: 1400, endFreq: 1760, type: "sine", duration: 0.1, volume: 0.15 }), 70);
    }
    function playBump() {
        tone({ freq: 180, endFreq: 80, type: "square", duration: 0.25, volume: 0.25 });
    }
    function playCrash() {
        tone({ freq: 220, endFreq: 60, type: "sawtooth", duration: 0.5, volume: 0.3 });
    }
    function playBlip() {
        tone({ freq: 520, type: "triangle", duration: 0.06, volume: 0.12 });
    }
    function playStart() {
        tone({ freq: 440, endFreq: 880, type: "triangle", duration: 0.2, volume: 0.2 });
    }

    // ----- Helpers -----
    function laneX(lane) {
        return lane * LANE_WIDTH + LANE_WIDTH / 2 - CAR_W / 2;
    }

    function laneCenter(lane) {
        return lane * LANE_WIDTH + LANE_WIDTH / 2;
    }

    function spawnObstacle() {
        // Keep at least one lane clear near the top so it's always dodgeable
        const SAFE_BAND = 320;
        const occupiedLanes = new Set();
        for (const o of state.obstacles) {
            if (o.y < SAFE_BAND) {
                occupiedLanes.add(Math.round((o.x - (LANE_WIDTH / 2 - CAR_W / 2)) / LANE_WIDTH));
            }
        }
        if (occupiedLanes.size >= LANE_COUNT - 1) return; // would wall off the road

        const choices = [];
        for (let l = 0; l < LANE_COUNT; l++) {
            if (!occupiedLanes.has(l)) choices.push(l);
        }
        const lane = choices[Math.floor(Math.random() * choices.length)];
        const color = OBSTACLE_COLORS[Math.floor(Math.random() * OBSTACLE_COLORS.length)];
        state.obstacles.push({
            x: laneX(lane),
            y: -CAR_H,
            color,
            speed: state.speed * (0.6 + Math.random() * 0.4),
        });
    }

    function spawnCoin() {
        const lane = Math.floor(Math.random() * LANE_COUNT);
        state.coins.push({
            x: laneCenter(lane) - COIN_SIZE / 2,
            y: -COIN_SIZE,
            spin: 0,
        });
    }

    function updateHeartsDisplay() {
        heartsEl.textContent = "❤️".repeat(state.hearts) + "🖤".repeat(MAX_HEARTS - state.hearts);
    }

    function reset() {
        state.player.x = W / 2 - CAR_W / 2;
        state.obstacles = [];
        state.coins = [];
        state.score = 0;
        state.coinCount = 0;
        state.hearts = MAX_HEARTS;
        state.invincibleUntil = 0;
        state.speed = state.baseSpeed;
        state.spawnTimer = 1500; // grace period before first car
        state.coinTimer = 900;
        scoreEl.textContent = 0;
        coinsEl.textContent = 0;
        updateHeartsDisplay();
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        state.lastRank = null;
        updateBestDisplay();
        reset();
        overlay.classList.add("hidden");
        state.running = true;
        playStart();
    }

    function recordScore() {
        const entry = {
            name: state.playerName,
            score: state.score,
            coins: state.coinCount,
            at: Date.now(),
        };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        state.lastRank = state.leaderboard.indexOf(entry);
        saveLeaderboard();
        renderLeaderboard();
        updateBestDisplay();
        return state.lastRank;
    }

    function gameOver() {
        state.running = false;
        playCrash();
        const rank = recordScore();
        let msg = `${state.playerName} scored ${state.score} with ${state.coinCount} coins.`;
        if (rank === 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < LB_SHOW) msg += ` You're rank #${rank + 1}!`;
        overlayTitle.textContent = "Crashed!";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Race Again";
        overlay.classList.remove("hidden");
    }

    function hitObstacle() {
        const now = performance.now();
        if (now < state.invincibleUntil) return;
        state.hearts -= 1;
        updateHeartsDisplay();
        if (state.hearts <= 0) {
            gameOver();
        } else {
            state.invincibleUntil = now + INVINCIBLE_MS;
            playBump();
        }
    }

    // ----- Update / render -----
    function update(dt) {
        if (!state.running) return;

        if (state.keys.left) state.player.x -= 7;
        if (state.keys.right) state.player.x += 7;
        if (state.keys.up) state.speed = Math.min(state.maxSpeed, state.speed + 0.05);
        if (state.keys.down) state.speed = Math.max(3, state.speed - 0.08);

        state.player.x = Math.max(4, Math.min(W - CAR_W - 4, state.player.x));

        for (const s of state.stripes) {
            s.y += state.speed;
            if (s.y > H) s.y -= H;
        }

        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
            spawnObstacle();
            state.spawnTimer = Math.max(700, 1400 - state.score * 0.8);
        }

        state.coinTimer -= dt;
        if (state.coinTimer <= 0) {
            spawnCoin();
            state.coinTimer = 700 + Math.random() * 900;
        }

        for (const o of state.obstacles) {
            o.y += state.speed + o.speed * 0.15;
        }
        state.obstacles = state.obstacles.filter((o) => {
            if (o.y > H) {
                state.score += 10;
                return false;
            }
            return true;
        });

        for (const c of state.coins) {
            c.y += state.speed;
            c.spin += dt * 0.008;
        }
        state.coins = state.coins.filter((c) => c.y <= H);

        state.speed = Math.min(state.maxSpeed, state.baseSpeed + state.score * 0.003);

        // Forgiving hitbox: a bit smaller than the drawn car
        const PAD_X = 6;
        const PAD_Y = 8;
        const playerHit = {
            x: state.player.x + PAD_X,
            y: state.player.y + PAD_Y,
            w: CAR_W - PAD_X * 2,
            h: CAR_H - PAD_Y * 2,
        };

        // Coin pickups use the full player rect (easier to grab)
        const playerFull = { x: state.player.x, y: state.player.y, w: CAR_W, h: CAR_H };
        state.coins = state.coins.filter((c) => {
            if (rectsOverlap(playerFull, { x: c.x, y: c.y, w: COIN_SIZE, h: COIN_SIZE })) {
                state.coinCount += 1;
                state.score += 5;
                playCoin();
                return false;
            }
            return true;
        });

        // Obstacle collisions use the smaller hitbox
        for (const o of state.obstacles) {
            const obsHit = { x: o.x + PAD_X, y: o.y + PAD_Y, w: CAR_W - PAD_X * 2, h: CAR_H - PAD_Y * 2 };
            if (rectsOverlap(playerHit, obsHit)) {
                // push obstacle past the player so one hit doesn't register repeatedly
                o.y = H + CAR_H;
                hitObstacle();
                if (!state.running) return;
                break;
            }
        }

        scoreEl.textContent = state.score;
        coinsEl.textContent = state.coinCount;
    }

    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function drawRoad() {
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#1f1f1f";
        ctx.fillRect(0, 0, 12, H);
        ctx.fillRect(W - 12, 0, 12, H);

        ctx.fillStyle = "#fff";
        for (let lane = 1; lane < LANE_COUNT; lane++) {
            const x = lane * LANE_WIDTH - 2;
            for (const s of state.stripes) {
                ctx.fillRect(x, s.y, 4, 30);
            }
        }
    }

    function drawCar(x, y, color) {
        ctx.fillStyle = color;
        roundRect(ctx, x, y, CAR_W, CAR_H, 8);
        ctx.fill();

        ctx.fillStyle = "rgba(20, 20, 30, 0.75)";
        roundRect(ctx, x + 6, y + 10, CAR_W - 12, 18, 4);
        ctx.fill();
        roundRect(ctx, x + 6, y + CAR_H - 28, CAR_W - 12, 18, 4);
        ctx.fill();

        ctx.fillStyle = "#111";
        ctx.fillRect(x - 3, y + 8, 4, 14);
        ctx.fillRect(x + CAR_W - 1, y + 8, 4, 14);
        ctx.fillRect(x - 3, y + CAR_H - 22, 4, 14);
        ctx.fillRect(x + CAR_W - 1, y + CAR_H - 22, 4, 14);
    }

    function drawCoin(c) {
        const cx = c.x + COIN_SIZE / 2;
        const cy = c.y + COIN_SIZE / 2;
        const wobble = Math.abs(Math.cos(c.spin));
        const rx = (COIN_SIZE / 2) * (0.35 + wobble * 0.65);
        const ry = COIN_SIZE / 2;

        ctx.save();
        ctx.translate(cx, cy);
        const grad = ctx.createLinearGradient(-rx, 0, rx, 0);
        grad.addColorStop(0, "#c88b1a");
        grad.addColorStop(0.5, "#ffd966");
        grad.addColorStop(1, "#c88b1a");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#b8860b";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (rx > 6) ctx.fillText("★", 0, 1);
        ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function render() {
        drawRoad();
        for (const o of state.obstacles) drawCar(o.x, o.y, o.color);
        for (const c of state.coins) drawCoin(c);

        const now = performance.now();
        const invincible = now < state.invincibleUntil;
        const blink = invincible && Math.floor(now / 100) % 2 === 0;
        if (!blink) drawCar(state.player.x, state.player.y, state.player.color);
    }

    let lastTime = performance.now();
    function loop(now) {
        const dt = now - lastTime;
        lastTime = now;
        update(dt);
        render();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    window.addEventListener("keydown", (e) => {
        if (e.target === nameInput) return;
        if (["ArrowLeft", "a", "A"].includes(e.key)) state.keys.left = true;
        if (["ArrowRight", "d", "D"].includes(e.key)) state.keys.right = true;
        if (["ArrowUp", "w", "W"].includes(e.key)) state.keys.up = true;
        if (["ArrowDown", "s", "S"].includes(e.key)) state.keys.down = true;
        if (e.key === " " && !state.running) startGame();
    });

    window.addEventListener("keyup", (e) => {
        if (["ArrowLeft", "a", "A"].includes(e.key)) state.keys.left = false;
        if (["ArrowRight", "d", "D"].includes(e.key)) state.keys.right = false;
        if (["ArrowUp", "w", "W"].includes(e.key)) state.keys.up = false;
        if (["ArrowDown", "s", "S"].includes(e.key)) state.keys.down = false;
    });

    startBtn.addEventListener("click", startGame);

    // ----- Touch / on-screen buttons -----
    const touchButtons = document.querySelectorAll(".touch-btn");
    touchButtons.forEach((btn) => {
        const key = btn.dataset.key;
        const press = (e) => {
            e.preventDefault();
            state.keys[key] = true;
            btn.classList.add("pressed");
            if (btn.setPointerCapture && e.pointerId != null) {
                try { btn.setPointerCapture(e.pointerId); } catch (_) {}
            }
            ensureAudio();
        };
        const release = (e) => {
            e.preventDefault();
            state.keys[key] = false;
            btn.classList.remove("pressed");
        };
        btn.addEventListener("pointerdown", press);
        btn.addEventListener("pointerup", release);
        btn.addEventListener("pointercancel", release);
        btn.addEventListener("pointerleave", release);
        btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    // Block double-tap zoom / scroll on the play area
    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        canvas.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });

    updateHeartsDisplay();
})();
