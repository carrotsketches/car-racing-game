(() => {
    const piano = document.getElementById("piano");
    const statusEl = document.getElementById("status");
    const scoreEl = document.getElementById("score");
    const roundEl = document.getElementById("round");
    const bestEl = document.getElementById("best");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const hud = document.getElementById("hud");
    const footerText = document.getElementById("footer-text");
    const modeButtons = document.querySelectorAll(".toggle-btn[data-mode]");

    const NOTES = [
        { name: "C", freq: 261.63 },
        { name: "D", freq: 293.66 },
        { name: "E", freq: 329.63 },
        { name: "F", freq: 349.23 },
        { name: "G", freq: 392.00 },
        { name: "A", freq: 440.00 },
        { name: "B", freq: 493.88 },
    ];

    const PLAYBACK_MS = 520;
    const PLAYBACK_GAP_MS = 120;
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "piano-memory-leaderboard";
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
        mode: "memory",
        running: false,
        acceptingInput: false,
        sequence: [],
        inputIndex: 0,
        round: 0,
        score: 0,
        leaderboard: loadLeaderboard(),
        playerName: "",
    };

    // Build piano keys
    const keyEls = [];
    NOTES.forEach((note, i) => {
        const key = document.createElement("div");
        key.className = "white-key";
        key.dataset.index = i;
        key.textContent = note.name;
        key.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            onKeyTap(i);
        });
        piano.appendChild(key);
        keyEls.push(key);
    });

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

    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
    }

    // ----- Audio (Web Audio synth, piano-ish) -----
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }

    function playNote(freq, duration = 0.45, volume = 0.22) {
        const ac = ensureAudio();
        if (!ac) return;
        const now = ac.currentTime;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        gain.connect(ac.destination);

        // Fundamental + 2nd harmonic for a warmer, piano-ish tone
        const osc1 = ac.createOscillator();
        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(freq, now);
        osc1.connect(gain);
        osc1.start(now);
        osc1.stop(now + duration);

        const osc2 = ac.createOscillator();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2, now);
        const gain2 = ac.createGain();
        gain2.gain.setValueAtTime(0.25, now);
        osc2.connect(gain2).connect(gain);
        osc2.start(now);
        osc2.stop(now + duration);
    }

    function playWrong() {
        const ac = ensureAudio();
        if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.4);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        osc.connect(gain).connect(ac.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    function playSuccess() {
        // Little arpeggio
        const tones = [NOTES[0].freq, NOTES[2].freq, NOTES[4].freq, NOTES[6].freq];
        tones.forEach((f, i) => {
            setTimeout(() => playNote(f, 0.28), i * 110);
        });
    }

    // ----- Key visuals -----
    function flashKey(i, kind = "glow", ms = PLAYBACK_MS - 80) {
        const el = keyEls[i];
        if (!el) return;
        el.classList.add(kind);
        setTimeout(() => el.classList.remove(kind), ms);
    }

    function pressKey(i) {
        const el = keyEls[i];
        if (!el) return;
        el.classList.add("active");
        setTimeout(() => el.classList.remove("active"), 140);
    }

    // ----- Round flow -----
    function setStatus(text, cls = "") {
        statusEl.className = "status" + (cls ? " " + cls : "");
        statusEl.textContent = text;
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        nameInput.value = state.playerName;
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.sequence = [];
        state.round = 0;
        state.score = 0;
        scoreEl.textContent = 0;
        roundEl.textContent = 0;
        overlay.classList.add("hidden");
        state.running = true;
        nextRound();
    }

    function nextRound() {
        state.round += 1;
        roundEl.textContent = state.round;
        state.sequence.push(Math.floor(Math.random() * NOTES.length));
        state.inputIndex = 0;
        playSequence();
    }

    function playSequence() {
        state.acceptingInput = false;
        piano.classList.add("locked");
        setStatus("Listen…", "listen");
        const seq = state.sequence.slice();
        seq.forEach((noteIdx, i) => {
            setTimeout(() => {
                flashKey(noteIdx, "glow", PLAYBACK_MS - 80);
                playNote(NOTES[noteIdx].freq, PLAYBACK_MS / 1000);
            }, i * (PLAYBACK_MS + PLAYBACK_GAP_MS));
        });
        const total = seq.length * (PLAYBACK_MS + PLAYBACK_GAP_MS);
        setTimeout(() => {
            if (!state.running) return;
            state.acceptingInput = true;
            piano.classList.remove("locked");
            setStatus("Your turn!", "your-turn");
        }, total + 100);
    }

    function onKeyTap(i) {
        if (state.mode === "free" || !state.running) {
            // Free play — tap keys freely
            ensureAudio();
            pressKey(i);
            playNote(NOTES[i].freq, 0.5);
            return;
        }
        if (!state.acceptingInput) return;

        pressKey(i);
        playNote(NOTES[i].freq, 0.45);

        const expected = state.sequence[state.inputIndex];
        if (i !== expected) {
            gameOver(i);
            return;
        }

        state.inputIndex += 1;
        state.score += 1;
        scoreEl.textContent = state.score;

        if (state.inputIndex >= state.sequence.length) {
            state.acceptingInput = false;
            piano.classList.add("locked");
            setStatus("Nice!", "win");
            setTimeout(() => {
                if (state.running) nextRound();
            }, 700);
        }
    }

    function gameOver(wrongKey) {
        state.running = false;
        state.acceptingInput = false;
        piano.classList.add("locked");
        flashKey(wrongKey, "wrong", 700);
        playWrong();
        setStatus("Oops — wrong note!", "wrong");

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();

        const rank = state.leaderboard.indexOf(entry);
        const reached = state.round;
        let msg = `${state.playerName} reached round ${reached} with ${state.score} notes!`;
        if (state.score > 0 && rank === 0) msg += " 🏆 New top score!";
        else if (state.score > 0 && rank >= 0 && rank < 10) msg += ` You're rank #${rank + 1}.`;

        setTimeout(() => {
            if (state.mode !== "memory") return;
            overlayTitle.textContent = "Game Over";
            overlayMsg.textContent = msg;
            startBtn.textContent = "Play Again";
            overlay.classList.remove("hidden");
        }, 900);
    }

    function setMode(mode) {
        if (state.mode === mode) return;
        state.mode = mode;
        modeButtons.forEach((btn) => {
            btn.classList.toggle("selected", btn.dataset.mode === mode);
        });

        // Stop any in-progress memory game
        state.running = false;
        state.acceptingInput = false;
        keyEls.forEach((el) => el.classList.remove("glow", "wrong", "active"));

        if (mode === "free") {
            hud.classList.add("free-mode");
            piano.classList.remove("locked");
            overlay.classList.add("hidden");
            setStatus("Free play — tap any key!", "your-turn");
            footerText.textContent = "Tap any key to play that note.";
        } else {
            hud.classList.remove("free-mode");
            overlayTitle.textContent = "Ready?";
            overlayMsg.textContent = "Listen to the tune, then tap it back. Each round adds one new note!";
            startBtn.textContent = "Start";
            overlay.classList.remove("hidden");
            setStatus("Press Start to play");
            footerText.textContent = "Tap the keys in the same order you hear them.";
        }
    }

    modeButtons.forEach((btn) => {
        btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });

    startBtn.addEventListener("click", startGame);

    // Prevent stray tap highlights / scroll on piano
    ["touchstart", "touchmove", "touchend"].forEach((evt) => {
        piano.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });

    // Keyboard support: A S D F G H J maps to C D E F G A B
    const keyMap = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6 };
    window.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        const idx = keyMap[e.key.toLowerCase()];
        if (idx != null) {
            e.preventDefault();
            onKeyTap(idx);
        }
    });
})();
