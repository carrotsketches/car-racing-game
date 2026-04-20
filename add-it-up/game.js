(() => {
    const aTens = document.getElementById("a-tens");
    const aOnes = document.getElementById("a-ones");
    const bTens = document.getElementById("b-tens");
    const bOnes = document.getElementById("b-ones");
    const ansTensSlot = document.getElementById("ans-tens");
    const ansOnesSlot = document.getElementById("ans-ones");
    const ansTensDigit = document.getElementById("ans-tens-digit");
    const ansOnesDigit = document.getElementById("ans-ones-digit");
    const carryEl = document.getElementById("carry");
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

    const TOTAL_QUESTIONS = 10;
    const POINTS_FIRST_TRY = 10;
    const POINTS_RETRY = 5;
    const NAME_KEY = "highway-dash-last-name"; // shared across games
    const LB_KEY = "add-it-up-leaderboard";
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
        qIndex: 0,
        current: null,
        active: "ones", // "ones" | "tens" | "done"
        mistakes: 0,
        leaderboard: loadLeaderboard(),
        playerName: "",
        locked: false,
    };

    qTotalEl.textContent = TOTAL_QUESTIONS;

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
    function genProblem() {
        // a + b where 1 <= a,b, a + b <= 20
        // weight to include variety: simple, crossing 10, teens
        let a, b;
        const r = Math.random();
        if (r < 0.35) {
            // both single digit, sum <= 9 (simple warmup)
            a = 1 + Math.floor(Math.random() * 8);
            b = 1 + Math.floor(Math.random() * (9 - a));
        } else if (r < 0.75) {
            // both single digit, sum between 11 and 18 (carry practice)
            a = 2 + Math.floor(Math.random() * 7); // 2..8
            const minB = Math.max(2, 11 - a);
            const maxB = 9;
            b = minB + Math.floor(Math.random() * (maxB - minB + 1));
        } else {
            // teen + single, no carry, sum <= 20
            a = 10 + Math.floor(Math.random() * 9); // 10..18
            const maxB = 20 - a;
            b = 1 + Math.floor(Math.random() * maxB);
        }
        // 50% chance to swap for variety
        if (Math.random() < 0.5) { const t = a; a = b; b = t; }
        const sum = a + b;
        return {
            a,
            b,
            sum,
            aTens: Math.floor(a / 10),
            aOnes: a % 10,
            bTens: Math.floor(b / 10),
            bOnes: b % 10,
            sumTens: Math.floor(sum / 10),
            sumOnes: sum % 10,
            hasCarry: (a % 10) + (b % 10) >= 10,
        };
    }

    // ----- Rendering -----
    function showDigit(el, value) {
        el.textContent = value === 0 || value ? String(value) : "";
    }

    function renderProblem(p) {
        showDigit(aTens, p.aTens || "");
        showDigit(aOnes, p.aOnes);
        showDigit(bTens, p.bTens || "");
        showDigit(bOnes, p.bOnes);
        ansTensDigit.textContent = "";
        ansOnesDigit.textContent = "";
        carryEl.classList.remove("show");
        carryEl.textContent = "";
        resetSlot(ansTensSlot);
        resetSlot(ansOnesSlot);
        setActive("ones");
        qNumEl.textContent = state.qIndex + 1;
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
        if (state.active === "ones") {
            hintEl.className = "hint";
            hintEl.textContent = "先算个位 (ones first)";
        } else if (state.active === "tens") {
            hintEl.className = "hint";
            hintEl.textContent = state.current.hasCarry
                ? "进位 1！再加十位 (carry 1, now tens)"
                : "再算十位 (now the tens)";
        } else {
            // done — hint is set by feedback
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
        if (state.qIndex >= TOTAL_QUESTIONS) {
            endGame();
            return;
        }
        state.current = genProblem();
        state.mistakes = 0;
        state.locked = false;
        renderProblem(state.current);
    }

    function handleKey(k) {
        if (!state.running || state.locked) return;
        if (k === "back") {
            if (state.active === "tens" && ansTensDigit.textContent === "" && ansOnesDigit.textContent !== "") {
                // backspace from empty tens slot -> clear ones and go back
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
        if (k === "check") {
            // optional manual submit; auto-submit happens per digit
            return;
        }
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
        if (digit === p.sumOnes) {
            // correct ones
            ansOnesSlot.classList.add("correct");
            playGood();
            if (p.hasCarry) {
                // show animated carry on tens column
                setTimeout(() => {
                    carryEl.textContent = "1";
                    carryEl.classList.add("show");
                    playCarry();
                }, 200);
            }
            // after a short beat, move to tens
            state.locked = true;
            setTimeout(() => {
                state.locked = false;
                ansOnesSlot.classList.remove("correct");
                ansOnesSlot.classList.add("filled");
                if (p.sumTens === 0) {
                    // single-digit answer: auto-fill tens as 0 and complete
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
            hintEl.textContent = "再试一次！个位 = " + p.aOnes + " + " + p.bOnes;
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
        if (digit === p.sumTens) {
            ansTensSlot.classList.add("correct");
            playGood();
            finishProblem(true);
        } else {
            ansTensSlot.classList.add("wrong");
            state.mistakes += 1;
            playBad();
            const carryHint = p.hasCarry ? "（别忘了进位 1！）" : "";
            hintEl.className = "hint bad";
            hintEl.textContent = "再试一次十位" + carryHint;
            state.locked = true;
            setTimeout(() => {
                ansTensSlot.classList.remove("wrong", "filled");
                ansTensDigit.textContent = "";
                state.locked = false;
                updateHint();
            }, 800);
        }
    }

    function finishProblem(correct) {
        state.locked = true;
        state.active = "done";
        if (correct) {
            const gained = state.mistakes === 0 ? POINTS_FIRST_TRY : POINTS_RETRY;
            state.score += gained;
            scoreEl.textContent = state.score;
            hintEl.className = "hint good";
            hintEl.textContent = `✓ ${state.current.a} + ${state.current.b} = ${state.current.sum}  (+${gained})`;
        }
        setTimeout(() => {
            state.qIndex += 1;
            nextProblem();
        }, 1100);
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
        let msg = `${state.playerName} scored ${state.score} / ${TOTAL_QUESTIONS * POINTS_FIRST_TRY}!`;
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

    window.addEventListener("keydown", (e) => {
        if (!state.running) return;
        if (e.key >= "0" && e.key <= "9") {
            handleKey(e.key);
        } else if (e.key === "Backspace") {
            handleKey("back");
        }
    });

    startBtn.addEventListener("click", startGame);
})();
