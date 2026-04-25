(() => {
    // ---------- DOM refs ----------
    const stage = document.getElementById("stage");
    const canvas = document.getElementById("seahorse-canvas");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const scoreEl = document.getElementById("score");
    const livesEl = document.getElementById("lives");
    const timeEl = document.getElementById("time");
    const timeStatEl = document.getElementById("time-stat");
    const bestEl = document.getElementById("best");

    const W = canvas.width;   // 400
    const H = canvas.height;  // 600
    const ROUND_SECONDS = 60;
    const MAX_LIVES = 3;

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "seahorse-game-leaderboard";
    const LB_MAX = 20;

    const reduceMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduceMotion = () => reduceMotionMQ.matches;

    // ---------- Utilities ----------
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
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
    function lerp(a, b, k) { return a + (b - a) * k; }
    function randRange(lo, hi) { return lo + Math.random() * (hi - lo); }

    // ---------- Audio ----------
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function tone(freq, dur = 0.3, type = "sine", gain = 0.05) {
        const a = ensureAudio();
        if (!a) return;
        const osc = a.createOscillator();
        const g = a.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const now = a.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(gain, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(g).connect(a.destination);
        osc.start(now);
        osc.stop(now + dur + 0.02);
    }

    // ---------- State ----------
    const state = {
        running: false,
        score: 0,
        lives: MAX_LIVES,
        timeLeft: ROUND_SECONDS,
        elapsed: 0,
        lastTs: 0,
        pointer: { x: W / 2, y: H * 0.65 },
        seahorse: {
            x: W / 2,
            y: H * 0.65,
            facing: 1,         // +1 right, -1 left
            flap: 0,
            invulnUntil: 0
        },
        bubbles: [],
        jellies: [],
        sparkles: [],
        playerName: "",
        leaderboard: loadLeaderboard()
    };

    // ---------- Name prefill ----------
    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) {
        nameInput.value = savedName;
        playerNameEl.textContent = savedName;
    }
    bestEl.textContent = personalBest(savedName);
    livesEl.textContent = MAX_LIVES;

    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    // ---------- Input ----------
    function updatePointerFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches && e.touches.length > 0) {
            cx = e.touches[0].clientX;
            cy = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            cx = e.changedTouches[0].clientX;
            cy = e.changedTouches[0].clientY;
        } else {
            cx = e.clientX;
            cy = e.clientY;
        }
        if (cx === undefined || cy === undefined) return;
        state.pointer.x = (cx - rect.left) * (W / rect.width);
        state.pointer.y = (cy - rect.top) * (H / rect.height);
    }
    function onPointerMove(e) { updatePointerFromEvent(e); }
    function onTouchMove(e) {
        if (overlay.contains(e.target)) return;
        updatePointerFromEvent(e);
        e.preventDefault();
    }
    function onTouchStartOrEnd(e) {
        if (overlay.contains(e.target)) return;
        updatePointerFromEvent(e);
        e.preventDefault();
    }
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerdown", onPointerMove);
    stage.addEventListener("touchstart", onTouchStartOrEnd, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", (e) => {
        if (overlay.contains(e.target)) return;
        e.preventDefault();
    }, { passive: false });

    // ---------- Seahorse drawing ----------
    // Drawn from primitives — golden body with a coiled tail, snout, dorsal
    // fin, and a crest of small triangles along the back. Faces left or right
    // depending on which side of the pointer it is on.
    function drawSeahorse(s, t) {
        const flap = reduceMotion() ? 0 : Math.sin(t * 12);
        const invuln = state.elapsed < s.invulnUntil;
        // Flicker during invulnerability.
        if (invuln && Math.floor(state.elapsed / 80) % 2 === 0) return;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(s.facing, 1);

        // Soft halo behind the seahorse.
        const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, 30);
        halo.addColorStop(0, "rgba(255, 230, 150, 0.35)");
        halo.addColorStop(1, "rgba(255, 230, 150, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fill();

        // Body — curved spine made of stacked golden ellipses.
        const bodyHex = "#f5b341";
        const bellyHex = "#ffd884";
        const outline = "rgba(80, 45, 10, 0.85)";

        // Belly (lighter blob behind the main body).
        ctx.fillStyle = bellyHex;
        ctx.beginPath();
        ctx.ellipse(-4, 4, 10, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main body (a curving stack of segments).
        const segments = [
            { x:  0, y: -14, rx: 7,  ry: 8 },   // upper neck
            { x:  2, y:  -4, rx: 9,  ry: 10 },  // chest
            { x:  0, y:   8, rx: 9,  ry: 10 },  // belly
            { x: -4, y:  18, rx: 7,  ry: 8 }    // base of tail
        ];
        ctx.fillStyle = bodyHex;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.2;
        for (const seg of segments) {
            ctx.beginPath();
            ctx.ellipse(seg.x, seg.y, seg.rx, seg.ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        // Coiled tail — quadratic curve spiraling inward.
        ctx.strokeStyle = bodyHex;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, 24);
        ctx.quadraticCurveTo(-16, 30, -12, 40);
        ctx.quadraticCurveTo(-2, 48, -2, 38);
        ctx.quadraticCurveTo(-2, 32, -8, 34);
        ctx.stroke();
        // Tail outline.
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Head bump + snout.
        ctx.fillStyle = bodyHex;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(2, -22, 8, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Snout (thin triangle pointing forward).
        ctx.beginPath();
        ctx.moveTo(8, -22);
        ctx.quadraticCurveTo(18, -22, 18, -18);
        ctx.quadraticCurveTo(14, -19, 8, -19);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Crest of tiny fin spikes along the back of the head.
        ctx.fillStyle = "#ff8a3d";
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(-3 - i * 3, -28);
            ctx.lineTo(-1 - i * 3, -32);
            ctx.lineTo(0 - i * 3, -28);
            ctx.closePath();
            ctx.fill();
        }

        // Dorsal fin on the back (flutters with `flap`).
        ctx.save();
        ctx.translate(-6, -2);
        ctx.rotate(flap * 0.18);
        const finGrad = ctx.createLinearGradient(0, -6, 0, 8);
        finGrad.addColorStop(0, "rgba(255, 200, 120, 0.95)");
        finGrad.addColorStop(1, "rgba(240, 130, 60, 0.85)");
        ctx.fillStyle = finGrad;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.quadraticCurveTo(-12, 0, 0, 10);
        ctx.quadraticCurveTo(-2, 2, 0, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Eye.
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(4, -22, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1b2a3b";
        ctx.beginPath();
        ctx.arc(4.6, -21.6, 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ---------- Idle render loop ----------
    // Runs continuously so the seahorse follows the pointer even on the
    // overlay screen. The full game loop in a later commit will layer on
    // bubbles, jellyfish, and scoring.
    function idleStep(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;
        state.elapsed += dt * 1000;

        // Spring toward pointer.
        const k = 0.14;
        state.seahorse.x = lerp(state.seahorse.x, state.pointer.x, k);
        state.seahorse.y = lerp(state.seahorse.y, state.pointer.y, k);
        // Face the direction of travel.
        const dx = state.pointer.x - state.seahorse.x;
        if (Math.abs(dx) > 1) state.seahorse.facing = dx >= 0 ? 1 : -1;
        state.seahorse.flap += dt;

        ctx.clearRect(0, 0, W, H);
        drawSeahorse(state.seahorse, state.seahorse.flap);

        requestAnimationFrame(idleStep);
    }
    requestAnimationFrame(idleStep);

    // Temporary start handler — full startGame lands with the game loop.
    startBtn.addEventListener("click", () => {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
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
