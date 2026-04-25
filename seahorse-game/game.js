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

    // ---------- Render placeholder ----------
    // Game loop, drawing, and input handlers land in follow-up commits.
    function render() {
        ctx.clearRect(0, 0, W, H);
    }
    render();

    // Expose start hook so the overlay button doesn't error before the loop is wired.
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
