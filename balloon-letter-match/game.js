(() => {
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const SIDE_COUNT = 4;
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "balloon-letter-match-leaderboard";
    const LB_MAX = 20;

    const stage = document.getElementById("stage");
    const balloon = document.getElementById("balloon");
    const leftLetters = document.getElementById("left-letters");
    const rightLetters = document.getElementById("right-letters");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const helpBtn = document.getElementById("help-btn");
    const helpClose = document.getElementById("help-close");
    const helpModal = document.getElementById("help-modal");

    const state = { running:false, score:0, x:0.5, y:0, speed:65, current:"A", leftHit:false, rightHit:false, pointerActive:false, roundClearing:false, leaderboard:[] };

    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
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
    function upsertBest(name, score) {
        if (!name) return;
        const existing = state.leaderboard.find((e) => e.name === name);
        if (existing) {
            if (score > existing.score) { existing.score = score; existing.at = Date.now(); }
        } else {
            state.leaderboard.push({ name, score, at: Date.now() });
        }
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
    }

    state.leaderboard = loadLeaderboard();
    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) { nameInput.value = saved; playerNameEl.textContent = saved; }
    bestEl.textContent = String(personalBest(saved));

    function pickLetter() { return LETTERS[Math.floor(Math.random() * LETTERS.length)]; }
    function pickUniqueLetter(excluded) {
        let letter = pickLetter();
        while (excluded.has(letter)) letter = pickLetter();
        return letter;
    }

    function buildSide(container, isLeft) {
        container.innerHTML = "";
        const matchIndex = Math.floor(Math.random() * SIDE_COUNT);
        const used = new Set([state.current]);
        for (let i = 0; i < SIDE_COUNT; i += 1) {
            const el = document.createElement("div");
            el.className = "target";
            const letter = i === matchIndex ? state.current : pickUniqueLetter(used);
            used.add(letter);
            el.textContent = letter;
            el.dataset.match = String(letter === state.current);
            el.dataset.side = isLeft ? "left" : "right";
            container.appendChild(el);
        }
    }

    function spawn() {
        state.current = pickLetter();
        state.leftHit = false;
        state.rightHit = false;
        state.y = stage.clientHeight - 120;
        balloon.classList.remove("gone");
        leftLetters.classList.remove("gone");
        rightLetters.classList.remove("gone");
        balloon.textContent = state.current;
        buildSide(leftLetters, true);
        buildSide(rightLetters, false);
        positionBalloon();
    }

    function positionBalloon() {
        const minX = 42;
        const maxX = stage.clientWidth - 42;
        const x = minX + state.x * (maxX - minX);
        balloon.style.left = `${x}px`;
        balloon.style.bottom = `${Math.max(8, stage.clientHeight - state.y - 90)}px`;
    }

    function checkHits() {
        const bRect = balloon.getBoundingClientRect();
        const targets = stage.querySelectorAll(".target");
        for (const target of targets) {
            if (target.dataset.match !== "true" || target.classList.contains("hit")) continue;
            const tRect = target.getBoundingClientRect();
            const overlap = !(bRect.right < tRect.left || bRect.left > tRect.right || bRect.bottom < tRect.top || bRect.top > tRect.bottom);
            if (!overlap) continue;

            if (target.dataset.side === "left") state.leftHit = true;
            if (target.dataset.side === "right") state.rightHit = true;
            target.classList.add("hit");
        }

        if (state.leftHit && state.rightHit && !state.roundClearing) {
            state.roundClearing = true;
            state.score += 1;
            scoreEl.textContent = String(state.score);
            upsertBest(playerNameEl.textContent.trim(), state.score);
            bestEl.textContent = String(personalBest(playerNameEl.textContent.trim()));
            balloon.classList.add("gone");
            leftLetters.classList.add("gone");
            rightLetters.classList.add("gone");
            setTimeout(() => {
                if (!state.running) return;
                state.roundClearing = false;
                spawn();
            }, 180);
        }
    }

    function loop(ts) {
        if (!state.running) return;
        if (!loop.last) loop.last = ts;
        const dt = (ts - loop.last) / 1000;
        loop.last = ts;
        state.y -= state.speed * dt;
        if (state.y < -12 && !state.roundClearing) spawn();
        positionBalloon();
        checkHits();
        requestAnimationFrame(loop);
    }

    function startGame() {
        ensureAudio();
        state.running = true;
        state.score = 0;
        state.x = 0.5;
        loop.last = 0;
        scoreEl.textContent = "0";
        const playerName = (nameInput.value || "").trim().slice(0, 12) || "Player";
        localStorage.setItem(NAME_KEY, playerName);
        playerNameEl.textContent = playerName;
        bestEl.textContent = String(personalBest(playerName));
        overlay.classList.add("hidden");
        spawn();
        requestAnimationFrame(loop);
    }


    function setPointer(clientX, clientY) {
        const rect = stage.getBoundingClientRect();
        state.x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        state.y = Math.max(20, Math.min(stage.clientHeight - 90, clientY - rect.top));
        if (state.running) positionBalloon();
    }

    stage.addEventListener("pointerdown", (e) => {
        state.pointerActive = true;
        setPointer(e.clientX, e.clientY);
    });
    stage.addEventListener("pointermove", (e) => { if (state.pointerActive) setPointer(e.clientX, e.clientY); });
    stage.addEventListener("pointerup", () => { state.pointerActive = false; });
    stage.addEventListener("pointercancel", () => { state.pointerActive = false; });
    ["touchstart", "touchmove", "touchend"].forEach((ev) => stage.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

    startBtn.addEventListener("click", startGame);
    helpBtn.addEventListener("click", () => { helpModal.hidden = false; });
    helpClose.addEventListener("click", () => { helpModal.hidden = true; });
    helpModal.addEventListener("click", (e) => { if (e.target === helpModal) helpModal.hidden = true; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") helpModal.hidden = true; });
})();
