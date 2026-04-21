(() => {
    const canvas = document.getElementById("maze");
    const ctx = canvas.getContext("2d");
    const levelEl = document.getElementById("level");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const dbtns = document.querySelectorAll(".dbtn");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "maze-game-leaderboard";
    const LB_MAX = 20;

    const SIZES = [5, 6, 7, 8, 9, 10, 11];
    const WALL_COLOR = "#6a3f8f";
    const PATH_COLOR = "#fff6e8";
    const GOAL_TINT = "rgba(255, 196, 140, 0.45)";
    const START_TINT = "rgba(179, 227, 255, 0.45)";

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
        playerName: "",
        leaderboard: loadLeaderboard(),
        level: 1,
        score: 0,
        maze: null,
        cols: 5,
        rows: 5,
        player: { x: 0, y: 0 },
        goal: { x: 4, y: 4 },
        star: null,
        starGot: false,
        celebrateUntil: 0,
        sparkles: [],
    };

    function updateBestDisplay() {
        const name = (nameInput.value || state.playerName || "").trim().slice(0, 12);
        bestEl.textContent = name ? personalBest(name) : 0;
    }

    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) {
        nameInput.value = savedName;
        playerNameEl.textContent = savedName;
    }
    updateBestDisplay();

    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        updateBestDisplay();
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
    function tone({ freq = 440, endFreq = null, type = "sine", duration = 0.15, volume = 0.2, delay = 0 }) {
        const ac = ensureAudio();
        if (!ac) return;
        const t0 = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (endFreq != null) osc.frequency.linearRampToValueAtTime(endFreq, t0 + duration);
        gain.gain.setValueAtTime(volume, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
        osc.connect(gain).connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + duration);
    }
    function playHop() {
        tone({ freq: 520, endFreq: 780, type: "sine", duration: 0.08, volume: 0.18 });
    }
    function playBump() {
        tone({ freq: 180, endFreq: 120, type: "square", duration: 0.12, volume: 0.18 });
    }
    function playStar() {
        tone({ freq: 880, type: "triangle", duration: 0.1, volume: 0.2 });
        tone({ freq: 1175, type: "triangle", duration: 0.12, volume: 0.2, delay: 0.08 });
    }
    function playWin() {
        tone({ freq: 523, type: "triangle", duration: 0.14, volume: 0.22 });
        tone({ freq: 659, type: "triangle", duration: 0.14, volume: 0.22, delay: 0.14 });
        tone({ freq: 784, type: "triangle", duration: 0.14, volume: 0.22, delay: 0.28 });
        tone({ freq: 1047, type: "triangle", duration: 0.26, volume: 0.24, delay: 0.42 });
    }

    // ----- Maze generation (recursive backtracker) -----
    function generateMaze(cols, rows) {
        const cells = [];
        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                row.push({ x, y, t: true, r: true, b: true, l: true, visited: false });
            }
            cells.push(row);
        }
        const stack = [];
        const start = cells[0][0];
        start.visited = true;
        stack.push(start);

        while (stack.length) {
            const curr = stack[stack.length - 1];
            const opts = [];
            if (curr.y > 0 && !cells[curr.y - 1][curr.x].visited)
                opts.push({ cell: cells[curr.y - 1][curr.x], dir: "t" });
            if (curr.x < cols - 1 && !cells[curr.y][curr.x + 1].visited)
                opts.push({ cell: cells[curr.y][curr.x + 1], dir: "r" });
            if (curr.y < rows - 1 && !cells[curr.y + 1][curr.x].visited)
                opts.push({ cell: cells[curr.y + 1][curr.x], dir: "b" });
            if (curr.x > 0 && !cells[curr.y][curr.x - 1].visited)
                opts.push({ cell: cells[curr.y][curr.x - 1], dir: "l" });

            if (opts.length === 0) { stack.pop(); continue; }

            const pick = opts[Math.floor(Math.random() * opts.length)];
            if (pick.dir === "t") { curr.t = false; pick.cell.b = false; }
            if (pick.dir === "r") { curr.r = false; pick.cell.l = false; }
            if (pick.dir === "b") { curr.b = false; pick.cell.t = false; }
            if (pick.dir === "l") { curr.l = false; pick.cell.r = false; }
            pick.cell.visited = true;
            stack.push(pick.cell);
        }
        return cells;
    }

    // Pick a random non-corner cell that isn't on the start or goal for a bonus star.
    function pickStarCell(cols, rows) {
        for (let tries = 0; tries < 30; tries++) {
            const x = Math.floor(Math.random() * cols);
            const y = Math.floor(Math.random() * rows);
            if (x === 0 && y === 0) continue;
            if (x === cols - 1 && y === rows - 1) continue;
            return { x, y };
        }
        return { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
    }

    function newLevel() {
        const idx = Math.min(state.level - 1, SIZES.length - 1);
        const n = SIZES[idx];
        state.cols = n;
        state.rows = n;
        state.maze = generateMaze(n, n);
        state.player = { x: 0, y: 0 };
        state.goal = { x: n - 1, y: n - 1 };
        state.star = pickStarCell(n, n);
        state.starGot = false;
        state.sparkles = [];
        levelEl.textContent = state.level;
    }

    // ----- Sizing -----
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    // ----- Drawing -----
    function cellSize() {
        const rect = canvas.getBoundingClientRect();
        const pad = 14;
        const inner = Math.min(rect.width, rect.height) - pad * 2;
        return { size: inner / state.cols, pad, inner };
    }

    function drawCellFill(cx, cy, s, color) {
        ctx.fillStyle = color;
        ctx.fillRect(cx, cy, s, s);
    }

    function draw() {
        const rect = canvas.getBoundingClientRect();
        const W = rect.width, H = rect.height;
        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = PATH_COLOR;
        ctx.fillRect(0, 0, W, H);

        if (!state.maze) return;

        const { size, pad } = cellSize();
        const ox = (W - size * state.cols) / 2;
        const oy = (H - size * state.rows) / 2;

        // Highlight start and goal cells
        drawCellFill(ox + 0 * size, oy + 0 * size, size, START_TINT);
        drawCellFill(ox + state.goal.x * size, oy + state.goal.y * size, size, GOAL_TINT);

        // Walls
        ctx.strokeStyle = WALL_COLOR;
        ctx.lineWidth = Math.max(3, size * 0.08);
        ctx.lineCap = "round";
        for (let y = 0; y < state.rows; y++) {
            for (let x = 0; x < state.cols; x++) {
                const c = state.maze[y][x];
                const x0 = ox + x * size;
                const y0 = oy + y * size;
                const x1 = x0 + size;
                const y1 = y0 + size;
                if (c.t) line(x0, y0, x1, y0);
                if (c.r) line(x1, y0, x1, y1);
                if (c.b) line(x0, y1, x1, y1);
                if (c.l) line(x0, y0, x0, y1);
            }
        }

        // Goal emoji (carrot)
        drawEmoji("🥕", ox + state.goal.x * size + size / 2, oy + state.goal.y * size + size / 2, size * 0.7);

        // Bonus star
        if (state.star && !state.starGot) {
            drawEmoji("⭐", ox + state.star.x * size + size / 2, oy + state.star.y * size + size / 2, size * 0.55);
        }

        // Sparkles (celebration)
        const now = performance.now();
        state.sparkles = state.sparkles.filter((sp) => now < sp.until);
        for (const sp of state.sparkles) {
            const age = 1 - (sp.until - now) / sp.life;
            const alpha = Math.max(0, 1 - age);
            ctx.save();
            ctx.globalAlpha = alpha;
            const sy = sp.y - age * 30;
            drawEmoji(sp.glyph, sp.x, sy, size * 0.5);
            ctx.restore();
        }

        // Player (bunny)
        drawEmoji("🐰", ox + state.player.x * size + size / 2, oy + state.player.y * size + size / 2, size * 0.7);
    }

    function line(x0, y0, x1, y1) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    }
    function drawEmoji(glyph, x, y, size) {
        ctx.save();
        ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(glyph, x, y);
        ctx.restore();
    }

    function addSparkles() {
        const { size } = cellSize();
        const rect = canvas.getBoundingClientRect();
        const ox = (rect.width - size * state.cols) / 2;
        const oy = (rect.height - size * state.rows) / 2;
        const cx = ox + state.goal.x * size + size / 2;
        const cy = oy + state.goal.y * size + size / 2;
        const glyphs = ["✨", "🎉", "⭐", "💫"];
        const now = performance.now();
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * size * 0.6;
            state.sparkles.push({
                x: cx + Math.cos(angle) * r,
                y: cy + Math.sin(angle) * r,
                glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
                until: now + 800,
                life: 800,
            });
        }
    }

    // ----- Movement -----
    function canMove(dir) {
        const c = state.maze[state.player.y][state.player.x];
        if (dir === "up") return !c.t;
        if (dir === "right") return !c.r;
        if (dir === "down") return !c.b;
        if (dir === "left") return !c.l;
        return false;
    }

    function tryMove(dir) {
        if (!state.running) return;
        if (!canMove(dir)) {
            playBump();
            return;
        }
        if (dir === "up") state.player.y -= 1;
        if (dir === "down") state.player.y += 1;
        if (dir === "left") state.player.x -= 1;
        if (dir === "right") state.player.x += 1;
        playHop();

        if (state.star && !state.starGot && state.player.x === state.star.x && state.player.y === state.star.y) {
            state.starGot = true;
            state.score += 1;
            scoreEl.textContent = state.score;
            playStar();
        }

        if (state.player.x === state.goal.x && state.player.y === state.goal.y) {
            onReachGoal();
        }
        draw();
    }

    function onReachGoal() {
        state.score += 1;
        scoreEl.textContent = state.score;
        playWin();
        addSparkles();
        recordScoreSnapshot();
        state.running = false;
        setTimeout(() => {
            state.level += 1;
            newLevel();
            state.running = true;
            draw();
        }, 900);
    }

    // ----- Input -----
    document.addEventListener("keydown", (e) => {
        const map = {
            ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
            w: "up", a: "left", s: "down", d: "right",
            W: "up", A: "left", S: "down", D: "right",
        };
        const dir = map[e.key];
        if (dir) {
            e.preventDefault();
            tryMove(dir);
        }
    });

    dbtns.forEach((btn) => {
        const trigger = (e) => {
            e.preventDefault();
            tryMove(btn.dataset.dir);
        };
        btn.addEventListener("pointerdown", trigger);
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
        const absX = Math.abs(dx), absY = Math.abs(dy);
        const threshold = 18;
        if (Math.max(absX, absY) < threshold) return;
        if (absX > absY) tryMove(dx > 0 ? "right" : "left");
        else tryMove(dy > 0 ? "down" : "up");
    });
    canvas.addEventListener("pointercancel", () => { swipeStart = null; });

    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        canvas.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });

    // ----- Flow -----
    let sessionEntry = null;
    function recordScoreSnapshot() {
        if (!state.playerName || state.score <= 0) return;
        if (!sessionEntry) {
            sessionEntry = { name: state.playerName, score: state.score, at: Date.now() };
            state.leaderboard.push(sessionEntry);
        } else {
            sessionEntry.score = state.score;
            sessionEntry.at = Date.now();
        }
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.level = 1;
        state.score = 0;
        scoreEl.textContent = 0;
        sessionEntry = null;
        newLevel();
        overlay.classList.add("hidden");
        state.running = true;
        draw();
    }

    startBtn.addEventListener("click", startGame);

    // Initial sizing + empty canvas
    window.addEventListener("resize", resizeCanvas);
    // Preview maze on overlay screen
    state.maze = generateMaze(SIZES[0], SIZES[0]);
    state.cols = state.rows = SIZES[0];
    state.goal = { x: SIZES[0] - 1, y: SIZES[0] - 1 };
    state.star = pickStarCell(SIZES[0], SIZES[0]);
    resizeCanvas();
})();
