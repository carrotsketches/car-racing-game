(() => {
    // ----- DOM refs -----
    const stage = document.getElementById("stage");
    const playArea = document.getElementById("play-area");
    const bins = document.getElementById("bins");
    const binRecycle = document.getElementById("bin-recycle");
    const binTrash = document.getElementById("bin-trash");
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
    const diffBtns = document.querySelectorAll(".toggle-btn[data-diff]");

    // ----- Constants -----
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "earth-day-leaderboard";
    const DIFF_KEY = "earth-day-difficulty";
    const LB_MAX = 20;
    const ROUND_MS = 60000;
    const BASE_FALL_PX_PER_S = 70;    // starting speed
    const RAMP_STEP = 0.12;           // +12% speed every ramp interval
    const RAMP_INTERVAL_MS = 10000;   // ramp every 10s
    const SPAWN_MIN_MS = 1200;
    const SPAWN_MAX_MS = 2000;
    const COOLDOWN_AFTER_WRONG_MS = 400;

    const CATALOG = [
        { emoji: "📰", category: "recycle" },
        { emoji: "🥤", category: "recycle" },
        { emoji: "🍾", category: "recycle" },
        { emoji: "🗞️", category: "recycle" },
        { emoji: "📦", category: "recycle" },
        { emoji: "🥫", category: "recycle" },
        { emoji: "🍌", category: "trash" },
        { emoji: "🍎", category: "trash" },
        { emoji: "🧻", category: "trash" },
        { emoji: "🦴", category: "trash" },
        { emoji: "🍕", category: "trash" },
        { emoji: "👟", category: "trash" },
    ];

    // ----- Leaderboard -----
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

    // ----- State -----
    const savedDiff = localStorage.getItem(DIFF_KEY) === "medium" ? "medium" : "easy";

    const state = {
        running: false,
        score: 0,
        playerName: "",
        leaderboard: loadLeaderboard(),
        timeLeft: ROUND_MS,
        difficulty: savedDiff,
        items: [],
        spawnCooldown: 0,
        ramp: 1,
        rampTimer: 0,
        timeLow: false,
    };

    function maxConcurrent() {
        return state.difficulty === "medium" ? 2 : 1;
    }

    // ----- Name handling -----
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

    // ----- Difficulty toggle -----
    function updateDiffUI() {
        diffBtns.forEach((b) => {
            b.classList.toggle("selected", b.dataset.diff === state.difficulty);
        });
    }
    updateDiffUI();

    diffBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const d = btn.dataset.diff;
            if (d !== "easy" && d !== "medium") return;
            if (d === state.difficulty) return;
            state.difficulty = d;
            localStorage.setItem(DIFF_KEY, d);
            updateDiffUI();
        });
    });

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
    function playGood() {
        // 2-note rising chime
        tone({ freq: 660, type: "triangle", duration: 0.12, volume: 0.22 });
        setTimeout(() => tone({ freq: 990, type: "triangle", duration: 0.16, volume: 0.22 }), 90);
    }
    function playBad() {
        // single low thud
        tone({ freq: 160, endFreq: 100, type: "sine", duration: 0.22, volume: 0.22 });
    }
    function playTick() {
        tone({ freq: 540, type: "triangle", duration: 0.05, volume: 0.12 });
    }
    function playEnd() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }

    // ----- Items -----
    function randomCatalogEntry() {
        return CATALOG[Math.floor(Math.random() * CATALOG.length)];
    }

    function activeItemCount() {
        let n = 0;
        for (const it of state.items) if (!it.removed) n += 1;
        return n;
    }

    function spawnItem() {
        if (activeItemCount() >= maxConcurrent()) return;
        const entry = randomCatalogEntry();
        const el = document.createElement("div");
        el.className = "item";
        el.textContent = entry.emoji;
        playArea.appendChild(el);

        const width = playArea.clientWidth || 320;
        // Keep item centers padded from edges so the circle stays on-stage.
        const pad = 40;
        const x = pad + Math.random() * Math.max(1, width - pad * 2);
        const y = -40; // start just above top

        const item = {
            el,
            x,
            y,
            vy: BASE_FALL_PX_PER_S * state.ramp * (0.9 + Math.random() * 0.2),
            emoji: entry.emoji,
            category: entry.category,
            dragging: false,
            dragOffX: 0,
            dragOffY: 0,
            pointerId: null,
            removed: false,
        };

        updateItemTransform(item);
        attachItemPointerHandlers(item);
        state.items.push(item);
    }

    function updateItemTransform(item) {
        const tx = `${item.x}px`;
        const ty = `${item.y}px`;
        item.el.style.setProperty("--x", tx);
        item.el.style.setProperty("--y", ty);
        item.el.style.transform = `translate3d(${tx}, ${ty}, 0)`;
    }

    function removeItem(item) {
        if (item.removed) return;
        item.removed = true;
        if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
    }

    function clearAllItems() {
        for (const it of state.items) {
            if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
            it.removed = true;
        }
        state.items.length = 0;
    }

    function nearestItemToBottom() {
        let best = null;
        let bestY = -Infinity;
        for (const it of state.items) {
            if (it.removed) continue;
            if (it.y > bestY) { bestY = it.y; best = it; }
        }
        return best;
    }

    // ----- Scoring & feedback -----
    function spawnLeafBurst(x, y) {
        const count = 8;
        for (let i = 0; i < count; i++) {
            const leaf = document.createElement("div");
            leaf.className = "leaf";
            leaf.textContent = "🍃";
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const dist = 40 + Math.random() * 60;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist - 20;
            leaf.style.setProperty("--lx", `${x}px`);
            leaf.style.setProperty("--ly", `${y}px`);
            leaf.style.setProperty("--dx", `${dx}px`);
            leaf.style.setProperty("--dy", `${dy}px`);
            leaf.style.setProperty("--rot", `${(Math.random() * 2 - 1) * 540}deg`);
            stage.appendChild(leaf);
            setTimeout(() => leaf.remove(), 950);
        }
    }

    function spawnScorePop(x, y, text) {
        const pop = document.createElement("div");
        pop.className = "score-pop";
        pop.textContent = text;
        pop.style.setProperty("--sx", `${x}px`);
        pop.style.setProperty("--sy", `${y}px`);
        stage.appendChild(pop);
        setTimeout(() => pop.remove(), 720);
    }

    function binFlash(bin, kind) {
        const cls = kind === "good" ? "flash-good" : "flash-bad";
        bin.classList.remove(cls);
        void bin.offsetWidth;
        bin.classList.add(cls);
        setTimeout(() => bin.classList.remove(cls), 400);
    }

    function sortInto(item, category) {
        if (!state.running || !item || item.removed) return;
        const binEl = category === "recycle" ? binRecycle : binTrash;
        if (item.category === category) {
            // Correct
            state.score += 1;
            scoreEl.textContent = state.score;
            playGood();
            binFlash(binEl, "good");
            // Burst originates at item's center within stage coords.
            const stageRect = stage.getBoundingClientRect();
            const playRect = playArea.getBoundingClientRect();
            const cx = item.x + (playRect.left - stageRect.left);
            const cy = item.y + (playRect.top - stageRect.top);
            spawnLeafBurst(cx, cy);
            spawnScorePop(cx, cy, "+1");
            // Animate item away then remove
            item.el.classList.add("correct");
            const it = item;
            setTimeout(() => removeItem(it), 320);
            // Stop updating its position in the loop
            item.removed = true;
        } else {
            // Wrong — bounce back to top with short cooldown
            playBad();
            binFlash(binEl, "bad");
            item.el.classList.add("wrong");
            const width = playArea.clientWidth || 320;
            const pad = 40;
            item.x = pad + Math.random() * Math.max(1, width - pad * 2);
            item.y = -40;
            item.vy = BASE_FALL_PX_PER_S * state.ramp * (0.9 + Math.random() * 0.2);
            updateItemTransform(item);
            // Brief cooldown: pause fall by setting a timer
            item.cooldownUntil = performance.now() + COOLDOWN_AFTER_WRONG_MS;
            setTimeout(() => {
                if (item.el) item.el.classList.remove("wrong");
            }, 340);
        }
    }

    // Auto-sort an item into the closer bin (by x-position relative to play area center).
    function autoSort(item) {
        if (!item || item.removed) return;
        const width = playArea.clientWidth || 320;
        const cat = item.x < width / 2 ? "recycle" : "trash";
        sortInto(item, cat);
    }

    // ----- Bin interactions -----
    function onBinTap(category) {
        if (!state.running) return;
        const item = nearestItemToBottom();
        if (!item) return;
        sortInto(item, category);
    }

    binRecycle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onBinTap("recycle");
    });
    binTrash.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onBinTap("trash");
    });

    // Keyboard: ← trash, → recycling
    window.addEventListener("keydown", (e) => {
        if (!state.running) return;
        if (e.key === "ArrowLeft") { onBinTap("trash"); e.preventDefault(); }
        else if (e.key === "ArrowRight") { onBinTap("recycle"); e.preventDefault(); }
    });

    // ----- Drag handling (pointermove from item to bin) -----
    function attachItemPointerHandlers(item) {
        item.el.addEventListener("pointerdown", (e) => {
            if (!state.running) return;
            e.preventDefault();
            e.stopPropagation();
            item.dragging = true;
            item.pointerId = e.pointerId;
            const rect = item.el.getBoundingClientRect();
            item.dragOffX = e.clientX - (rect.left + rect.width / 2);
            item.dragOffY = e.clientY - (rect.top + rect.height / 2);
            item.el.classList.add("dragging");
            try { item.el.setPointerCapture(e.pointerId); } catch (_) {}
        });

        item.el.addEventListener("pointermove", (e) => {
            if (!item.dragging || item.pointerId !== e.pointerId) return;
            const playRect = playArea.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            // Convert pointer to play-area local coords.
            const localX = e.clientX - playRect.left - item.dragOffX;
            const localY = e.clientY - playRect.top - item.dragOffY;
            item.x = localX;
            item.y = localY;
            updateItemTransform(item);
            // Highlight whichever bin we're over.
            const overBin = binUnderPoint(e.clientX, e.clientY);
            setBinTarget(overBin);
        });

        function endDrag(e) {
            if (!item.dragging) return;
            if (item.pointerId !== e.pointerId) return;
            item.dragging = false;
            item.el.classList.remove("dragging");
            try { item.el.releasePointerCapture(e.pointerId); } catch (_) {}
            setBinTarget(null);
            const overBin = binUnderPoint(e.clientX, e.clientY);
            if (overBin) {
                sortInto(item, overBin);
            }
            item.pointerId = null;
        }
        item.el.addEventListener("pointerup", endDrag);
        item.el.addEventListener("pointercancel", endDrag);
    }

    function binUnderPoint(clientX, clientY) {
        const r = binRecycle.getBoundingClientRect();
        const t = binTrash.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return "recycle";
        if (clientX >= t.left && clientX <= t.right && clientY >= t.top && clientY <= t.bottom) return "trash";
        return null;
    }

    function setBinTarget(which) {
        binRecycle.classList.toggle("target", which === "recycle");
        binTrash.classList.toggle("target", which === "trash");
    }

    // ----- Round flow -----
    function resetRound() {
        state.score = 0;
        state.timeLeft = ROUND_MS;
        state.spawnCooldown = 500;
        state.ramp = 1;
        state.rampTimer = 0;
        state.timeLow = false;
        timeStatEl.classList.remove("low");
        scoreEl.textContent = 0;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        clearAllItems();
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        resetRound();
        overlay.classList.add("hidden");
        state.running = true;
    }

    function endGame() {
        state.running = false;
        timeStatEl.classList.remove("low");
        state.timeLow = false;
        playEnd();
        clearAllItems();
        setBinTarget(null);

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();

        const rank = state.leaderboard.indexOf(entry);
        let msg = `${state.playerName} sorted ${state.score} item${state.score === 1 ? "" : "s"}!`;
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
            // Timer
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

                // Speed ramp
                state.rampTimer += dt;
                if (state.rampTimer >= RAMP_INTERVAL_MS) {
                    state.rampTimer -= RAMP_INTERVAL_MS;
                    state.ramp *= 1 + RAMP_STEP;
                }

                // Move items
                const playH = playArea.clientHeight || 320;
                for (const item of state.items) {
                    if (item.removed || item.dragging) continue;
                    if (item.cooldownUntil && now < item.cooldownUntil) continue;
                    item.y += (item.vy * state.ramp * dt) / 1000;
                    updateItemTransform(item);
                    if (item.y >= playH - 20) {
                        autoSort(item);
                    }
                }

                // Purge removed items so array doesn't grow.
                for (let i = state.items.length - 1; i >= 0; i--) {
                    if (state.items[i].removed && !state.items[i].el.parentNode) {
                        state.items.splice(i, 1);
                    }
                }

                // Spawn
                state.spawnCooldown -= dt;
                if (state.spawnCooldown <= 0 && activeItemCount() < maxConcurrent()) {
                    spawnItem();
                    // Spawn cadence tightens in step with the fall-speed ramp.
                    const rampScale = 1 / Math.max(1, state.ramp);
                    const minC = SPAWN_MIN_MS * rampScale;
                    const maxC = SPAWN_MAX_MS * rampScale;
                    state.spawnCooldown = minC + Math.random() * Math.max(1, maxC - minC);
                }
            }
        }

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    startBtn.addEventListener("click", startGame);

    // Prevent stray touch behaviors (scroll / pinch) on the stage.
    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        stage.addEventListener(evt, (e) => {
            // Allow typing in the name input via the overlay.
            if (e.target && e.target.tagName === "INPUT") return;
            e.preventDefault();
        }, { passive: false });
    });
})();
