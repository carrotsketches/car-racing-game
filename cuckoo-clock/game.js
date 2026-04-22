(() => {
    const clock = document.getElementById("clock");
    const feedback = document.getElementById("feedback");
    const cuckooCall = document.getElementById("cuckoo-call");
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
    const handHour = document.getElementById("hand-hour");
    const handMinute = document.getElementById("hand-minute");

    const ROUND_MS = 60000;
    const CUCKOO_OUT_MS = 1500;   // window to tap after cuckoo emerges
    const WAIT_MIN_MS = 1400;
    const WAIT_MAX_MS = 3200;
    const EARLY_PENALTY = 1;
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "cuckoo-clock-leaderboard";
    const LB_MAX = 20;

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
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
    }

    const state = {
        running: false,
        score: 0,
        leaderboard: loadLeaderboard(),
        timeLeft: ROUND_MS,
        playerName: "",
        cuckooState: "hidden", // 'hidden' | 'out'
        cuckooOutAt: 0,
        cuckooHideAt: 0,
        nextEmergeAt: 0,
        cuckoos: 0,
        hits: 0,
        timeLow: false,
        clockHour: 12,
    };

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
    function tone({ freq = 440, endFreq = null, type = "sine", duration = 0.15, volume = 0.2, delay = 0 }) {
        const ac = ensureAudio();
        if (!ac) return;
        const start = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq != null) osc.frequency.linearRampToValueAtTime(endFreq, start + duration);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(ac.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
    }
    function playCuckoo() {
        // Two-note cuckoo call: high then low
        tone({ freq: 784, type: "sine", duration: 0.18, volume: 0.22, delay: 0 });
        tone({ freq: 622, type: "sine", duration: 0.22, volume: 0.22, delay: 0.22 });
    }
    function playHit() {
        tone({ freq: 900, endFreq: 1300, type: "triangle", duration: 0.1, volume: 0.22 });
    }
    function playEarly() {
        tone({ freq: 220, endFreq: 140, type: "square", duration: 0.18, volume: 0.18 });
    }
    function playMiss() {
        tone({ freq: 300, endFreq: 180, type: "sawtooth", duration: 0.24, volume: 0.18 });
    }
    function playTick() {
        tone({ freq: 520, type: "triangle", duration: 0.04, volume: 0.1 });
    }
    function playEnd() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22, delay: 0.13 });
        tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24, delay: 0.26 });
    }

    function showPop(text, kind) {
        const el = document.createElement("div");
        el.className = "score-pop " + kind;
        el.textContent = text;
        feedback.innerHTML = "";
        feedback.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.remove(); }, 800);
    }

    function setClockHands(hour) {
        // Hour hand: 30deg per hour, minute always at 12
        const hourDeg = ((hour % 12) / 12) * 360;
        handHour.style.transform = `translate(-50%, -100%) rotate(${hourDeg}deg)`;
        handMinute.style.transform = `translate(-50%, -100%) rotate(0deg)`;
    }

    function emergeCuckoo(now) {
        state.cuckooState = "out";
        state.cuckooOutAt = now;
        state.cuckooHideAt = now + CUCKOO_OUT_MS;
        state.cuckoos += 1;
        state.clockHour = (state.clockHour % 12) + 1;
        setClockHands(state.clockHour);
        clock.classList.add("open");
        playCuckoo();
    }

    function hideCuckoo() {
        state.cuckooState = "hidden";
        state.cuckooOutAt = 0;
        state.cuckooHideAt = 0;
        clock.classList.remove("open");
    }

    function scheduleNext(now) {
        const wait = WAIT_MIN_MS + Math.random() * (WAIT_MAX_MS - WAIT_MIN_MS);
        state.nextEmergeAt = now + wait;
    }

    function onClockTap() {
        if (!state.running) return;
        if (state.cuckooState === "out") {
            const reaction = performance.now() - state.cuckooOutAt;
            // Score: faster = more. Range ~ [1, 20]
            const ratio = Math.max(0, 1 - reaction / CUCKOO_OUT_MS);
            const gained = Math.max(1, Math.round(1 + ratio * 19));
            state.score += gained;
            state.hits += 1;
            scoreEl.textContent = state.score;
            showPop("+" + gained, gained >= 15 ? "great" : "good");
            playHit();
            hideCuckoo();
            scheduleNext(performance.now());
        } else {
            // Early tap: penalty + brief shake
            state.score = Math.max(0, state.score - EARLY_PENALTY);
            scoreEl.textContent = state.score;
            showPop("−" + EARLY_PENALTY + " early!", "bad");
            playEarly();
            clock.classList.add("shake");
            setTimeout(() => clock.classList.remove("shake"), 260);
            // Delay next emergence a bit so spamming doesn't immediately get rewarded
            state.nextEmergeAt = Math.max(state.nextEmergeAt, performance.now() + 700);
        }
    }

    clock.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        clock.classList.add("pressed");
        onClockTap();
    });
    clock.addEventListener("pointerup", () => clock.classList.remove("pressed"));
    clock.addEventListener("pointerleave", () => clock.classList.remove("pressed"));

    // ----- Round flow -----
    function reset() {
        state.score = 0;
        state.timeLeft = ROUND_MS;
        state.cuckoos = 0;
        state.hits = 0;
        state.timeLow = false;
        state.clockHour = 12;
        setClockHands(state.clockHour);
        timeStatEl.classList.remove("low");
        scoreEl.textContent = 0;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        hideCuckoo();
        feedback.innerHTML = "";
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        reset();
        overlay.classList.add("hidden");
        state.running = true;
        scheduleNext(performance.now());
    }

    function endGame() {
        state.running = false;
        timeStatEl.classList.remove("low");
        state.timeLow = false;
        hideCuckoo();
        playEnd();

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();

        const rank = state.leaderboard.indexOf(entry);
        const accuracy = state.cuckoos > 0 ? Math.round((state.hits / state.cuckoos) * 100) : 0;
        let msg = `${state.playerName} scored ${state.score} (${state.hits}/${state.cuckoos} cuckoos, ${accuracy}% hit).`;
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
                // Cuckoo state machine
                if (state.cuckooState === "hidden") {
                    if (now >= state.nextEmergeAt) emergeCuckoo(now);
                } else if (state.cuckooState === "out") {
                    if (now >= state.cuckooHideAt) {
                        // Missed it
                        showPop("missed!", "miss");
                        playMiss();
                        hideCuckoo();
                        scheduleNext(now);
                    }
                }
            }
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    setClockHands(state.clockHour);
    startBtn.addEventListener("click", startGame);

    // Prevent stray gestures on the clock
    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        clock.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });
})();
