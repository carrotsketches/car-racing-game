(() => {
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const wordsCookedEl = document.getElementById("words-cooked");
    const targetWordEl = document.getElementById("target-word");
    const wordTilesEl = document.getElementById("word-tiles");
    const helpBtn = document.getElementById("help-btn");
    const helpModal = document.getElementById("help-modal");
    const helpClose = document.getElementById("help-close");

    const Lib = window.GameLib || {};
    const NAME_KEY = Lib.NAME_KEY || "highway-dash-last-name";
    const LB_KEY = "letter-chef-leaderboard";
    const LB_MAX = 20;
    const WORDS = [
        "CAT", "DOG", "BUS", "PIG", "HEN", "SUN", "CUP", "HAT", "LOG", "FAN",
        "BED", "MAP", "JAR", "RUG", "MOP", "BOX", "LEG", "FIG", "CAN", "WEB",
    ];
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const TINTS = ["#fff4d8", "#ffe0df", "#e1f5d6", "#dcecff", "#fff2b8"];
    const DISHES = ["🥘", "🍲", "🍝", "🥣", "🍜", "🥗"];

    const state = {
        running: false,
        score: 0,
        playerName: "",
        leaderboard: loadLeaderboard(),
        wordQueue: [],
        wordIndex: 0,
        currentWord: "CAT",
        letterIndex: 0,
        wordsCooked: 0,
        lastFrame: 0,
        jars: [],
        splats: [],
        drops: [],
        celebration: null,
        speedMultiplier: 1,
    };

    let audio = null;
    let animationId = 0;

    function loadLeaderboard() {
        if (Lib.loadLeaderboard) return Lib.loadLeaderboard(localStorage, LB_KEY);
        try {
            const raw = localStorage.getItem(LB_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }

    function saveLeaderboard() {
        if (Lib.saveLeaderboard) return Lib.saveLeaderboard(localStorage, LB_KEY, state.leaderboard);
        try { localStorage.setItem(LB_KEY, JSON.stringify(state.leaderboard)); } catch (_) {}
    }

    function personalBest(name) {
        if (Lib.personalBest) return Lib.personalBest(state.leaderboard, name);
        let best = 0;
        for (const e of state.leaderboard) if (e.name === name && e.score > best) best = e.score;
        return best;
    }

    function sanitizeName(raw) {
        return Lib.sanitizeName ? Lib.sanitizeName(raw) : ((raw || "").trim().slice(0, 12) || "Player");
    }

    function clampName(raw) {
        return Lib.clampName ? Lib.clampName(raw) : (raw || "").trim().slice(0, 12);
    }

    function shuffle(arr) {
        return Lib.shuffle ? Lib.shuffle(arr) : arr.slice().sort(() => Math.random() - 0.5);
    }

    function pick(arr) {
        return Lib.pick ? Lib.pick(arr) : arr[Math.floor(Math.random() * arr.length)];
    }

    function saveBestProgress() {
        if (!state.playerName || state.score <= personalBest(state.playerName)) return;
        const next = state.leaderboard.filter((entry) => entry && entry.name !== state.playerName);
        next.push({ name: state.playerName, score: state.score, at: Date.now() });
        next.sort((a, b) => b.score - a.score);
        state.leaderboard = next.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);
    }

    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) {
        nameInput.value = saved;
        playerNameEl.textContent = saved;
    }
    bestEl.textContent = personalBest(saved);
    scoreEl.textContent = "0";
    wordsCookedEl.textContent = "0";

    nameInput.addEventListener("input", () => {
        const n = clampName(nameInput.value);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    startBtn.addEventListener("click", startGame);
    canvas.addEventListener("pointerdown", handlePointerDown);
    ["touchstart", "touchmove", "touchend"].forEach((type) => {
        canvas.addEventListener(type, (event) => event.preventDefault(), { passive: false });
    });

    function openHelp() {
        helpModal.hidden = false;
    }

    function closeHelp() {
        helpModal.hidden = true;
    }

    helpBtn.addEventListener("click", openHelp);
    helpClose.addEventListener("click", closeHelp);
    helpModal.addEventListener("click", (event) => {
        if (event.target === helpModal) closeHelp();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !helpModal.hidden) closeHelp();
    });

    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }

    function tone(freq, start, duration, type, gainValue) {
        const a = ensureAudio();
        if (!a) return;
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.type = type || "sine";
        osc.frequency.setValueAtTime(freq, a.currentTime + start);
        gain.gain.setValueAtTime(0.0001, a.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(gainValue || 0.12, a.currentTime + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(a.destination);
        osc.start(a.currentTime + start);
        osc.stop(a.currentTime + start + duration + 0.03);
    }

    function playCorrect() {
        tone(523.25, 0, 0.12, "sine", 0.11);
        tone(659.25, 0.1, 0.14, "sine", 0.12);
    }

    function playWrong() {
        tone(130.81, 0, 0.15, "sawtooth", 0.045);
    }

    function playWordComplete() {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(freq, i * 0.09, 0.14, "triangle", 0.1));
    }

    function recordStartedPlay() {
        const script = document.createElement("script");
        script.src = "../shared/play-tracker.js";
        script.dataset.slug = "letter-chef";
        script.async = true;
        document.body.appendChild(script);
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        recordStartedPlay();
        playerNameEl.textContent = state.playerName;
        bestEl.textContent = personalBest(state.playerName);

        state.running = true;
        state.score = 0;
        state.wordsCooked = 0;
        state.wordQueue = shuffle(WORDS);
        state.wordIndex = 0;
        state.letterIndex = 0;
        state.jars = [];
        state.splats = [];
        state.drops = [];
        state.celebration = null;
        state.lastFrame = performance.now();
        scoreEl.textContent = "0";
        wordsCookedEl.textContent = "0";
        overlay.classList.add("hidden");
        loadWord();
        cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(loop);
    }

    function loadWord() {
        if (state.wordIndex >= state.wordQueue.length) {
            state.wordQueue = shuffle(WORDS);
            state.wordIndex = 0;
        }
        state.currentWord = state.wordQueue[state.wordIndex];
        state.wordIndex += 1;
        state.letterIndex = 0;
        targetWordEl.textContent = state.currentWord;
        renderWordTiles();
        spawnWave();
    }

    function renderWordTiles() {
        wordTilesEl.innerHTML = "";
        state.currentWord.split("").forEach((letter, index) => {
            const tile = document.createElement("div");
            tile.className = "word-tile" + (index < state.letterIndex ? " filled" : "");
            tile.textContent = index < state.letterIndex ? letter : "_";
            wordTilesEl.appendChild(tile);
        });
    }

    function currentLetter() {
        return state.currentWord[state.letterIndex];
    }

    function baseSpeed() {
        state.speedMultiplier = Math.min(1.8, 1 + Math.floor(state.wordsCooked / 3) * 0.12);
        return 68 * state.speedMultiplier;
    }

    function spawnWave() {
        const needed = currentLetter();
        if (!needed) return;
        const distractorCount = state.wordsCooked >= 5 ? 3 : 2;
        const letters = [needed];
        const unavailable = new Set([needed]);
        while (letters.length < distractorCount + 1) {
            const l = pick(LETTERS);
            if (!unavailable.has(l)) {
                unavailable.add(l);
                letters.push(l);
            }
        }
        const shuffled = shuffle(letters);
        const jarW = 78;
        const spacing = 150;
        state.jars = shuffled.map((letter, i) => ({
            letter,
            correct: letter === needed,
            x: -jarW - (shuffled.length - 1 - i) * spacing,
            y: 197,
            w: jarW,
            h: 96,
            tint: pick(TINTS),
            id: Math.random(),
        }));
    }

    function handlePointerDown(event) {
        if (!state.running || state.celebration) return;
        ensureAudio();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        for (let i = state.jars.length - 1; i >= 0; i--) {
            const jar = state.jars[i];
            if (x >= jar.x && x <= jar.x + jar.w && y >= jar.y && y <= jar.y + jar.h) {
                if (jar.correct) collectJar(jar);
                else splatJar(jar, i);
                return;
            }
        }
    }

    function collectJar(jar) {
        playCorrect();
        state.drops.push({
            letter: jar.letter,
            x: jar.x + jar.w / 2,
            y: jar.y + jar.h / 2,
            startX: jar.x + jar.w / 2,
            startY: jar.y + jar.h / 2,
            age: 0,
            duration: 0.42,
            tint: jar.tint,
        });
        state.letterIndex += 1;
        renderWordTiles();
        state.jars = [];
        if (state.letterIndex >= state.currentWord.length) {
            completeWord();
        } else {
            spawnWave();
        }
    }

    function splatJar(jar, index) {
        playWrong();
        state.splats.push({ x: jar.x + jar.w / 2, y: 330, tint: jar.tint, age: 0, duration: 0.38, letter: jar.letter });
        state.jars.splice(index, 1);
    }

    function completeWord() {
        state.score += 10;
        state.wordsCooked += 1;
        scoreEl.textContent = String(state.score);
        wordsCookedEl.textContent = String(state.wordsCooked);
        saveBestProgress();
        playWordComplete();
        state.celebration = { age: 0, duration: 1.5, dish: pick(DISHES) };
        setTimeout(() => {
            if (state.running) {
                state.celebration = null;
                loadWord();
            }
        }, 1500);
    }

    function loop(now) {
        const dt = Math.min(0.05, (now - state.lastFrame) / 1000 || 0);
        state.lastFrame = now;
        update(dt);
        draw();
        animationId = requestAnimationFrame(loop);
    }

    function update(dt) {
        if (state.running && !state.celebration) {
            const speed = baseSpeed();
            state.jars.forEach((jar) => { jar.x += speed * dt; });
            const missedCorrect = state.jars.some((jar) => jar.correct && jar.x > canvas.width + 30);
            state.jars = state.jars.filter((jar) => jar.x < canvas.width + 100);
            if (missedCorrect) spawnWave();
        }
        state.splats.forEach((s) => { s.age += dt; });
        state.splats = state.splats.filter((s) => s.age < s.duration);
        state.drops.forEach((d) => {
            d.age += dt;
            const t = Math.min(1, d.age / d.duration);
            d.x = d.startX + (canvas.width / 2 - d.startX) * t;
            d.y = d.startY + (390 - d.startY) * t + Math.sin(t * Math.PI) * -45;
        });
        state.drops = state.drops.filter((d) => d.age < d.duration);
        if (state.celebration) state.celebration.age += dt;
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        drawConveyor();
        state.jars.forEach(drawJar);
        state.splats.forEach(drawSplat);
        state.drops.forEach(drawDrop);
        drawPot();
        if (state.celebration) drawCelebration(state.celebration);
    }

    function drawBackground() {
        const g = ctx.createRadialGradient(canvas.width / 2, 20, 20, canvas.width / 2, 20, 560);
        g.addColorStop(0, "#1b2735");
        g.addColorStop(1, "#090a0f");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(220, 80, 50, 0.08)";
        ctx.beginPath();
        ctx.arc(110, 70, 80, 0, Math.PI * 2);
        ctx.arc(650, 420, 110, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawConveyor() {
        const y = 250;
        ctx.fillStyle = "#4b2c1c";
        roundRect(34, y, canvas.width - 68, 58, 22);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 226, 176, 0.18)";
        ctx.lineWidth = 4;
        for (let x = 54; x < canvas.width - 50; x += 30) {
            ctx.beginPath();
            ctx.moveTo(x, y + 8);
            ctx.lineTo(x + 16, y + 50);
            ctx.stroke();
        }
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.font = "900 28px 'Trebuchet MS', sans-serif";
        ctx.fillText("→", canvas.width - 58, y + 38);
    }

    function drawJar(jar) {
        ctx.save();
        ctx.translate(jar.x, jar.y);
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = jar.tint;
        roundRect(0, 14, jar.w, jar.h - 14, 18);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#d28d45";
        roundRect(12, 0, jar.w - 24, 24, 9);
        ctx.fill();
        ctx.strokeStyle = "rgba(80, 50, 30, 0.28)";
        ctx.lineWidth = 3;
        roundRect(0, 14, jar.w, jar.h - 14, 18);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
        roundRect(10, 28, jar.w - 20, 42, 12);
        ctx.fill();
        ctx.fillStyle = jar.correct ? "#c9462b" : "#1b4f8a";
        ctx.font = "900 48px 'Trebuchet MS', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(jar.letter, jar.w / 2, 54);
        ctx.restore();
    }

    function drawDrop(drop) {
        ctx.save();
        const scale = 1 - Math.min(0.35, drop.age / drop.duration * 0.35);
        ctx.translate(drop.x, drop.y);
        ctx.scale(scale, scale);
        ctx.fillStyle = drop.tint;
        roundRect(-30, -34, 60, 68, 14);
        ctx.fill();
        ctx.fillStyle = "#c9462b";
        ctx.font = "900 34px 'Trebuchet MS', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(drop.letter, 0, 0);
        ctx.restore();
    }

    function drawSplat(splat) {
        const t = splat.age / splat.duration;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.translate(splat.x, splat.y);
        ctx.scale(1 + t * 0.6, 0.45 + t * 0.2);
        ctx.fillStyle = splat.tint;
        ctx.beginPath();
        ctx.ellipse(0, 0, 38, 19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(201, 70, 43, 0.72)";
        ctx.font = "900 24px 'Trebuchet MS', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(splat.letter, 0, 2);
        ctx.restore();
    }

    function drawPot() {
        const cx = canvas.width / 2;
        const y = 376;
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.beginPath();
        ctx.ellipse(cx, y + 92, 138, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8b2f24";
        roundRect(cx - 112, y + 18, 224, 112, 38);
        ctx.fill();
        ctx.fillStyle = "#c94a2e";
        roundRect(cx - 124, y, 248, 40, 20);
        ctx.fill();
        ctx.fillStyle = "#ffd1a1";
        ctx.beginPath();
        ctx.ellipse(cx, y + 20, 92, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5b221c";
        roundRect(cx - 145, y + 28, 34, 32, 16);
        ctx.fill();
        roundRect(cx + 111, y + 28, 34, 32, 16);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        roundRect(cx - 76, y + 48, 152, 20, 10);
        ctx.fill();
        ctx.font = "700 58px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🫕", cx, y + 72);
        ctx.restore();
    }

    function drawCelebration(celebration) {
        const t = Math.min(1, celebration.age / celebration.duration);
        const cx = canvas.width / 2;
        ctx.save();
        for (let i = 0; i < 5; i++) {
            const x = cx - 90 + i * 45 + Math.sin((celebration.age + i) * 5) * 8;
            const y = 342 - t * 55 - i % 2 * 18;
            ctx.globalAlpha = 1 - t * 0.35;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(x, y + 34);
            ctx.quadraticCurveTo(x - 18, y + 12, x, y - 8);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.font = "76px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(celebration.dish, cx, 318 - Math.sin(t * Math.PI) * 14);
        ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
    }

    renderWordTiles();
    draw();
})();
