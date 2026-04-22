(() => {
    // ---------- Constants ----------
    const CANVAS_W = 360;
    const CANVAS_H = 540;
    const ROUND_SECONDS = 60;
    const CARGO_CAP = 3;   // each plane takes off once it has this many matching bags

    // Three destinations, each paired with a same-colored plane.
    const CITIES = [
        { id: "nyc",    name: "New York", emoji: "🗽", color: "#ff4d5e", x:  90, y: 90, note: 523.25 },
        { id: "paris",  name: "Paris",    emoji: "🗼", color: "#4ec0ff", x: 180, y: 90, note: 659.25 },
        { id: "tokyo",  name: "Tokyo",    emoji: "🏯", color: "#b36bff", x: 270, y: 90, note: 783.99 }
    ];

    // Plane home positions — each plane sits below its matching city.
    const PLANE_Y = 320;
    const PLANES = CITIES.map((c) => ({
        id: c.id,
        color: c.color,
        destCity: c,
        homeX: c.x,
        homeY: PLANE_Y
    }));

    // Airport wrapper around planes + belt.
    const AIRPORT = { x: 10, y: 270, w: 340, h: 250, r: 14 };

    // Conveyor belt sits inside the airport at the bottom.
    const BELT = { x: 20, y: 450, w: 320, h: 60, bagR: 17 };

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

    function shade(hex, amt) {
        const h = hex.replace("#", "");
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        const t = amt < 0 ? 0 : 255;
        const p = Math.abs(amt);
        const mix = (c) => Math.round((t - c) * p + c);
        const to2 = (n) => n.toString(16).padStart(2, "0");
        return "#" + to2(mix(r)) + to2(mix(g)) + to2(mix(b));
    }

    // ---------- State ----------
    function makePlane(def) {
        return {
            id: def.id,
            color: def.color,
            destCity: def.destCity,
            homeX: def.homeX,
            homeY: def.homeY,
            x: def.homeX,
            y: def.homeY,
            fromX: def.homeX,
            fromY: def.homeY,
            tx: def.homeX,
            ty: def.homeY,
            cargo: [],         // [{color}, ...] up to CARGO_CAP
            state: "idle",     // idle | takeoff | flying | delivering | returning
            progress: 0,
            rejectUntil: 0     // shake/no timestamp cutoff
        };
    }

    const state = {
        running: false,
        score: 0,
        timeLeft: ROUND_SECONDS,
        playerName: "",
        leaderboard: loadLeaderboard(),
        bags: [],              // on belt
        flyingBags: [],        // bags arcing to a plane
        selectedBag: null,     // { color, x, y } — the bag the kid tapped, waiting for plane
        planes: PLANES.map(makePlane),
        confetti: [],
        floaters: [],
        bagSpawn: { next: 0 },
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

    // ---------- Stubs (expanded in follow-up commits) ----------
    function render() {
        ctx.fillStyle = "#6ec6ff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText("✈ Airport Luggage", CANVAS_W / 2, CANVAS_H / 2 - 8);
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText("tap Start Flight", CANVAS_W / 2, CANVAS_H / 2 + 14);
    }

    function update(dt) {
        if (!state.running) return;
        state.elapsed += dt * 1000;
        state.timeLeft = Math.max(0, ROUND_SECONDS - state.elapsed / 1000);
        timeEl.textContent = Math.ceil(state.timeLeft);
        if (state.timeLeft <= 10) timeStatEl.classList.add("low");
        else timeStatEl.classList.remove("low");
        if (state.timeLeft <= 0) endGame();
    }

    function loop(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;
        update(dt);
        render();
        if (state.running) requestAnimationFrame(loop);
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.running = true;
        state.score = 0;
        state.elapsed = 0;
        state.timeLeft = ROUND_SECONDS;
        state.bags = [];
        state.flyingBags = [];
        state.selectedBag = null;
        state.planes = PLANES.map(makePlane);
        state.confetti = [];
        state.floaters = [];
        state.bagSpawn = { next: 400 };
        state.lastTs = 0;

        scoreEl.textContent = "0";
        timeEl.textContent = ROUND_SECONDS;
        timeStatEl.classList.remove("low");
        overlay.classList.add("hidden");

        requestAnimationFrame(loop);
    }

    function endGame() {
        state.running = false;
        timeStatEl.classList.remove("low");
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);
        renderLeaderboard(state.playerName);

        overlayTitle.textContent = "✈ Flight complete!";
        overlayMsg.textContent = `You scored ${state.score} delivering luggage. Fly again?`;
        startBtn.textContent = "Fly Again";
        overlay.classList.remove("hidden");
    }

    startBtn.addEventListener("click", startGame);

    // Initial preview so the canvas isn't blank.
    render();
})();
