(() => {
    const board = document.getElementById("board");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const timeEl = document.getElementById("time");
    const timeStatEl = document.getElementById("time-stat");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");

    const HOLES = 9;
    const ROUND_MS = 60000;
    const MOLE_UP_MS = 1500;
    const BEE_UP_MS = 1700;
    const SPAWN_MIN = 650;
    const SPAWN_MAX = 1100;
    const BEE_CHANCE = 0.22;
    const MAX_ACTIVE = 3;
    const NAME_KEY = "highway-dash-last-name"; // share with other games
    const LB_KEY = "whack-a-mole-leaderboard";
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
        leaderboard: loadLeaderboard(),
        timeLeft: ROUND_MS,
        slots: [],
        lastSpawn: 0,
        nextSpawnIn: 0,
        playerName: "",
        timeLow: false,
    };

    // Build holes
    for (let i = 0; i < HOLES; i++) {
        const hole = document.createElement("div");
        hole.className = "hole";
        hole.dataset.index = i;
        const pop = document.createElement("div");
        pop.className = "pop";
        hole.appendChild(pop);
        hole.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            onHoleTap(i);
        });
        board.appendChild(hole);
        state.slots.push({ hole, pop, type: null, until: 0 });
    }

    function updateBestDisplay() {
        const name = (nameInput.value || state.playerName || "").trim().slice(0, 12);
        bestEl.textContent = name ? personalBest(name) : 0;
    }

    // Name prefill from shared key
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
    function playWhack() {
        tone({ freq: 720, endFreq: 1100, type: "sine", duration: 0.1, volume: 0.22 });
    }
    function playBee() {
        tone({ freq: 240, endFreq: 140, type: "square", duration: 0.2, volume: 0.2 });
    }
    function playTick() {
        tone({ freq: 540, type: "triangle", duration: 0.05, volume: 0.12 });
    }
    function playEnd() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }

    // ----- Spawning -----
    function activeCount() {
        let n = 0;
        for (const s of state.slots) if (s.type) n += 1;
        return n;
    }

    function pickEmptySlot() {
        const empty = [];
        for (let i = 0; i < state.slots.length; i++) {
            if (!state.slots[i].type) empty.push(i);
        }
        if (empty.length === 0) return -1;
        return empty[Math.floor(Math.random() * empty.length)];
    }

    function spawn() {
        if (activeCount() >= MAX_ACTIVE) return;
        const i = pickEmptySlot();
        if (i < 0) return;
        const isBee = Math.random() < BEE_CHANCE;
        const slot = state.slots[i];
        slot.type = isBee ? "bee" : "mole";
        slot.pop.textContent = isBee ? "🐝" : "🐹";
        slot.until = performance.now() + (isBee ? BEE_UP_MS : MOLE_UP_MS);
        slot.hole.classList.add("up");
    }

    function hideSlot(i, hit) {
        const slot = state.slots[i];
        if (!slot.type) return;
        slot.type = null;
        slot.until = 0;
        slot.hole.classList.remove("up");
        if (hit) {
            slot.hole.classList.add("hit");
            setTimeout(() => slot.hole.classList.remove("hit"), 140);
        }
    }

    function popScore(hole, amount, kind) {
        const el = document.createElement("div");
        el.className = "score-pop " + kind;
        el.textContent = (amount > 0 ? "+" : "") + amount;
        hole.appendChild(el);
        setTimeout(() => el.remove(), 700);
    }

    function onHoleTap(i) {
        if (!state.running) return;
        const slot = state.slots[i];
        if (!slot.type) {
            slot.hole.classList.add("miss");
            setTimeout(() => slot.hole.classList.remove("miss"), 260);
            return;
        }
        if (slot.type === "mole") {
            state.score += 1;
            popScore(slot.hole, 1, "good");
            playWhack();
            hideSlot(i, true);
        } else if (slot.type === "bee") {
            state.score = Math.max(0, state.score - 2);
            popScore(slot.hole, -2, "bad");
            playBee();
            hideSlot(i, true);
        }
        scoreEl.textContent = state.score;
    }

    // ----- Round flow -----
    function reset() {
        state.score = 0;
        state.timeLeft = ROUND_MS;
        state.lastSpawn = 0;
        state.nextSpawnIn = 600;
        state.timeLow = false;
        timeStatEl.classList.remove("low");
        scoreEl.textContent = 0;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        for (let i = 0; i < state.slots.length; i++) hideSlot(i, false);
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
        for (let i = 0; i < state.slots.length; i++) hideSlot(i, false);

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();

        const rank = state.leaderboard.indexOf(entry);
        let msg = `${state.playerName} whacked ${state.score} moles!`;
        if (rank === 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < 10) msg += ` You're rank #${rank + 1}.`;
        overlayTitle.textContent = "Time's up!";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Play Again";
        overlay.classList.remove("hidden");
    }

    // ----- Loop -----
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
                // Auto-hide expired slots
                for (let i = 0; i < state.slots.length; i++) {
                    const s = state.slots[i];
                    if (s.type && now >= s.until) hideSlot(i, false);
                }
                // Spawn
                state.nextSpawnIn -= dt;
                if (state.nextSpawnIn <= 0) {
                    spawn();
                    state.nextSpawnIn = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
                }
            }
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    startBtn.addEventListener("click", startGame);

    // Prevent stray tap highlights / scroll on board
    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        board.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
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
