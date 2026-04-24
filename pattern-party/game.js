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

    // ----- Question generators -----
    // Each returns { type, title, stage, options, correctIdx, answersCount }
    // Option kinds: { kind:"emoji", value } | { kind:"group", emoji, count } | { kind:"sized", emoji, size }
    // Stage kinds: "sequence" | "size-sequence" | "count-prompt" | "inline-prompt"

    function genSeq() {
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

        // Show at least one full cycle + some repetition so the pattern is unambiguous.
        const minTiles = Math.max(5, cycle.length + 2);
        const maxTiles = minTiles + 2;
        const len = minTiles + Math.floor(Math.random() * (maxTiles - minTiles + 1));
        const visible = [];
        for (let i = 0; i < len; i++) visible.push(cycle[i % cycle.length]);
        const answer = cycle[len % cycle.length];

        const optSet = new Set(cycle);
        const poolExtras = POOLS[cat].filter((e) => !optSet.has(e));
        while (optSet.size < 4 && poolExtras.length) {
            const extra = poolExtras.splice(Math.floor(Math.random() * poolExtras.length), 1)[0];
            if (!isLookalike(extra, answer)) optSet.add(extra);
        }
        while (optSet.size < 4) {
            const other = pick(POOLS[pick(POOL_KEYS.filter((k) => k !== cat))]);
            if (!isLookalike(other, answer) && !optSet.has(other)) optSet.add(other);
        }
        const options = shuffle(Array.from(optSet)).slice(0, 4);
        const correctIdx = options.indexOf(answer);

        return {
            type: "seq",
            title: "What comes next?",
            stage: { kind: "sequence", visible, mystery: true },
            options: options.map((e) => ({ kind: "emoji", value: e })),
            correctIdx,
            answersCount: 4,
        };
    }

    function genOdd() {
        const [cat1, cat2] = pickN(POOL_KEYS, 2);
        let group = pickN(POOLS[cat1], 3);
        let outlier = pick(POOLS[cat2]);
        let attempts = 0;
        while (attempts < 4 && (group.some((g) => isLookalike(g, outlier)) || hasLookalikeGroup(group))) {
            group = pickN(POOLS[cat1], 3);
            outlier = pick(POOLS[cat2]);
            attempts += 1;
        }
        const tiles = shuffle([...group, outlier]);
        const correctIdx = tiles.indexOf(outlier);

        return {
            type: "odd",
            title: "Which one doesn't belong?",
            stage: { kind: "inline-prompt", text: "Tap the one that's different 👇" },
            options: tiles.map((e) => ({ kind: "emoji", value: e })),
            correctIdx,
            answersCount: 4,
        };
    }

    function genCount() {
        const cat = pick(POOL_KEYS);
        const e = pick(POOLS[cat]);
        const promptGroups = [1, 2, 3];
        const distractors = shuffle([2, 3, 5]);
        const counts = shuffle([4, ...distractors]);
        const correctIdx = counts.indexOf(4);

        return {
            type: "count",
            title: "How many come next?",
            stage: { kind: "count-prompt", emoji: e, promptCounts: promptGroups },
            options: counts.map((n) => ({ kind: "group", emoji: e, count: n })),
            correctIdx,
            answersCount: 4,
        };
    }

    function genSameDiff() {
        const cat = pick(POOL_KEYS);
        let pair = pickN(POOLS[cat], 2);
        let attempts = 0;
        while (isLookalike(pair[0], pair[1]) && attempts < 3) {
            pair = pickN(POOLS[cat], 2);
            attempts += 1;
        }
        const [a, b] = pair;
        const tiles = shuffle([a, a, b]);
        const correctIdx = tiles.indexOf(b);

        return {
            type: "samediff",
            title: "Which one is different?",
            stage: { kind: "inline-prompt", text: "Tap the odd tile 👇" },
            options: tiles.map((e) => ({ kind: "emoji", value: e })),
            correctIdx,
            answersCount: 3,
        };
    }

    // Size-growing (or shrinking) sequence: small → medium → large → ?
    function genSize() {
        const cat = pick(POOL_KEYS);
        const emoji = pick(POOLS[cat]);
        const growing = Math.random() < 0.5;
        const baseSizes = growing ? [1.2, 1.8, 2.4] : [2.6, 2.0, 1.4];
        const answerSize = growing ? 3.0 : 0.9;
        // Distractors: sizes that don't continue the trend.
        const distractors = growing ? [1.0, 1.5, 2.1] : [3.0, 2.4, 1.8];
        const optSizes = shuffle([answerSize, ...shuffle(distractors).slice(0, 3)]);
        const correctIdx = optSizes.indexOf(answerSize);

        return {
            type: "size",
            title: growing ? "Tap the one that keeps growing!" : "Tap the one that keeps shrinking!",
            stage: { kind: "size-sequence", emoji, sizes: baseSizes, mystery: true },
            options: optSizes.map((sz) => ({ kind: "sized", emoji, size: sz })),
            correctIdx,
            answersCount: 4,
        };
    }

    // Pick the biggest (or smallest) of 4 tiles showing same emoji at different sizes.
    function genBiggerSmaller() {
        const cat = pick(POOL_KEYS);
        const emoji = pick(POOLS[cat]);
        const pickBiggest = Math.random() < 0.5;
        const sizes = shuffle([1.0, 1.6, 2.2, 2.8]);
        const target = pickBiggest ? 2.8 : 1.0;
        const correctIdx = sizes.indexOf(target);

        return {
            type: "biggersmaller",
            title: pickBiggest ? "Tap the BIGGEST one!" : "Tap the SMALLEST one!",
            stage: { kind: "inline-prompt", text: pickBiggest ? "Find the biggest 👇" : "Find the smallest 👇" },
            options: sizes.map((sz) => ({ kind: "sized", emoji, size: sz })),
            correctIdx,
            answersCount: 4,
        };
    }

    // 4 groups of emoji: 3 have the same count, one has a different count — tap the different.
    function genOddCount() {
        const cat = pick(POOL_KEYS);
        const emoji = pick(POOLS[cat]);
        const commonCount = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
        // Odd count differs by 1 or 2, clamped to >=1
        const delta = Math.random() < 0.5 ? 1 : 2;
        const oddCount = Math.random() < 0.5
            ? Math.max(1, commonCount - delta)
            : commonCount + delta;
        const counts = shuffle([commonCount, commonCount, commonCount, oddCount]);
        const correctIdx = counts.indexOf(oddCount);

        return {
            type: "oddcount",
            title: "Which group is different?",
            stage: { kind: "inline-prompt", text: "One has a different number 👇" },
            options: counts.map((n) => ({ kind: "group", emoji, count: n })),
            correctIdx,
            answersCount: 4,
        };
    }

    const GENERATORS = {
        seq: genSeq,
        odd: genOdd,
        count: genCount,
        samediff: genSameDiff,
        size: genSize,
        biggersmaller: genBiggerSmaller,
        oddcount: genOddCount,
    };

    // Fixed 10-round mix: variety across all pattern types, then shuffled.
    function buildRoundTypes() {
        const mix = [
            "seq", "seq", "seq",
            "odd", "odd",
            "count",
            "samediff",
            "size",
            "biggersmaller",
            "oddcount",
        ];
        return shuffle(mix.slice());
    }

    // ----- Rendering -----
    function renderStage(current) {
        qStageEl.innerHTML = "";
        const s = current.stage;
        if (s.kind === "sequence") {
            s.visible.forEach((emo) => {
                const t = document.createElement("div");
                t.className = "q-tile";
                t.textContent = emo;
                qStageEl.appendChild(t);
            });
            if (s.mystery) qStageEl.appendChild(buildMysteryTile());
        } else if (s.kind === "size-sequence") {
            s.sizes.forEach((sz) => {
                const t = document.createElement("div");
                t.className = "q-tile q-tile-sized";
                t.style.fontSize = `${sz}rem`;
                t.textContent = s.emoji;
                qStageEl.appendChild(t);
            });
            if (s.mystery) qStageEl.appendChild(buildMysteryTile());
        } else if (s.kind === "count-prompt") {
            s.promptCounts.forEach((n) => {
                qStageEl.appendChild(buildGroupEl(s.emoji, n));
            });
            const mystery = document.createElement("div");
            mystery.className = "q-group mystery";
            const mark = document.createElement("span");
            mark.className = "mystery-mark";
            mark.textContent = "?";
            mystery.appendChild(mark);
            qStageEl.appendChild(mystery);
        } else if (s.kind === "inline-prompt") {
            const txt = document.createElement("div");
            txt.className = "q-inline-prompt";
            txt.textContent = s.text;
            qStageEl.appendChild(txt);
        }
    }

    function buildMysteryTile() {
        const m = document.createElement("div");
        m.className = "q-tile mystery";
        m.textContent = "?";
        return m;
    }

    function buildGroupEl(emoji, count) {
        const g = document.createElement("div");
        g.className = "q-group";
        for (let i = 0; i < count; i++) {
            const span = document.createElement("span");
            span.className = "mini";
            span.textContent = emoji;
            g.appendChild(span);
        }
        return g;
    }

    function renderAnswers(current) {
        answersEl.innerHTML = "";
        answersEl.dataset.count = String(current.answersCount);
        current.options.forEach((opt, idx) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ans";
            btn.dataset.idx = String(idx);
            if (opt.kind === "emoji") {
                const span = document.createElement("span");
                span.className = "ans-emoji";
                span.textContent = opt.value;
                btn.appendChild(span);
            } else if (opt.kind === "sized") {
                const span = document.createElement("span");
                span.className = "ans-emoji";
                span.style.fontSize = `${opt.size}rem`;
                span.textContent = opt.emoji;
                btn.appendChild(span);
            } else if (opt.kind === "group") {
                const g = document.createElement("div");
                g.className = "ans-group";
                for (let i = 0; i < opt.count; i++) {
                    const s = document.createElement("span");
                    s.className = "mini";
                    s.textContent = opt.emoji;
                    g.appendChild(s);
                }
                btn.appendChild(g);
            }
            answersEl.appendChild(btn);
        });
    }

    function renderCurrent() {
        if (!state.current) return;
        qTitleEl.textContent = state.current.title;
        renderStage(state.current);
        renderAnswers(state.current);
        qNumEl.textContent = state.qIndex + 1;
        hintEl.className = "hint";
        hintEl.textContent = "Tap the matching tile!";
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
        state.rounds = buildRoundTypes();
        overlay.classList.add("hidden");
        state.running = true;
        nextRound();
    }

    function nextRound() {
        if (state.qIndex >= state.qTotal) {
            endGame();
            return;
        }
        const type = state.rounds[state.qIndex];
        state.current = GENERATORS[type]();
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

        if (idx === c.correctIdx) {
            state.locked = true;
            tile.classList.add("correct");
            playGood();
            const gained = state.mistakes === 0 ? POINTS_FIRST_TRY : POINTS_RETRY;
            state.score += gained;
            scoreEl.textContent = state.score;
            hintEl.className = "hint good";
            hintEl.textContent = `✓ Nice! +${gained}`;
            showCheer();
            flashPad();
            setTimeout(advance, 950);
        } else {
            playBad();
            state.mistakes += 1;
            tile.classList.add("wrong");
            if (state.mistakes === 1) {
                state.locked = true;
                hintEl.className = "hint bad";
                hintEl.textContent = "Not quite — try again!";
                setTimeout(() => {
                    tile.classList.remove("wrong");
                    tile.classList.add("dim");
                    state.locked = false;
                }, 550);
            } else {
                state.locked = true;
                tile.classList.remove("wrong");
                tile.classList.add("dim", "wrong");
                const correctTile = tiles[c.correctIdx];
                if (correctTile) correctTile.classList.add("reveal");
                hintEl.className = "hint bad";
                hintEl.textContent = "This one! 👉";
                setTimeout(advance, 1200);
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
