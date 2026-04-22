(() => {
    // ---------- Constants ----------
    const CANVAS_W = 360;
    const CANVAS_H = 540;
    const ROUND_SECONDS = 60;
    const CARGO_MAX = 6;

    const HOME = { x: 180, y: 190 }; // airport hub on the world map

    // 6 cities, one per continent. x/y in canvas coords.
    const CITIES = [
        { id: "nyc",    name: "New York", country: "USA",       emoji: "🗽", color: "#ff4d5e", x:  78, y: 150, note: 523.25 },
        { id: "rio",    name: "Rio",      country: "Brazil",    emoji: "🏖️", color: "#3ddc84", x: 118, y: 278, note: 587.33 },
        { id: "paris",  name: "Paris",    country: "France",    emoji: "🗼", color: "#4ec0ff", x: 196, y: 130, note: 659.25 },
        { id: "cairo",  name: "Cairo",    country: "Egypt",     emoji: "🐪", color: "#ffd23f", x: 218, y: 210, note: 698.46 },
        { id: "tokyo",  name: "Tokyo",    country: "Japan",     emoji: "🏯", color: "#b36bff", x: 298, y: 174, note: 783.99 },
        { id: "sydney", name: "Sydney",   country: "Australia", emoji: "🦘", color: "#ff9f40", x: 306, y: 278, note: 880.00 }
    ];

    // Belt lives at the bottom of the canvas; bags travel left→right.
    const BELT = { x: 10, y: 440, w: 340, h: 70, bagR: 18 };

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

    // ---------- State ----------
    const state = {
        running: false,
        score: 0,
        timeLeft: ROUND_SECONDS,
        playerName: "",
        leaderboard: loadLeaderboard(),
        bags: [],        // on belt
        cargo: [],       // loaded on plane
        passengers: [],  // { cityId, color, spawnedAt }
        confetti: [],
        floaters: [],    // floating city-name text
        plane: { state: "idle", x: HOME.x, y: HOME.y, tx: HOME.x, ty: HOME.y, fromX: HOME.x, fromY: HOME.y, progress: 0, targetCity: null },
        bagSpawn: { next: 0, interval: 1500 },
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

    // Remaining modules (spawn, render, update, input, start/end) are added in follow-up commits.
    // Draw a static preview so the canvas isn't blank before the game is wired up.
    function drawPreview() {
        ctx.fillStyle = "#0b1830";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = "#9bb4e0";
        ctx.font = "bold 18px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText("✈ Airport Luggage", CANVAS_W / 2, CANVAS_H / 2 - 8);
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText("tap Start Flight", CANVAS_W / 2, CANVAS_H / 2 + 14);
    }
    drawPreview();

    startBtn.addEventListener("click", () => {
        // Temporary handler until startGame is implemented.
        ensureAudio();
        overlayMsg.textContent = "Game logic is being loaded in follow-up commits — check back soon!";
    });
})();
