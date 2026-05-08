(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const targetLetterEl = document.getElementById("target-letter");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const heatBtn = document.getElementById("heat-btn");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "hotair-balloon-leaderboard";
    const LB_MAX = 20;

    const W = canvas.width;
    const H = canvas.height;
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const SIGHT_WORDS = ["CAT", "DOG", "SUN", "HAT", "MAP", "RED", "BLUE", "JUMP", "LOOK", "PLAY"];

    const state = {
        running: false,
        score: 0,
        distance: 0,
        starBonus: 0,
        playerName: "",
        leaderboard: loadLeaderboard(),
        heating: false,
        balloon: { x: 110, y: 110, vy: 0 },
        collectibles: [],
        particles: [],
        nextSpawn: W + 120,
        currentWord: "CAT",
        nextLetterIndex: 0,
        targetLetter: "C",
    };

    function loadLeaderboard() { try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch (_) { return []; } }
    function saveLeaderboard() { try { localStorage.setItem(LB_KEY, JSON.stringify(state.leaderboard)); } catch (_) {} }
    function personalBest(name) { return state.leaderboard.filter((e) => e.name === name).reduce((b, e) => Math.max(b, e.score), 0); }
    function sanitizeName(raw) { return (raw || "").trim().slice(0, 12) || "Pilot"; }

    function ensureAudio() { return null; }

    function updateWordHud() {
        targetLetterEl.textContent = `${state.currentWord} (${state.nextLetterIndex + 1}/${state.currentWord.length}: ${state.targetLetter})`;
    }

    function pickWord() {
        state.currentWord = SIGHT_WORDS[Math.floor(Math.random() * SIGHT_WORDS.length)];
        state.nextLetterIndex = 0;
        state.targetLetter = state.currentWord[0];
        updateWordHud();
    }

    function advanceWord() {
        state.nextLetterIndex += 1;
        if (state.nextLetterIndex >= state.currentWord.length) {
            state.starBonus += 20;
            pickWord();
            return;
        }
        state.targetLetter = state.currentWord[state.nextLetterIndex];
        updateWordHud();
    }

    function spawnCollectible() {
        state.collectibles.push({
            x: W + 40,
            y: 35 + Math.random() * (H - 95),
            bob: Math.random() * Math.PI * 2,
            letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
            collected: false,
        });
        state.nextSpawn = W + 90 + Math.random() * 120;
    }

    function overlaps(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        Object.assign(state, {
            running: true, score: 0, distance: 0, starBonus: 0, heating: false,
            balloon: { x: 110, y: 110, vy: 0 }, collectibles: [], particles: [], nextSpawn: W + 120,
        });
        pickWord();
        scoreEl.textContent = "0";
        overlay.classList.add("hidden");
        startBtn.textContent = "Play Again! 🎈";
    }

    function endGame() {
        state.running = false;
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);
        overlayTitle.textContent = "Great Spelling! ⭐";
        overlayMsg.textContent = `Score: ${state.score}. Tap Play Again to spell more words!`;
        overlay.classList.remove("hidden");
    }

    function update(dt) {
        if (!state.running) return;
        const b = state.balloon;
        b.vy += (state.heating ? -740 : 420) * dt;
        b.vy = Math.max(-240, Math.min(240, b.vy));
        b.y += b.vy * dt;
        b.y = Math.max(18, Math.min(H - 98, b.y));
        if (b.y === 18 || b.y === H - 98) b.vy = 0;

        state.distance += 90 * dt;
        state.score = Math.floor(state.distance / 10) + state.starBonus;
        scoreEl.textContent = String(state.score);

        if (state.distance + W > state.nextSpawn) spawnCollectible();

        const hitbox = { x: b.x + 10, y: b.y + 8, w: 40, h: 52 };
        for (let i = state.collectibles.length - 1; i >= 0; i--) {
            const c = state.collectibles[i];
            c.x -= 110 * dt;
            c.bob += 2 * dt;
            if (c.x < -30) { state.collectibles.splice(i, 1); continue; }
            const s = { x: c.x - 14, y: c.y - 14, w: 28, h: 28 };
            if (!c.collected && overlaps(hitbox, s)) {
                c.collected = true;
                if (c.letter === state.targetLetter) {
                    state.starBonus += 12;
                    advanceWord();
                } else {
                    state.starBonus += 1;
                }
                state.collectibles.splice(i, 1);
            }
        }
    }

    function drawStar(x, y, bob, letter) {
        const s = 12 * (1 + Math.sin(bob) * 0.14);
        ctx.save();
        ctx.translate(x, y + Math.sin(bob) * 3);
        ctx.fillStyle = "#f5d020";
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const ai = a + Math.PI / 5;
            if (i === 0) ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
            else ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
            ctx.lineTo(Math.cos(ai) * s * 0.4, Math.sin(ai) * s * 0.4);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#5a3a00";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(letter, 0, 0);
        ctx.restore();
    }

    function drawBalloon() {
        const by = state.balloon.y;
        const cx = state.balloon.x + 30;
        ctx.fillStyle = "#ff8fab";
        ctx.beginPath();
        ctx.ellipse(cx, by + 34, 30, 38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8b6914";
        ctx.fillRect(cx - 12, by + 78, 24, 14);
        ctx.strokeStyle = "#8b7355";
        ctx.beginPath(); ctx.moveTo(cx - 8, by + 68); ctx.lineTo(cx - 9, by + 78); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, by + 68); ctx.lineTo(cx + 9, by + 78); ctx.stroke();
    }

    function draw() {
        ctx.fillStyle = "#8ed4ee";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#23415f";
        ctx.fillRect(0, H - 20, W, 20);

        for (const c of state.collectibles) drawStar(c.x, c.y, c.bob, c.letter);
        drawBalloon();
    }

    function setHeat(on) { if (state.running) state.heating = on; }

    document.addEventListener("keydown", (e) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); setHeat(true); } });
    document.addEventListener("keyup", (e) => { if (e.code === "Space" || e.code === "ArrowUp") setHeat(false); });
    canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); setHeat(true); });
    canvas.addEventListener("pointerup", (e) => { e.preventDefault(); setHeat(false); });
    canvas.addEventListener("pointercancel", () => setHeat(false));

    heatBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); heatBtn.classList.add("active"); setHeat(true); });
    heatBtn.addEventListener("pointerup", (e) => { e.preventDefault(); heatBtn.classList.remove("active"); setHeat(false); });
    heatBtn.addEventListener("pointercancel", () => { heatBtn.classList.remove("active"); setHeat(false); });

    {
        const hModal = document.getElementById("help-modal");
        document.getElementById("help-btn").addEventListener("click", () => { hModal.hidden = false; });
        document.getElementById("help-close").addEventListener("click", () => { hModal.hidden = true; });
        hModal.addEventListener("click", (e) => { if (e.target === hModal) hModal.hidden = true; });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") hModal.hidden = true; });
    }

    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) { nameInput.value = saved; playerNameEl.textContent = saved; }
    bestEl.textContent = personalBest(saved);

    startBtn.addEventListener("click", startGame);

    let last = null;
    function loop(ts) {
        if (!last) last = ts;
        const dt = Math.min((ts - last) / 1000, 0.05);
        last = ts;
        update(dt);
        draw();
        if (state.running && state.score >= 150) endGame();
        requestAnimationFrame(loop);
    }

    pickWord();
    requestAnimationFrame(loop);
})();
