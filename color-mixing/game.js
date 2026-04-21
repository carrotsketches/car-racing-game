(() => {
    const potsEl = document.getElementById("pots");
    const cupEl = document.getElementById("cup");
    const cupLeft = document.getElementById("cup-left");
    const cupRight = document.getElementById("cup-right");
    const cupBlend = document.getElementById("cup-blend");
    const targetSwatch = document.getElementById("target-swatch");
    const targetName = document.getElementById("target-name");
    const feedbackEl = document.getElementById("feedback");
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

    const ROUND_MS = 60000;
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "color-mixing-leaderboard";
    const LB_MAX = 20;

    const POTS = [
        { id: "red", name: "Red", color: "#e74c3c" },
        { id: "yellow", name: "Yellow", color: "#f5c451" },
        { id: "blue", name: "Blue", color: "#4a90e2" },
        { id: "white", name: "White", color: "#f5f5f5" },
    ];

    // Each recipe uses two pot ids (unordered). Result is what you get.
    const RECIPES = [
        { pair: ["red", "yellow"], id: "orange", name: "Orange", color: "#ff8c42" },
        { pair: ["yellow", "blue"], id: "green", name: "Green", color: "#7bc47f" },
        { pair: ["red", "blue"], id: "purple", name: "Purple", color: "#9b59b6" },
        { pair: ["red", "white"], id: "pink", name: "Pink", color: "#ff9ec7" },
        { pair: ["blue", "white"], id: "lightblue", name: "Light Blue", color: "#a5d8ff" },
        { pair: ["yellow", "white"], id: "cream", name: "Cream", color: "#fff3b0" },
    ];

    function recipeFor(aId, bId) {
        return RECIPES.find((r) =>
            (r.pair[0] === aId && r.pair[1] === bId) ||
            (r.pair[0] === bId && r.pair[1] === aId)
        );
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
        timeLeft: ROUND_MS,
        playerName: "",
        leaderboard: loadLeaderboard(),
        selected: [], // pot ids chosen so far (max 2)
        target: null,
        potEls: new Map(), // id -> element
        timeLow: false,
        locked: false, // freeze input while showing result
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

    // Build pots
    for (const p of POTS) {
        const el = document.createElement("div");
        el.className = "pot";
        el.style.background = p.color;
        el.dataset.id = p.id;
        const label = document.createElement("div");
        label.className = "pot-name";
        label.textContent = p.name;
        el.appendChild(label);
        el.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            onPotTap(p.id);
        });
        potsEl.appendChild(el);
        state.potEls.set(p.id, el);
    }

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
    function playPick() {
        tone({ freq: 520, endFreq: 780, type: "triangle", duration: 0.12, volume: 0.18 });
    }
    function playGood() {
        tone({ freq: 660, type: "triangle", duration: 0.12, volume: 0.22 });
        tone({ freq: 880, type: "triangle", duration: 0.16, volume: 0.22, delay: 0.1 });
        tone({ freq: 1050, type: "triangle", duration: 0.2, volume: 0.22, delay: 0.22 });
    }
    function playBad() {
        tone({ freq: 220, endFreq: 140, type: "square", duration: 0.25, volume: 0.2 });
    }
    function playTick() {
        tone({ freq: 540, type: "triangle", duration: 0.05, volume: 0.12 });
    }
    function playEnd() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22, delay: 0.13 });
        tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24, delay: 0.26 });
    }

    // ----- Game flow -----
    function potById(id) {
        return POTS.find((p) => p.id === id);
    }

    function pickTarget() {
        // Avoid repeating the same target twice in a row when possible
        let choices = RECIPES;
        if (state.target) {
            const other = RECIPES.filter((r) => r.id !== state.target.id);
            if (other.length) choices = other;
        }
        state.target = choices[Math.floor(Math.random() * choices.length)];
        targetSwatch.style.background = state.target.color;
        targetName.textContent = state.target.name;
    }

    function resetCup() {
        cupEl.classList.remove("blended", "wrong", "right");
        cupLeft.style.background = "transparent";
        cupRight.style.background = "transparent";
        cupBlend.style.background = "transparent";
        state.selected = [];
        for (const el of state.potEls.values()) el.classList.remove("selected");
    }

    function showFeedback(text, kind) {
        feedbackEl.textContent = text;
        feedbackEl.className = "feedback " + (kind || "");
    }

    function showStar() {
        const star = document.createElement("div");
        star.className = "star-pop";
        star.textContent = "⭐";
        cupEl.appendChild(star);
        setTimeout(() => star.remove(), 900);
    }

    function onPotTap(id) {
        if (!state.running || state.locked) return;
        if (state.selected.includes(id)) return; // same pot can't be picked twice
        const pot = potById(id);
        if (!pot) return;

        state.selected.push(id);
        const el = state.potEls.get(id);
        if (el) el.classList.add("selected");
        playPick();

        if (state.selected.length === 1) {
            cupLeft.style.background = pot.color;
            cupRight.style.background = "transparent";
            cupBlend.style.background = "transparent";
            cupEl.classList.remove("blended");
            return;
        }

        // Second pick → evaluate
        cupRight.style.background = pot.color;
        state.locked = true;

        const [a, b] = state.selected;
        const recipe = recipeFor(a, b);

        // Animate blend
        setTimeout(() => {
            if (recipe) {
                cupBlend.style.background = recipe.color;
            } else {
                // Non-matching pair: show a muddy gray blend
                cupBlend.style.background = "#6b6b6b";
            }
            cupEl.classList.add("blended");
        }, 180);

        setTimeout(() => {
            const isMatch = recipe && recipe.id === state.target.id;
            if (isMatch) {
                state.score += 1;
                scoreEl.textContent = state.score;
                cupEl.classList.add("right");
                showFeedback("Great job! ⭐", "good");
                showStar();
                playGood();
                setTimeout(() => {
                    if (!state.running) return;
                    resetCup();
                    pickTarget();
                    showFeedback("", "");
                    state.locked = false;
                }, 850);
            } else {
                cupEl.classList.add("wrong");
                showFeedback(recipe ? `That's ${recipe.name}!` : "Try again!", "bad");
                playBad();
                setTimeout(() => {
                    if (!state.running) return;
                    resetCup();
                    showFeedback("", "");
                    state.locked = false;
                }, 900);
            }
        }, 520);
    }

    // ----- Round -----
    function reset() {
        state.score = 0;
        state.timeLeft = ROUND_MS;
        state.timeLow = false;
        state.locked = false;
        state.target = null;
        timeStatEl.classList.remove("low");
        scoreEl.textContent = 0;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        resetCup();
        showFeedback("", "");
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        reset();
        pickTarget();
        overlay.classList.add("hidden");
        state.running = true;
    }

    function endGame() {
        state.running = false;
        state.locked = false;
        timeStatEl.classList.remove("low");
        state.timeLow = false;
        playEnd();
        resetCup();

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();

        const rank = state.leaderboard.indexOf(entry);
        let msg = `${state.playerName} mixed ${state.score} color${state.score === 1 ? "" : "s"}!`;
        if (state.score > 0 && rank === 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < 10 && state.score > 0) msg += ` You're rank #${rank + 1}.`;
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
            }
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    startBtn.addEventListener("click", startGame);

    // Prevent stray scroll/zoom on the play surface
    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        potsEl.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
        cupEl.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });
})();
