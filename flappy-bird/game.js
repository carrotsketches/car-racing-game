(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "flappy-bird-leaderboard";
    const LB_MAX = 20;

    const W = canvas.width;
    const H = canvas.height;
    const GROUND_H = 64;
    const PLAY_H = H - GROUND_H;

    const GRAVITY = 1500;         // px/s^2
    const FLAP_VELOCITY = -430;   // px/s
    const MAX_FALL_SPEED = 700;

    const BIRD_X = Math.round(W * 0.28);
    const BIRD_R = 16;

    const PIPE_W = 62;
    const PIPE_GAP = 150;
    const PIPE_MIN_TOP = 60;
    const PIPE_SPACING = 220;     // horizontal distance between pipes
    const PIPE_SPEED = 150;       // px/s (scrolling left)

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
        started: false,
        score: 0,
        playerName: "",
        leaderboard: loadLeaderboard(),
        bird: { y: PLAY_H / 2, vy: 0, angle: 0 },
        pipes: [],
        groundScroll: 0,
        clouds: [
            { x: 60,  y: 80,  s: 0.6 },
            { x: 220, y: 140, s: 0.9 },
            { x: 340, y: 60,  s: 0.7 },
        ],
        flashUntil: 0,
    };

    // Prefill saved name
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
    function playFlap()  { tone({ freq: 560, endFreq: 720, type: "sine",     duration: 0.09, volume: 0.15 }); }
    function playPoint() { tone({ freq: 880, endFreq: 1320, type: "triangle", duration: 0.14, volume: 0.2  }); }
    function playHit()   { tone({ freq: 240, endFreq: 70,   type: "square",   duration: 0.3,  volume: 0.25 }); }

    // ----- Pipes -----
    function spawnPipe(x) {
        const maxTop = PLAY_H - PIPE_GAP - PIPE_MIN_TOP;
        const topH = PIPE_MIN_TOP + Math.random() * (maxTop - PIPE_MIN_TOP);
        state.pipes.push({ x, topH, passed: false });
    }

    function resetPipes() {
        state.pipes = [];
        // First pipe starts further out to give the player a moment
        let x = W + 120;
        for (let i = 0; i < 4; i++) {
            spawnPipe(x);
            x += PIPE_SPACING;
        }
    }

    // ----- Game flow -----
    function reset() {
        state.score = 0;
        scoreEl.textContent = 0;
        state.bird.y = PLAY_H / 2;
        state.bird.vy = 0;
        state.bird.angle = 0;
        state.groundScroll = 0;
        state.flashUntil = 0;
        resetPipes();
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
        state.started = true;
        // Give an initial flap so the bird doesn't instantly plummet
        state.bird.vy = FLAP_VELOCITY * 0.7;
    }

    function endGame() {
        if (!state.running) return;
        state.running = false;
        playHit();
        state.flashUntil = performance.now() + 120;

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
        // Small delay so the hit flash is visible
        setTimeout(() => overlay.classList.remove("hidden"), 450);
    }

    function flap() {
        if (!state.running) return;
        state.bird.vy = FLAP_VELOCITY;
        playFlap();
    }

    // ----- Input -----
    startBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startGame();
    });

    // Tap anywhere on the canvas to flap
    canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        flap();
    });

    window.addEventListener("keydown", (e) => {
        if (e.code === "Space" || e.code === "ArrowUp") {
            e.preventDefault();
            if (state.running) flap();
            else if (!overlay.classList.contains("hidden") && document.activeElement !== nameInput) {
                startGame();
            }
        }
    });

    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        canvas.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });

    // ----- Update -----
    function update(dt) {
        // Clouds always drift
        for (const c of state.clouds) {
            c.x -= 15 * c.s * dt;
            if (c.x < -60) c.x = W + 40 + Math.random() * 80;
        }

        if (!state.running) return;

        // Bird physics
        state.bird.vy += GRAVITY * dt;
        if (state.bird.vy > MAX_FALL_SPEED) state.bird.vy = MAX_FALL_SPEED;
        state.bird.y += state.bird.vy * dt;
        state.bird.angle = Math.max(-0.5, Math.min(1.1, state.bird.vy / 500));

        // Ground/ceiling
        if (state.bird.y + BIRD_R >= PLAY_H) {
            state.bird.y = PLAY_H - BIRD_R;
            endGame();
            return;
        }
        if (state.bird.y - BIRD_R <= 0) {
            state.bird.y = BIRD_R;
            state.bird.vy = 0;
        }

        // Pipes
        for (const p of state.pipes) p.x -= PIPE_SPEED * dt;

        // Recycle / spawn
        while (state.pipes.length && state.pipes[0].x + PIPE_W < -10) {
            state.pipes.shift();
        }
        const last = state.pipes[state.pipes.length - 1];
        if (!last || last.x < W - PIPE_SPACING) {
            spawnPipe((last ? last.x : W) + PIPE_SPACING);
        }

        // Scoring + collision
        for (const p of state.pipes) {
            const pipeRight = p.x + PIPE_W;
            if (!p.passed && pipeRight < BIRD_X - BIRD_R) {
                p.passed = true;
                state.score += 1;
                scoreEl.textContent = state.score;
                playPoint();
            }
            // Collision: bird circle vs pipe rects
            if (p.x < BIRD_X + BIRD_R && pipeRight > BIRD_X - BIRD_R) {
                const topY = p.topH;                  // bottom edge of top pipe
                const botY = p.topH + PIPE_GAP;       // top edge of bottom pipe
                if (state.bird.y - BIRD_R < topY || state.bird.y + BIRD_R > botY) {
                    endGame();
                    return;
                }
            }
        }

        // Ground scroll
        state.groundScroll = (state.groundScroll + PIPE_SPEED * dt) % 24;
    }

    // ----- Draw -----
    function drawBird() {
        const { y, angle } = state.bird;
        ctx.save();
        ctx.translate(BIRD_X, y);
        ctx.rotate(angle);

        // Body
        ctx.fillStyle = "#ffd66b";
        ctx.strokeStyle = "#2b2416";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Belly
        ctx.fillStyle = "#fff2c2";
        ctx.beginPath();
        ctx.ellipse(-2, 4, BIRD_R * 0.7, BIRD_R * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wing (flap based on velocity)
        const wingPhase = Math.sin(performance.now() / 70) * 0.4;
        const wingOffset = state.bird.vy < 0 ? -3 + wingPhase : 2 + wingPhase;
        ctx.fillStyle = "#f2a93a";
        ctx.strokeStyle = "#2b2416";
        ctx.beginPath();
        ctx.ellipse(-3, wingOffset, 9, 6, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eye
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(6, -4, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(7, -4, 2, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = "#f07a2b";
        ctx.strokeStyle = "#2b2416";
        ctx.beginPath();
        ctx.moveTo(BIRD_R - 2, -3);
        ctx.lineTo(BIRD_R + 9, 0);
        ctx.lineTo(BIRD_R - 2, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    function drawPipe(p) {
        const topH = p.topH;
        const botY = p.topH + PIPE_GAP;
        const botH = PLAY_H - botY;

        // Pipe body
        const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
        grad.addColorStop(0,   "#3c8a28");
        grad.addColorStop(0.4, "#7ac84a");
        grad.addColorStop(1,   "#2d6d1e");

        ctx.fillStyle = grad;
        ctx.fillRect(p.x, 0, PIPE_W, topH);
        ctx.fillRect(p.x, botY, PIPE_W, botH);

        // Lip
        ctx.fillStyle = "#3c8a28";
        ctx.fillRect(p.x - 4, topH - 18, PIPE_W + 8, 18);
        ctx.fillRect(p.x - 4, botY, PIPE_W + 8, 18);

        // Lip highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fillRect(p.x - 4, topH - 18, 6, 18);
        ctx.fillRect(p.x - 4, botY, 6, 18);

        // Outline
        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, 0, PIPE_W, topH);
        ctx.strokeRect(p.x, botY, PIPE_W, botH);
        ctx.strokeRect(p.x - 4, topH - 18, PIPE_W + 8, 18);
        ctx.strokeRect(p.x - 4, botY, PIPE_W + 8, 18);
    }

    function drawCloud(c) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(c.x,      c.y,      18 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 18, c.y - 6,  14 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 32, c.y,      16 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 16, c.y + 6,  18 * c.s, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawGround() {
        // Grass strip
        ctx.fillStyle = "#7cbb5a";
        ctx.fillRect(0, PLAY_H, W, 10);

        // Dirt
        ctx.fillStyle = "#b97a3a";
        ctx.fillRect(0, PLAY_H + 10, W, GROUND_H - 10);

        // Stripes
        ctx.fillStyle = "#a3662b";
        const stripeW = 24;
        for (let x = -state.groundScroll; x < W; x += stripeW) {
            ctx.fillRect(x, PLAY_H + 10, stripeW / 2, 8);
        }
    }

    function drawScore() {
        if (!state.started) return;
        ctx.save();
        ctx.font = "bold 48px 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillStyle = "#fff";
        const text = String(state.score);
        ctx.strokeText(text, W / 2, 20);
        ctx.fillText(text, W / 2, 20);
        ctx.restore();
    }

    function draw() {
        // Sky / background handled by CSS gradient, but clear explicitly
        ctx.clearRect(0, 0, W, H);

        for (const c of state.clouds) drawCloud(c);
        for (const p of state.pipes) drawPipe(p);

        drawGround();
        drawBird();
        drawScore();

        // Hit flash
        if (performance.now() < state.flashUntil) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
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
