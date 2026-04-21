(() => {
    const hourHand = document.getElementById("hour-hand");
    const minuteHand = document.getElementById("minute-hand");
    const ticksGroup = document.getElementById("ticks");
    const numbersGroup = document.getElementById("numbers");
    const choicesEl = document.getElementById("choices");
    const choiceBtns = Array.from(choicesEl.querySelectorAll(".choice"));
    const hintEl = document.getElementById("hint");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const qNumEl = document.getElementById("q-num");
    const qTotalEl = document.getElementById("q-total");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const countBtns = document.querySelectorAll(".toggle-btn[data-count]");
    const cheerEl = document.getElementById("cheer");
    const padEl = document.getElementById("pad");

    const CHEERS = [
        "Right on time! ⏰",
        "Tick tock! 🎉",
        "Spot on! ⭐",
        "Nailed it! 🌟",
        "Clockwork! 🛠️",
        "Awesome! 🎊",
        "Perfect! 🏆",
        "On the dot! ✨",
        "Brilliant! 💡",
        "Time master! 🚀",
    ];

    const ALLOWED_COUNTS = [5, 8, 10];
    const DEFAULT_COUNT = 5;
    const POINTS_FIRST_TRY = 10;
    const POINTS_RETRY = 5;
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "clock-it-leaderboard";
    const COUNT_KEY = "clock-it-count";
    const LB_MAX = 20;
    const MINUTES_POOL = [0, 15, 30, 45];

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

    const savedCountRaw = Number(localStorage.getItem(COUNT_KEY));
    const savedCount = ALLOWED_COUNTS.includes(savedCountRaw) ? savedCountRaw : DEFAULT_COUNT;

    const state = {
        running: false,
        score: 0,
        qIndex: 0,
        current: null,
        options: [],
        qTotal: savedCount,
        mistakes: 0,
        tried: new Set(),
        leaderboard: loadLeaderboard(),
        playerName: "",
        locked: false,
    };

    qTotalEl.textContent = state.qTotal;
    buildClockFace();
    updateCountUI();

    // ----- Name handling -----
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

    function updateBestDisplay() {
        const name = (nameInput.value || state.playerName || "").trim().slice(0, 12);
        bestEl.textContent = name ? personalBest(name) : 0;
    }

    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
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
    function playTap() { tone({ freq: 520, type: "triangle", duration: 0.06, volume: 0.14 }); }
    function playGood() { tone({ freq: 660, endFreq: 990, type: "sine", duration: 0.12, volume: 0.2 }); }
    function playBad() { tone({ freq: 240, endFreq: 140, type: "square", duration: 0.22, volume: 0.18 }); }
    function playWin() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }

    // ----- Clock face -----
    function buildClockFace() {
        const SVG = "http://www.w3.org/2000/svg";
        const cx = 100, cy = 100;
        for (let i = 0; i < 60; i++) {
            const angle = (i * 6 - 90) * Math.PI / 180;
            const isMajor = i % 5 === 0;
            const inner = isMajor ? 80 : 84;
            const outer = 90;
            const x1 = cx + Math.cos(angle) * inner;
            const y1 = cy + Math.sin(angle) * inner;
            const x2 = cx + Math.cos(angle) * outer;
            const y2 = cy + Math.sin(angle) * outer;
            const tick = document.createElementNS(SVG, "line");
            tick.setAttribute("x1", x1);
            tick.setAttribute("y1", y1);
            tick.setAttribute("x2", x2);
            tick.setAttribute("y2", y2);
            tick.setAttribute("class", "tick " + (isMajor ? "major" : "minor"));
            ticksGroup.appendChild(tick);
        }
        for (let h = 1; h <= 12; h++) {
            const angle = (h * 30 - 90) * Math.PI / 180;
            const r = 68;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            const text = document.createElementNS(SVG, "text");
            text.setAttribute("x", x);
            text.setAttribute("y", y);
            text.setAttribute("class", "num");
            text.textContent = String(h);
            numbersGroup.appendChild(text);
        }
    }

    function setClock(hour, minute) {
        const minuteAngle = minute * 6;
        const hourAngle = (hour % 12) * 30 + (minute / 60) * 30;
        hourHand.setAttribute("transform", `rotate(${hourAngle} 100 100)`);
        minuteHand.setAttribute("transform", `rotate(${minuteAngle} 100 100)`);
    }

    // ----- Problem generation -----
    function genProblem() {
        let hour = 1 + Math.floor(Math.random() * 12);
        let minute = MINUTES_POOL[Math.floor(Math.random() * MINUTES_POOL.length)];
        if (state.current && state.current.hour === hour && state.current.minute === minute) {
            hour = (hour % 12) + 1;
        }
        return { hour, minute };
    }

    function sameTime(a, b) { return a.hour === b.hour && a.minute === b.minute; }

    function buildOptions(target) {
        const pool = [];
        for (let h = 1; h <= 12; h++) {
            for (const m of MINUTES_POOL) {
                if (!(h === target.hour && m === target.minute)) pool.push({ hour: h, minute: m });
            }
        }
        // Fisher–Yates shuffle
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const opts = [target, pool[0], pool[1], pool[2]];
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return opts;
    }

    function formatTime(t) {
        return `${t.hour}:${String(t.minute).padStart(2, "0")}`;
    }

    // ----- Rendering -----
    function updateCountUI() {
        countBtns.forEach((b) => {
            b.classList.toggle("selected", Number(b.dataset.count) === state.qTotal);
        });
    }

    function renderChoices() {
        choiceBtns.forEach((btn, i) => {
            const opt = state.options[i];
            btn.textContent = opt ? formatTime(opt) : "—";
            btn.className = "choice";
            btn.disabled = !state.running;
        });
    }

    function renderProblem() {
        if (!state.current) return;
        setClock(state.current.hour, state.current.minute);
        state.tried = new Set();
        renderChoices();
        qNumEl.textContent = state.qIndex + 1;
        hintEl.className = "hint";
        hintEl.textContent = "What time does the clock show?";
    }

    // ----- Input -----
    function handleChoice(idx) {
        if (!state.running || state.locked) return;
        if (state.tried.has(idx)) return;
        const opt = state.options[idx];
        if (!opt) return;
        const btn = choiceBtns[idx];
        if (sameTime(opt, state.current)) {
            btn.classList.add("correct");
            playGood();
            finishProblem(true);
        } else {
            btn.classList.add("wrong");
            btn.disabled = true;
            state.tried.add(idx);
            state.mistakes += 1;
            playBad();
            hintEl.className = "hint bad";
            hintEl.textContent = "Not quite — look again!";
        }
    }

    // ----- Count switching -----
    function switchCount(newCount) {
        const n = Number(newCount);
        if (!ALLOWED_COUNTS.includes(n)) return;
        if (n === state.qTotal) return;
        state.qTotal = n;
        localStorage.setItem(COUNT_KEY, String(n));
        qTotalEl.textContent = n;
        updateCountUI();
        if (state.running && state.qIndex >= n) {
            endGame();
        }
    }

    // ----- Game flow -----
    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        state.score = 0;
        state.qIndex = 0;
        scoreEl.textContent = 0;
        overlay.classList.add("hidden");
        state.running = true;
        nextProblem();
    }

    function nextProblem() {
        if (state.qIndex >= state.qTotal) {
            endGame();
            return;
        }
        state.current = genProblem();
        state.options = buildOptions(state.current);
        state.mistakes = 0;
        state.locked = false;
        renderProblem();
    }

    function finishProblem(correct) {
        state.locked = true;
        if (correct) {
            const gained = state.mistakes === 0 ? POINTS_FIRST_TRY : POINTS_RETRY;
            state.score += gained;
            scoreEl.textContent = state.score;
            hintEl.className = "hint good";
            hintEl.textContent = `✓ ${formatTime(state.current)}  (+${gained})`;
            showCheer();
            flashPad();
        }
        choiceBtns.forEach(b => b.disabled = true);
        setTimeout(() => {
            state.qIndex += 1;
            nextProblem();
        }, 1200);
    }

    function showCheer() {
        const msg = CHEERS[Math.floor(Math.random() * CHEERS.length)];
        cheerEl.textContent = msg;
        cheerEl.classList.remove("show");
        void cheerEl.offsetWidth;
        cheerEl.classList.add("show");
    }

    function flashPad() {
        padEl.classList.remove("problem-correct");
        void padEl.offsetWidth;
        padEl.classList.add("problem-correct");
    }

    function endGame() {
        state.running = false;
        playWin();

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();

        const rank = state.leaderboard.indexOf(entry);
        let msg = `${state.playerName} scored ${state.score} / ${state.qTotal * POINTS_FIRST_TRY}!`;
        if (rank === 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < 10) msg += ` You're rank #${rank + 1}.`;
        overlayTitle.textContent = "Time's up!";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Play Again";
        overlay.classList.remove("hidden");
    }

    // ----- Event wiring -----
    choicesEl.addEventListener("pointerdown", (e) => {
        const btn = e.target.closest("button.choice");
        if (!btn || btn.disabled) return;
        e.preventDefault();
        playTap();
        handleChoice(Number(btn.dataset.idx));
    });

    countBtns.forEach((btn) => {
        btn.addEventListener("click", () => switchCount(btn.dataset.count));
    });

    startBtn.addEventListener("click", startGame);

    // Friendly default while idle
    setClock(10, 10);
})();
