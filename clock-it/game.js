(() => {
    const hourHand = document.getElementById("hour-hand");
    const minuteHand = document.getElementById("minute-hand");
    const ticksGroup = document.getElementById("ticks");
    const numbersGroup = document.getElementById("numbers");
    const hourSlot = document.getElementById("hour-slot");
    const minuteSlot = document.getElementById("minute-slot");
    const hourDigit = document.getElementById("hour-digit");
    const minuteDigit = document.getElementById("minute-digit");
    const keypad = document.getElementById("keypad");
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
    const levelBtns = document.querySelectorAll(".toggle-btn[data-level]");
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
    const DEFAULT_COUNT = 10;
    const POINTS_FIRST_TRY = 10;
    const POINTS_RETRY = 5;
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "clock-it-leaderboard";
    const LEVEL_KEY = "clock-it-level";
    const COUNT_KEY = "clock-it-count";
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

    const savedLevelRaw = localStorage.getItem(LEVEL_KEY);
    const savedLevel = ["easy", "medium", "hard"].includes(savedLevelRaw) ? savedLevelRaw : "easy";
    const savedCountRaw = Number(localStorage.getItem(COUNT_KEY));
    const savedCount = ALLOWED_COUNTS.includes(savedCountRaw) ? savedCountRaw : DEFAULT_COUNT;

    const state = {
        running: false,
        score: 0,
        qIndex: 0,
        current: null,
        level: savedLevel,
        qTotal: savedCount,
        active: "hour",  // "hour" | "minute" | "done"
        hourInput: "",
        minuteInput: "",
        mistakes: 0,
        leaderboard: loadLeaderboard(),
        playerName: "",
        locked: false,
    };

    qTotalEl.textContent = state.qTotal;
    buildClockFace();
    updateLevelUI();
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
        const hour = 1 + Math.floor(Math.random() * 12); // 1..12
        let minute;
        if (state.level === "easy") {
            minute = Math.random() < 0.5 ? 0 : 30;
        } else if (state.level === "medium") {
            const opts = [0, 15, 30, 45];
            minute = opts[Math.floor(Math.random() * opts.length)];
        } else {
            minute = Math.floor(Math.random() * 12) * 5; // 0,5,...,55
        }
        return { hour, minute };
    }

    function updateLevelUI() {
        levelBtns.forEach((b) => {
            b.classList.toggle("selected", b.dataset.level === state.level);
        });
    }

    function updateCountUI() {
        countBtns.forEach((b) => {
            b.classList.toggle("selected", Number(b.dataset.count) === state.qTotal);
        });
    }

    function pad2(n) { return String(n).padStart(2, "0"); }

    // ----- Slot rendering -----
    function resetSlot(slot, digit) {
        slot.classList.remove("active", "filled", "correct", "wrong");
        digit.textContent = "";
    }

    function setActive(which) {
        state.active = which;
        hourSlot.classList.remove("active");
        minuteSlot.classList.remove("active");
        if (which === "hour") hourSlot.classList.add("active");
        else if (which === "minute") minuteSlot.classList.add("active");
        updateHint();
    }

    function updateHint() {
        if (state.active === "hour") {
            hintEl.className = "hint";
            hintEl.textContent = "Hour first — short hand";
        } else if (state.active === "minute") {
            hintEl.className = "hint";
            hintEl.textContent = "Now the minutes — long hand";
        }
    }

    function refreshHourDisplay() {
        hourDigit.textContent = state.hourInput;
        hourSlot.classList.toggle("filled", state.hourInput.length > 0);
    }

    function refreshMinuteDisplay() {
        minuteDigit.textContent = state.minuteInput;
        minuteSlot.classList.toggle("filled", state.minuteInput.length > 0);
    }

    function renderProblem() {
        if (!state.current) return;
        setClock(state.current.hour, state.current.minute);
        state.hourInput = "";
        state.minuteInput = "";
        hourSlot.classList.remove("correct", "wrong", "filled");
        minuteSlot.classList.remove("correct", "wrong", "filled");
        hourDigit.textContent = "";
        minuteDigit.textContent = "";
        setActive("hour");
        qNumEl.textContent = state.qIndex + 1;
    }

    // ----- Input handling -----
    function handleKey(k) {
        if (!state.running || state.locked) return;
        if (k === "back") {
            handleBack();
            return;
        }
        if (k === "check") {
            attemptSubmit();
            return;
        }
        const digit = Number(k);
        if (Number.isNaN(digit)) return;
        if (state.active === "hour") {
            typeHour(String(digit));
        } else if (state.active === "minute") {
            typeMinute(String(digit));
        }
    }

    function typeHour(d) {
        if (state.hourInput.length >= 2) return;
        const next = state.hourInput + d;
        // Don't allow leading zero or values > 12
        if (state.hourInput.length === 0 && d === "0") return;
        if (Number(next) > 12) return;
        state.hourInput = next;
        playTap();
        refreshHourDisplay();
        // Auto-advance: if we have 2 digits, or the only valid 2nd digit options are gone
        if (state.hourInput.length === 2 || Number(state.hourInput) >= 2) {
            // After "1" we still need possible "10","11","12"; otherwise jump
            setTimeout(() => {
                if (state.active === "hour") setActive("minute");
            }, 180);
        }
    }

    function typeMinute(d) {
        if (state.minuteInput.length >= 2) return;
        // First digit of minute can be 0..5 only
        if (state.minuteInput.length === 0 && Number(d) > 5) return;
        state.minuteInput += d;
        playTap();
        refreshMinuteDisplay();
        if (state.minuteInput.length === 2) {
            setTimeout(() => attemptSubmit(), 200);
        }
    }

    function handleBack() {
        if (state.active === "minute") {
            if (state.minuteInput.length > 0) {
                state.minuteInput = state.minuteInput.slice(0, -1);
                refreshMinuteDisplay();
            } else {
                // Jump back to hour and remove its last digit
                setActive("hour");
                if (state.hourInput.length > 0) {
                    state.hourInput = state.hourInput.slice(0, -1);
                    refreshHourDisplay();
                }
            }
        } else if (state.active === "hour") {
            if (state.hourInput.length > 0) {
                state.hourInput = state.hourInput.slice(0, -1);
                refreshHourDisplay();
            }
        }
        playTap();
    }

    function attemptSubmit() {
        if (state.hourInput.length === 0 || state.minuteInput.length === 0) {
            // If hour is filled but minute isn't, just move focus to minute
            if (state.hourInput.length > 0 && state.minuteInput.length === 0) {
                setActive("minute");
                return;
            }
            hintEl.className = "hint bad";
            hintEl.textContent = "Type the hour and the minute";
            return;
        }
        // Pad single digit minute to two digits (e.g., "5" -> "05")
        if (state.minuteInput.length === 1) {
            state.minuteInput = "0" + state.minuteInput;
            refreshMinuteDisplay();
        }
        const guessHour = Number(state.hourInput);
        const guessMin = Number(state.minuteInput);
        const p = state.current;
        const hourOk = guessHour === p.hour;
        const minOk = guessMin === p.minute;
        if (hourOk && minOk) {
            hourSlot.classList.remove("active");
            minuteSlot.classList.remove("active");
            hourSlot.classList.add("correct");
            minuteSlot.classList.add("correct");
            playGood();
            finishProblem(true);
        } else {
            if (!hourOk) {
                hourSlot.classList.add("wrong");
            }
            if (!minOk) {
                minuteSlot.classList.add("wrong");
            }
            state.mistakes += 1;
            playBad();
            hintEl.className = "hint bad";
            hintEl.textContent = !hourOk && !minOk
                ? "Both off — look again"
                : !hourOk
                    ? "Hour isn't right — short hand"
                    : "Minute isn't right — long hand";
            state.locked = true;
            setTimeout(() => {
                state.locked = false;
                hourSlot.classList.remove("wrong");
                minuteSlot.classList.remove("wrong");
                if (!hourOk) {
                    state.hourInput = "";
                    refreshHourDisplay();
                }
                if (!minOk) {
                    state.minuteInput = "";
                    refreshMinuteDisplay();
                }
                setActive(!hourOk ? "hour" : "minute");
            }, 900);
        }
    }

    // ----- Level / count switching -----
    function switchLevel(newLevel) {
        if (!["easy", "medium", "hard"].includes(newLevel)) return;
        if (newLevel === state.level) return;
        state.level = newLevel;
        localStorage.setItem(LEVEL_KEY, newLevel);
        updateLevelUI();
        if (state.running) {
            state.mistakes = 0;
            state.locked = false;
            state.current = genProblem();
            renderProblem();
        }
    }

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
        state.mistakes = 0;
        state.locked = false;
        renderProblem();
    }

    function finishProblem(correct) {
        state.locked = true;
        state.active = "done";
        if (correct) {
            const gained = state.mistakes === 0 ? POINTS_FIRST_TRY : POINTS_RETRY;
            state.score += gained;
            scoreEl.textContent = state.score;
            hintEl.className = "hint good";
            const p = state.current;
            hintEl.textContent = `✓ ${p.hour}:${pad2(p.minute)}  (+${gained})`;
            showCheer();
            flashPad();
        }
        setTimeout(() => {
            state.qIndex += 1;
            nextProblem();
        }, 1300);
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
    keypad.addEventListener("pointerdown", (e) => {
        const btn = e.target.closest("button.key");
        if (!btn) return;
        e.preventDefault();
        handleKey(btn.dataset.k);
    });

    hourSlot.addEventListener("pointerdown", (e) => {
        if (!state.running || state.locked) return;
        e.preventDefault();
        setActive("hour");
    });
    minuteSlot.addEventListener("pointerdown", (e) => {
        if (!state.running || state.locked) return;
        e.preventDefault();
        setActive("minute");
    });

    levelBtns.forEach((btn) => {
        btn.addEventListener("click", () => switchLevel(btn.dataset.level));
    });
    countBtns.forEach((btn) => {
        btn.addEventListener("click", () => switchCount(btn.dataset.count));
    });

    window.addEventListener("keydown", (e) => {
        if (!state.running) return;
        if (e.key >= "0" && e.key <= "9") {
            handleKey(e.key);
        } else if (e.key === "Backspace") {
            handleKey("back");
        } else if (e.key === "Enter") {
            handleKey("check");
        } else if (e.key === "Tab") {
            e.preventDefault();
            setActive(state.active === "hour" ? "minute" : "hour");
        }
    });

    startBtn.addEventListener("click", startGame);

    // Set hands to a friendly default (10:10) before the game starts
    setClock(10, 10);
})();
