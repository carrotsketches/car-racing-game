(() => {
    const qTitleEl = document.getElementById("q-title");
    const qStageEl = document.getElementById("q-stage");
    const answersEl = document.getElementById("answers");
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
    const cheerEl = document.getElementById("cheer");
    const padEl = document.getElementById("pad");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "pattern-party-leaderboard";
    const LB_MAX = 20;
    const Q_TOTAL = 10;
    const POINTS_FIRST_TRY = 10;
    const POINTS_RETRY = 5;

    const CHEERS = [
        "Sharp eyes! 👀",
        "You got it! ⭐",
        "Great job! 🌟",
        "Clever! 🧠",
        "Nice one! 👍",
        "Woohoo! 🥳",
        "Brilliant! 💡",
        "Awesome! 🎉",
        "So smart! 🏆",
        "Keep going! 🚀",
    ];

    // Emoji pools — basic glyphs that render consistently across platforms.
    const POOLS = {
        fruit: ["🍎", "🍌", "🍇", "🍓", "🍊", "🍉", "🍐", "🥝", "🍑"],
        vehicles: ["🚗", "🚌", "🚓", "🚑", "🚒", "🚚", "🚲"],
        animals: ["🐶", "🐱", "🐰", "🐻", "🦊", "🐼", "🐵", "🐷"],
        sea: ["🐙", "🦈", "🦀", "🐳", "🦞", "🐡"],
        colors: ["🔴", "🔵", "🟢", "🟡", "🟠", "🟣", "🟤"],
        shapes: ["⭐", "❤️", "🔺", "🔶", "🟥", "🟩", "🟦", "🟨"],
    };
    const POOL_KEYS = Object.keys(POOLS);

    // Pairs that can look confusingly similar on some devices — avoid using together.
    const LOOKALIKE_PAIRS = [
        ["🐟", "🐠"], ["🚗", "🏎️"], ["🍎", "🍒"], ["🍋", "🍈"],
        ["🟥", "🔴"], ["🟦", "🔵"], ["🟩", "🟢"], ["🟨", "🟡"],
    ];
    function isLookalike(a, b) {
        for (const [x, y] of LOOKALIKE_PAIRS) {
            if ((a === x && b === y) || (a === y && b === x)) return true;
        }
        return false;
    }

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function pickN(arr, n) {
        const copy = arr.slice();
        const out = [];
        while (out.length < n && copy.length) {
            out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
        }
        return out;
    }
    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    function hasLookalikeGroup(list) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                if (isLookalike(list[i], list[j])) return true;
            }
        }
        return false;
    }

    // ----- Leaderboard / name -----
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
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
    }

    const state = {
        running: false,
        score: 0,
        qIndex: 0,
        qTotal: Q_TOTAL,
        rounds: [],
        current: null,
        mistakes: 0,
        locked: false,
        playerName: "",
        leaderboard: loadLeaderboard(),
    };

    qTotalEl.textContent = state.qTotal;

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
    function playGood() { tone({ freq: 660, endFreq: 990, type: "sine", duration: 0.12, volume: 0.2 }); }
    function playBad() { tone({ freq: 240, endFreq: 140, type: "square", duration: 0.22, volume: 0.18 }); }
    function playWin() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }

    // ----- Pattern generator -----
    // Returns {
    //   visible: [emoji|null, ...],  // null means a blank "?" tile
    //   blankPositions: [idx, ...],  // positions of blanks in `visible`, left-to-right
    //   answers: [emoji, ...],       // correct emoji for each blank, same order as blankPositions
    //   options: [{kind:"emoji", value}, ...],
    //   answersCount: 4,
    // }
    function genPattern() {
        const shapes = ["AB", "AABB", "ABC", "AAB", "ABB"];
        const shape = pick(shapes);
        const cat = pick(POOL_KEYS);
        const needed = shape === "ABC" ? 3 : 2;
        let elems = pickN(POOLS[cat], needed);
        let attempts = 0;
        while (hasLookalikeGroup(elems) && attempts < 3) {
            elems = pickN(POOLS[cat], needed);
            attempts += 1;
        }
        const [A, B, C] = elems;
        let cycle;
        if (shape === "AB") cycle = [A, B];
        else if (shape === "AABB") cycle = [A, A, B, B];
        else if (shape === "ABC") cycle = [A, B, C];
        else if (shape === "AAB") cycle = [A, A, B];
        else cycle = [A, B, B]; // ABB

        // Always show enough so the cycle is obvious — at least two full
        // cycles visible (after blanks are revealed).
        const minTotal = Math.max(6, cycle.length * 2);
        const maxTotal = Math.min(8, minTotal + 1);
        const total = minTotal + Math.floor(Math.random() * (maxTotal - minTotal + 1));

        // Build the full true sequence first.
        const full = [];
        for (let i = 0; i < total; i++) full.push(cycle[i % cycle.length]);

        // Pick number of blanks: 1 or 2. Always trailing so the kid is
        // filling in "what comes next" — easiest to spot.
        const numBlanks = Math.random() < 0.5 ? 2 : 1;
        const blankPositions = [];
        for (let i = total - numBlanks; i < total; i++) blankPositions.push(i);

        const visible = full.map((e, i) => (blankPositions.includes(i) ? null : e));
        const answers = blankPositions.map((p) => full[p]);

        // Build option set: cycle elements + filler distractors. 4 buttons.
        const optSet = new Set(cycle);
        const poolExtras = POOLS[cat].filter((e) => !optSet.has(e));
        while (optSet.size < 4 && poolExtras.length) {
            const extra = poolExtras.splice(Math.floor(Math.random() * poolExtras.length), 1)[0];
            if (!answers.some((a) => isLookalike(extra, a))) optSet.add(extra);
        }
        while (optSet.size < 4) {
            const other = pick(POOLS[pick(POOL_KEYS.filter((k) => k !== cat))]);
            if (!answers.some((a) => isLookalike(other, a)) && !optSet.has(other)) optSet.add(other);
        }
        const options = shuffle(Array.from(optSet)).slice(0, 4);

        return {
            visible,
            blankPositions,
            answers,
            options: options.map((e) => ({ kind: "emoji", value: e })),
            answersCount: 4,
        };
    }

    // ----- Rendering -----
    function renderStage(current) {
        qStageEl.innerHTML = "";
        current.visible.forEach((emo, i) => {
            const t = document.createElement("div");
            if (emo == null) {
                t.className = "q-tile mystery";
                t.textContent = "?";
                t.dataset.blankIdx = String(current.blankPositions.indexOf(i));
            } else {
                t.className = "q-tile";
                t.textContent = emo;
            }
            qStageEl.appendChild(t);
        });
        markActiveBlank();
    }

    function markActiveBlank() {
        const c = state.current;
        if (!c) return;
        const tiles = qStageEl.querySelectorAll(".q-tile.mystery");
        tiles.forEach((t) => {
            const idx = Number(t.dataset.blankIdx);
            t.classList.toggle("active", idx === c.blanksFilled);
            t.classList.toggle("waiting", idx > c.blanksFilled);
        });
    }

    function fillBlank(blankIdx, emoji) {
        const tile = qStageEl.querySelector(`.q-tile.mystery[data-blank-idx="${blankIdx}"]`);
        if (!tile) return;
        tile.classList.remove("mystery", "active", "waiting");
        tile.classList.add("filled");
        tile.textContent = emoji;
    }

    function renderAnswers(current) {
        answersEl.innerHTML = "";
        answersEl.dataset.count = String(current.answersCount);
        current.options.forEach((opt, idx) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ans";
            btn.dataset.idx = String(idx);
            const span = document.createElement("span");
            span.className = "ans-emoji";
            span.textContent = opt.value;
            btn.appendChild(span);
            answersEl.appendChild(btn);
        });
    }

    function renderCurrent() {
        if (!state.current) return;
        qTitleEl.textContent = "What comes next?";
        renderStage(state.current);
        renderAnswers(state.current);
        qNumEl.textContent = state.qIndex + 1;
        hintEl.className = "hint";
        hintEl.textContent = state.current.answers.length > 1
            ? "Tap to fill each ❓ in order"
            : "Tap the matching tile";
    }

    // ----- Round lifecycle -----
    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        state.score = 0;
        state.qIndex = 0;
        scoreEl.textContent = 0;
        state.rounds = new Array(Q_TOTAL).fill("seq");
        overlay.classList.add("hidden");
        state.running = true;
        nextRound();
    }

    function nextRound() {
        if (state.qIndex >= state.qTotal) {
            endGame();
            return;
        }
        const round = genPattern();
        state.current = { ...round, blanksFilled: 0 };
        state.mistakes = 0;
        state.locked = false;
        renderCurrent();
    }

    function advance() {
        state.qIndex += 1;
        nextRound();
    }

    function onAnswer(idx) {
        if (!state.running || state.locked) return;
        const c = state.current;
        const tiles = answersEl.querySelectorAll(".ans");
        const tile = tiles[idx];
        if (!tile) return;

        const expected = c.answers[c.blanksFilled];
        const expectedIdx = c.options.findIndex((o) => o.value === expected);
        const correct = idx === expectedIdx;

        if (correct) {
            tile.classList.add("correct");
            playGood();
            const blankIdx = c.blanksFilled;
            fillBlank(blankIdx, expected);
            c.blanksFilled += 1;

            // Brief tile flash
            setTimeout(() => tile.classList.remove("correct"), 280);

            if (c.blanksFilled >= c.answers.length) {
                // Round complete
                state.locked = true;
                const gained = state.mistakes === 0 ? POINTS_FIRST_TRY : POINTS_RETRY;
                state.score += gained;
                scoreEl.textContent = state.score;
                hintEl.className = "hint good";
                hintEl.textContent = `✓ Nice! +${gained}`;
                showCheer();
                flashPad();
                setTimeout(advance, 950);
            } else {
                markActiveBlank();
                hintEl.className = "hint good";
                hintEl.textContent = "Yes! Now the next ❓";
            }
        } else {
            playBad();
            state.mistakes += 1;
            tile.classList.add("wrong");
            if (state.mistakes < 2) {
                state.locked = true;
                hintEl.className = "hint bad";
                hintEl.textContent = "Not quite — try again!";
                setTimeout(() => {
                    tile.classList.remove("wrong");
                    tile.classList.add("dim");
                    state.locked = false;
                }, 550);
            } else {
                // Reveal all remaining blanks and advance.
                state.locked = true;
                tile.classList.remove("wrong");
                tile.classList.add("dim", "wrong");
                while (c.blanksFilled < c.answers.length) {
                    const blankIdx = c.blanksFilled;
                    const ans = c.answers[blankIdx];
                    const blankTile = qStageEl.querySelector(`.q-tile.mystery[data-blank-idx="${blankIdx}"]`);
                    if (blankTile) {
                        blankTile.classList.remove("mystery", "active", "waiting");
                        blankTile.classList.add("filled", "reveal");
                        blankTile.textContent = ans;
                    }
                    // Highlight the right answer button
                    const rightOptIdx = c.options.findIndex((o) => o.value === ans);
                    const rightBtn = tiles[rightOptIdx];
                    if (rightBtn) rightBtn.classList.add("reveal");
                    c.blanksFilled += 1;
                }
                hintEl.className = "hint bad";
                hintEl.textContent = "Like this 👆";
                setTimeout(advance, 1500);
            }
        }
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
        overlayTitle.textContent = "All done!";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Play Again";
        overlay.classList.remove("hidden");
    }

    // ----- Event wiring -----
    answersEl.addEventListener("click", (e) => {
        const btn = e.target.closest("button.ans");
        if (!btn) return;
        e.preventDefault();
        const idx = Number(btn.dataset.idx);
        if (!Number.isNaN(idx)) onAnswer(idx);
    });

    startBtn.addEventListener("click", startGame);
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
