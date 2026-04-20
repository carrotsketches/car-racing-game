(() => {
    const problemEl = document.getElementById("problem");
    const aTens = document.getElementById("a-tens");
    const aOnes = document.getElementById("a-ones");
    const bTens = document.getElementById("b-tens");
    const bOnes = document.getElementById("b-ones");
    const ansTensSlot = document.getElementById("ans-tens");
    const ansOnesSlot = document.getElementById("ans-ones");
    const ansTensDigit = document.getElementById("ans-tens-digit");
    const ansOnesDigit = document.getElementById("ans-ones-digit");
    const carryEl = document.getElementById("carry");
    const hAEl = document.getElementById("h-a");
    const hBEl = document.getElementById("h-b");
    const hOpEl = document.getElementById("h-op");
    const vOpEl = document.getElementById("v-op");
    const hAnsEl = document.getElementById("h-ans");
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
    const modeBtns = document.querySelectorAll(".toggle-btn[data-mode]");
    const levelBtns = document.querySelectorAll(".toggle-btn[data-level]");
    const countBtns = document.querySelectorAll(".toggle-btn[data-count]");
    const opBtns = document.querySelectorAll(".toggle-btn[data-op]");
    const cheerEl = document.getElementById("cheer");
    const padEl = document.getElementById("pad");

    const CHEERS = [
        "Hooray! 🎉",
        "You got it! ⭐",
        "Great job! 🌟",
        "Awesome! 🎊",
        "Nice one! 👍",
        "Woohoo! 🥳",
        "Perfect! 🏆",
        "Amazing! ✨",
        "Brilliant! 💡",
        "Super! 🚀",
    ];

    const ALLOWED_COUNTS = [5, 8, 10];
    const DEFAULT_COUNT = 10;
    const POINTS_FIRST_TRY = 10;
    const POINTS_RETRY = 5;
    const NAME_KEY = "highway-dash-last-name"; // shared across games
    const LB_KEY = "add-it-up-leaderboard";
    const MODE_KEY = "add-it-up-mode";
    const LEVEL_KEY = "add-it-up-level";
    const COUNT_KEY = "add-it-up-count";
    const OP_KEY = "add-it-up-op";
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

    const savedMode = localStorage.getItem(MODE_KEY) === "vertical" ? "vertical" : "horizontal";
    const savedLevel = localStorage.getItem(LEVEL_KEY) === "medium" ? "medium" : "easy";
    const savedCountRaw = Number(localStorage.getItem(COUNT_KEY));
    const savedCount = ALLOWED_COUNTS.includes(savedCountRaw) ? savedCountRaw : DEFAULT_COUNT;
    const savedOp = localStorage.getItem(OP_KEY) === "sub" ? "sub" : "add";

    const state = {
        running: false,
        score: 0,
        qIndex: 0,
        current: null,
        mode: savedMode,
        level: savedLevel,
        qTotal: savedCount,
        op: savedOp,
        // vertical state
        active: "ones", // "ones" | "tens" | "done"
        // horizontal state
        hInput: "",     // digits typed in horizontal mode
        mistakes: 0,
        leaderboard: loadLeaderboard(),
        playerName: "",
        locked: false,
    };

    qTotalEl.textContent = state.qTotal;
    applyModeClass();
    updateModeUI();
    updateLevelUI();
    updateCountUI();
    updateOpUI();

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
    function playGood() {
        tone({ freq: 660, endFreq: 990, type: "sine", duration: 0.12, volume: 0.2 });
    }
    function playBad() {
        tone({ freq: 240, endFreq: 140, type: "square", duration: 0.22, volume: 0.18 });
    }
    function playWin() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }
    function playCarry() {
        tone({ freq: 880, endFreq: 1320, type: "sine", duration: 0.14, volume: 0.18 });
    }

    // ----- Problem generation -----
    function genAddPair() {
        let a, b;
        if (state.level === "easy") {
            // a + b >= 1 and sum <= 10
            a = 1 + Math.floor(Math.random() * 8);
            b = 1 + Math.floor(Math.random() * (10 - a));
        } else {
            const r = Math.random();
            if (r < 0.25) {
                a = 1 + Math.floor(Math.random() * 8);
                b = 1 + Math.floor(Math.random() * (9 - a));
            } else if (r < 0.75) {
                a = 2 + Math.floor(Math.random() * 7);
                const minB = Math.max(2, 11 - a);
                const maxB = 9;
                b = minB + Math.floor(Math.random() * (maxB - minB + 1));
            } else {
                a = 10 + Math.floor(Math.random() * 9);
                const maxB = 20 - a;
                b = 1 + Math.floor(Math.random() * maxB);
            }
        }
        if (Math.random() < 0.5) { const t = a; a = b; b = t; }
        return { a, b };
    }

    function genSubPair() {
        let a, b;
        if (state.level === "easy") {
            // a in 2..10, b in 1..(a-1); result in 1..9
            a = 2 + Math.floor(Math.random() * 9); // 2..10
            b = 1 + Math.floor(Math.random() * (a - 1));
        } else {
            const r = Math.random();
            if (r < 0.2) {
                // simple single-digit
                a = 3 + Math.floor(Math.random() * 7); // 3..9
                b = 1 + Math.floor(Math.random() * (a - 1));
            } else if (r < 0.65) {
                // teen - single, WITH borrow: aOnes < b
                a = 11 + Math.floor(Math.random() * 8); // 11..18
                const aOnes = a % 10;
                // b in (aOnes+1)..9 (forces borrow)
                b = (aOnes + 1) + Math.floor(Math.random() * (9 - aOnes));
            } else {
                // teen - something, NO borrow: b <= aOnes (avoid 20 minus 0)
                a = 11 + Math.floor(Math.random() * 10); // 11..20
                const aOnes = a % 10;
                if (aOnes === 0) {
                    // a=20: b=10 => 10 (tens subtraction, simple)
                    b = 10;
                } else {
                    b = 1 + Math.floor(Math.random() * aOnes);
                }
            }
        }
        return { a, b };
    }

    function genProblem() {
        const { a, b } = state.op === "sub" ? genSubPair() : genAddPair();
        const op = state.op;
        const result = op === "sub" ? a - b : a + b;
        const aOnes = a % 10;
        const bOnes = b % 10;
        return {
            a,
            b,
            op,
            result,
            aTens: Math.floor(a / 10),
            aOnes,
            bTens: Math.floor(b / 10),
            bOnes,
            resultTens: Math.floor(result / 10),
            resultOnes: result % 10,
            hasCarry: op === "add" && aOnes + bOnes >= 10,
            hasBorrow: op === "sub" && aOnes < bOnes,
        };
    }

    function opSymbol(op) { return op === "sub" ? "−" : "+"; }

    // ----- Rendering: shared -----
    function showDigit(el, value) {
        el.textContent = value === 0 || value ? String(value) : "";
    }

    function applyModeClass() {
        problemEl.classList.toggle("mode-horizontal", state.mode === "horizontal");
        problemEl.classList.toggle("mode-vertical", state.mode === "vertical");
    }

    function updateModeUI() {
        modeBtns.forEach((b) => {
            b.classList.toggle("selected", b.dataset.mode === state.mode);
        });
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

    function updateOpUI() {
        opBtns.forEach((b) => {
            b.classList.toggle("selected", b.dataset.op === state.op);
        });
    }

    function renderProblem() {
        if (!state.current) return;
        const p = state.current;
        if (state.mode === "horizontal") {
            renderHorizontal(p);
        } else {
            renderVertical(p);
        }
        qNumEl.textContent = state.qIndex + 1;
    }

    // ----- Horizontal rendering + input -----
    function renderHorizontal(p) {
        hAEl.textContent = String(p.a);
        hBEl.textContent = String(p.b);
        hOpEl.textContent = opSymbol(p.op);
        hAnsEl.classList.remove("correct", "wrong", "filled");
        hAnsEl.classList.add("active");
        updateHAnsDisplay();
        updateHint();
    }

    function updateHAnsDisplay() {
        const val = state.hInput;
        hAnsEl.textContent = val;
        hAnsEl.classList.toggle("filled", val.length > 0);
        // add caret to show typing position
        const caret = document.createElement("span");
        caret.className = "caret";
        hAnsEl.appendChild(caret);
    }

    function handleHorizontalKey(k) {
        if (k === "back") {
            if (state.hInput.length === 0) return;
            state.hInput = state.hInput.slice(0, -1);
            hAnsEl.classList.remove("correct", "wrong");
            updateHAnsDisplay();
            playTap();
            return;
        }
        if (k === "check") {
            submitHorizontal();
            return;
        }
        const digit = Number(k);
        if (Number.isNaN(digit)) return;
        if (state.hInput.length >= 2) return;
        state.hInput += String(digit);
        hAnsEl.classList.remove("wrong");
        updateHAnsDisplay();
        playTap();
        // Auto-submit as soon as the typed value matches the correct answer,
        // or once 2 digits are entered (catches wrong guesses).
        const guess = Number(state.hInput);
        if (guess === state.current.result) {
            setTimeout(() => submitHorizontal(), 180);
        } else if (state.hInput.length === 2) {
            setTimeout(() => submitHorizontal(), 180);
        }
    }

    function submitHorizontal() {
        if (state.locked) return;
        if (state.hInput.length === 0) {
            hintEl.className = "hint bad";
            hintEl.textContent = "Type a number first!";
            return;
        }
        const guess = Number(state.hInput);
        const p = state.current;
        if (guess === p.result) {
            hAnsEl.classList.remove("active");
            hAnsEl.classList.add("correct");
            hAnsEl.textContent = state.hInput; // drop the caret
            playGood();
            finishProblem(true);
        } else {
            hAnsEl.classList.add("wrong");
            state.mistakes += 1;
            playBad();
            hintEl.className = "hint bad";
            hintEl.textContent = "Not quite — try again!";
            state.locked = true;
            setTimeout(() => {
                state.locked = false;
                state.hInput = "";
                hAnsEl.classList.remove("wrong");
                updateHAnsDisplay();
                updateHint();
            }, 800);
        }
    }

    // ----- Vertical rendering + input -----
    function renderVertical(p) {
        showDigit(aTens, p.aTens || "");
        showDigit(aOnes, p.aOnes);
        showDigit(bTens, p.bTens || "");
        showDigit(bOnes, p.bOnes);
        vOpEl.textContent = opSymbol(p.op);
        ansTensDigit.textContent = "";
        ansOnesDigit.textContent = "";
        carryEl.classList.remove("show", "borrow");
        carryEl.textContent = "";
        resetSlot(ansTensSlot);
        resetSlot(ansOnesSlot);
        setActive("ones");
    }

    function resetSlot(slot) {
        slot.classList.remove("active", "filled", "correct", "wrong");
    }

    function setActive(which) {
        state.active = which;
        ansOnesSlot.classList.remove("active");
        ansTensSlot.classList.remove("active");
        if (which === "ones") ansOnesSlot.classList.add("active");
        else if (which === "tens") ansTensSlot.classList.add("active");
        updateHint();
    }

    function updateHint() {
        if (state.mode === "horizontal") {
            hintEl.className = "hint";
            hintEl.textContent = "Type the answer left to right";
            return;
        }
        const verb = state.op === "sub" ? "subtract" : "add";
        const Verb = state.op === "sub" ? "Subtract" : "Add";
        if (state.active === "ones") {
            hintEl.className = "hint";
            hintEl.textContent = `${Verb} the ones first`;
        } else if (state.active === "tens") {
            hintEl.className = "hint";
            const p = state.current;
            if (p.hasCarry) {
                hintEl.textContent = `Carry 1! Now ${verb} the tens`;
            } else if (p.hasBorrow) {
                hintEl.textContent = `Borrow 1! Now ${verb} the tens`;
            } else {
                hintEl.textContent = `Now ${verb} the tens`;
            }
        }
    }

    function handleVerticalKey(k) {
        if (k === "back") {
            if (state.active === "tens" && ansTensDigit.textContent === "" && ansOnesDigit.textContent !== "") {
                ansOnesDigit.textContent = "";
                resetSlot(ansOnesSlot);
                carryEl.classList.remove("show");
                setActive("ones");
            } else if (state.active === "ones") {
                ansOnesDigit.textContent = "";
                resetSlot(ansOnesSlot);
            } else if (state.active === "tens") {
                ansTensDigit.textContent = "";
                ansTensSlot.classList.remove("filled");
            }
            playTap();
            return;
        }
        if (k === "check") return;
        const digit = Number(k);
        if (Number.isNaN(digit)) return;
        playTap();
        if (state.active === "ones") {
            ansOnesDigit.textContent = String(digit);
            ansOnesSlot.classList.add("filled");
            checkOnes(digit);
        } else if (state.active === "tens") {
            ansTensDigit.textContent = String(digit);
            ansTensSlot.classList.add("filled");
            checkTens(digit);
        }
    }

    function checkOnes(digit) {
        const p = state.current;
        if (digit === p.resultOnes) {
            ansOnesSlot.classList.add("correct");
            playGood();
            if (p.hasCarry || p.hasBorrow) {
                setTimeout(() => {
                    carryEl.textContent = p.hasBorrow ? "−1" : "1";
                    carryEl.classList.toggle("borrow", !!p.hasBorrow);
                    carryEl.classList.add("show");
                    playCarry();
                }, 200);
            }
            state.locked = true;
            setTimeout(() => {
                state.locked = false;
                ansOnesSlot.classList.remove("correct");
                ansOnesSlot.classList.add("filled");
                if (p.resultTens === 0) {
                    ansTensDigit.textContent = "0";
                    ansTensSlot.classList.add("filled");
                    finishProblem(true);
                } else {
                    setActive("tens");
                }
            }, 650);
        } else {
            ansOnesSlot.classList.add("wrong");
            state.mistakes += 1;
            playBad();
            hintEl.className = "hint bad";
            hintEl.textContent = "Try again! Ones = " + p.aOnes + " " + opSymbol(p.op) + " " + p.bOnes;
            state.locked = true;
            setTimeout(() => {
                ansOnesSlot.classList.remove("wrong", "filled");
                ansOnesDigit.textContent = "";
                state.locked = false;
                updateHint();
            }, 700);
        }
    }

    function checkTens(digit) {
        const p = state.current;
        if (digit === p.resultTens) {
            ansTensSlot.classList.add("correct");
            playGood();
            finishProblem(true);
        } else {
            ansTensSlot.classList.add("wrong");
            state.mistakes += 1;
            playBad();
            const adjustHint = p.hasCarry
                ? " (don't forget to carry 1!)"
                : p.hasBorrow
                    ? " (don't forget you borrowed 1!)"
                    : "";
            hintEl.className = "hint bad";
            hintEl.textContent = "Try the tens again" + adjustHint;
            state.locked = true;
            setTimeout(() => {
                ansTensSlot.classList.remove("wrong", "filled");
                ansTensDigit.textContent = "";
                state.locked = false;
                updateHint();
            }, 800);
        }
    }

    // ----- Shared key dispatch -----
    function handleKey(k) {
        if (!state.running || state.locked) return;
        if (state.mode === "horizontal") {
            handleHorizontalKey(k);
        } else {
            handleVerticalKey(k);
        }
    }

    // ----- Mode / Level switching (mid-game safe) -----
    function switchMode(newMode) {
        if (newMode !== "horizontal" && newMode !== "vertical") return;
        if (newMode === state.mode) return;
        state.mode = newMode;
        localStorage.setItem(MODE_KEY, newMode);
        applyModeClass();
        updateModeUI();
        if (state.running && state.current) {
            state.hInput = "";
            state.mistakes = 0;
            state.locked = false;
            renderProblem();
        }
    }

    function switchLevel(newLevel) {
        if (newLevel !== "easy" && newLevel !== "medium") return;
        if (newLevel === state.level) return;
        state.level = newLevel;
        localStorage.setItem(LEVEL_KEY, newLevel);
        updateLevelUI();
        if (state.running) {
            // Regenerate the current question under the new difficulty
            state.hInput = "";
            state.mistakes = 0;
            state.locked = false;
            state.current = genProblem();
            renderProblem();
        }
    }

    function switchOp(newOp) {
        if (newOp !== "add" && newOp !== "sub") return;
        if (newOp === state.op) return;
        state.op = newOp;
        localStorage.setItem(OP_KEY, newOp);
        updateOpUI();
        if (state.running) {
            // Regenerate the current question under the new operation
            state.hInput = "";
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
            // Already answered enough questions — wrap up
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
        state.hInput = "";
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
            const sym = opSymbol(state.current.op);
            hintEl.textContent = `✓ ${state.current.a} ${sym} ${state.current.b} = ${state.current.result}  (+${gained})`;
            showCheer();
            flashPad();
        }
        setTimeout(() => {
            state.qIndex += 1;
            nextProblem();
        }, 1250);
    }

    function showCheer() {
        const msg = CHEERS[Math.floor(Math.random() * CHEERS.length)];
        cheerEl.textContent = msg;
        cheerEl.classList.remove("show");
        // force reflow so the animation restarts even on repeat hits
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
        overlayTitle.textContent = "All done!";
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

    modeBtns.forEach((btn) => {
        btn.addEventListener("click", () => switchMode(btn.dataset.mode));
    });
    levelBtns.forEach((btn) => {
        btn.addEventListener("click", () => switchLevel(btn.dataset.level));
    });
    countBtns.forEach((btn) => {
        btn.addEventListener("click", () => switchCount(btn.dataset.count));
    });
    opBtns.forEach((btn) => {
        btn.addEventListener("click", () => switchOp(btn.dataset.op));
    });

    window.addEventListener("keydown", (e) => {
        if (!state.running) return;
        if (e.key >= "0" && e.key <= "9") {
            handleKey(e.key);
        } else if (e.key === "Backspace") {
            handleKey("back");
        } else if (e.key === "Enter") {
            handleKey("check");
        }
    });

    startBtn.addEventListener("click", startGame);
})();
