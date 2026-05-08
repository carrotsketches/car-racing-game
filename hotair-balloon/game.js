(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const heartsEl = document.getElementById("hearts");
    const targetLetterEl = document.getElementById("target-letter");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "hotair-balloon-leaderboard";
    const LB_MAX = 20;

    const W = canvas.width;
    const H = canvas.height;
    const ROUND_SEC = 60;
    const MAX_HEARTS = 3;
    const WORDS = ["CAT", "DOG", "SUN", "MAP", "RED", "BUS", "HAT", "BOX", "PIG", "ANT"];
    let audio = null;

    function sanitizeName(raw) { return (raw || "").trim().slice(0, 12) || "Pilot"; }
    function ensureAudio() {
        if (!audio) { const C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function beep(freq, type, dur, vol = 0.2) {
        const ac = ensureAudio(); if (!ac) return;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + dur);
    }
    function loadLeaderboard() {
        try { const a = JSON.parse(localStorage.getItem(LB_KEY)); return Array.isArray(a) ? a : []; }
        catch (_) { return []; }
    }
    function saveLeaderboard() {
        try { localStorage.setItem(LB_KEY, JSON.stringify(state.leaderboard)); } catch (_) {}
    }
    function personalBest(name) {
        return state.leaderboard.filter(e => e.name === name).reduce((b, e) => Math.max(b, e.score), 0);
    }

    const state = {
        running: false,
        playerName: "",
        leaderboard: loadLeaderboard(),
        score: 0,
        hearts: MAX_HEARTS,
        timeLeft: ROUND_SEC,
        word: "CAT",
        wordIndex: 0,
        letters: [],
        particles: [],
        lastTs: 0,
    };

    function pickWord() {
        state.word = WORDS[Math.floor(Math.random() * WORDS.length)];
        state.wordIndex = 0;
        targetLetterEl.textContent = state.word[state.wordIndex];
    }

    function spawnLetter() {
        const wanted = state.word[state.wordIndex];
        const useWanted = Math.random() < 0.6;
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const ch = useWanted ? wanted : alphabet[Math.floor(Math.random() * alphabet.length)];
        state.letters.push({
            ch,
            x: W + 30,
            y: 55 + Math.random() * (H - 110),
            r: 22,
            vx: 90 + Math.random() * 55,
            bob: Math.random() * Math.PI * 2,
        });
    }

    function updateHearts() {
        heartsEl.textContent = "❤️".repeat(state.hearts) + "🖤".repeat(MAX_HEARTS - state.hearts);
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        state.running = true;
        state.score = 0;
        state.hearts = MAX_HEARTS;
        state.timeLeft = ROUND_SEC;
        state.letters = [];
        state.particles = [];
        state.lastTs = 0;
        pickWord();
        for (let i = 0; i < 4; i++) spawnLetter();
        scoreEl.textContent = "0";
        updateHearts();
        overlay.classList.add("hidden");
        startBtn.textContent = "Play Again ✨";
    }

    function endGame() {
        state.running = false;
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        const best = personalBest(state.playerName);
        bestEl.textContent = best;
        overlayTitle.textContent = "Great Job! 🎉";
        overlayMsg.textContent = `Score: ${state.score}. ${state.score >= best ? "New record!" : "Best: " + best}`;
        overlay.classList.remove("hidden");
    }

    function popParticles(x, y, good) {
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 50 + Math.random() * 80;
            state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, good });
        }
    }

    function tap(x, y) {
        if (!state.running) return;
        for (let i = state.letters.length - 1; i >= 0; i--) {
            const l = state.letters[i];
            const dx = x - l.x;
            const dy = y - l.y;
            if (dx * dx + dy * dy <= l.r * l.r) {
                const want = state.word[state.wordIndex];
                if (l.ch === want) {
                    beep(740, "sine", 0.09, 0.16);
                    state.score += 10;
                    state.wordIndex++;
                    if (state.wordIndex >= state.word.length) {
                        state.score += 20;
                        pickWord();
                    } else {
                        targetLetterEl.textContent = state.word[state.wordIndex];
                    }
                    popParticles(l.x, l.y, true);
                } else {
                    beep(190, "square", 0.12, 0.18);
                    state.hearts--;
                    updateHearts();
                    state.score = Math.max(0, state.score - 2);
                    popParticles(l.x, l.y, false);
                    if (state.hearts <= 0) { endGame(); return; }
                }
                state.letters.splice(i, 1);
                spawnLetter();
                scoreEl.textContent = state.score;
                return;
            }
        }
    }

    function update(dt) {
        if (!state.running) return;
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) { state.timeLeft = 0; endGame(); return; }

        if (Math.random() < dt * 2.6 && state.letters.length < 7) spawnLetter();

        for (let i = state.letters.length - 1; i >= 0; i--) {
            const l = state.letters[i];
            l.x -= l.vx * dt;
            l.bob += dt * 2.6;
            l.y += Math.sin(l.bob) * 0.5;
            if (l.x < -40) {
                state.letters.splice(i, 1);
                spawnLetter();
            }
        }

        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 140 * dt;
            p.life -= dt * 2;
            if (p.life <= 0) state.particles.splice(i, 1);
        }
    }

    function draw() {
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, "#8ed4ee");
        sky.addColorStop(1, "#dff5ff");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        ctx.font = "bold 28px sans-serif";
        ctx.fillStyle = "#174c76";
        ctx.textAlign = "left";
        ctx.fillText(`Word: ${state.word}`, 12, 34);

        for (const l of state.letters) {
            ctx.save();
            ctx.translate(l.x, l.y);
            ctx.fillStyle = "#ffd45e";
            ctx.strokeStyle = "#ad7e12";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, l.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#4a2f00";
            ctx.font = "bold 22px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(l.ch, 0, 1);
            ctx.restore();
        }

        for (const p of state.particles) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.good ? "#35a85a" : "#d44";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) { nameInput.value = saved; playerNameEl.textContent = saved; }
    bestEl.textContent = personalBest(saved);
    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    canvas.addEventListener("pointerdown", (e) => {
        const r = canvas.getBoundingClientRect();
        tap(e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchend", e => e.preventDefault(), { passive: false });

    {
        const hModal = document.getElementById("help-modal");
        document.getElementById("help-btn").addEventListener("click", () => { hModal.hidden = false; });
        document.getElementById("help-close").addEventListener("click", () => { hModal.hidden = true; });
        hModal.addEventListener("click", (e) => { if (e.target === hModal) hModal.hidden = true; });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") hModal.hidden = true; });
    }

    startBtn.addEventListener("click", startGame);

    function loop(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min((ts - state.lastTs) / 1000, 0.05);
        state.lastTs = ts;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    pickWord();
    updateHearts();
    requestAnimationFrame(loop);
})();
