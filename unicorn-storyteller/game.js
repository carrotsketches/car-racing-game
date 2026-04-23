(() => {
    const overlay = document.getElementById("overlay");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const storyCountEl = document.getElementById("story-count");
    const sentenceTray = document.getElementById("sentence-tray");
    const tilesEl = document.getElementById("tiles");
    const unicornEl = document.getElementById("unicorn");
    const sceneProps = document.getElementById("scene-props");
    const sceneFx = document.getElementById("scene-fx");
    const nextBtn = document.getElementById("next-btn");
    const speakBtn = document.getElementById("speak-btn");
    const storyBook = document.getElementById("story-book");
    const storyBookList = document.getElementById("story-book-list");
    const modeBtns = document.querySelectorAll(".toggle-btn[data-mode]");

    const NAME_KEY = "highway-dash-last-name";
    const STORIES_KEY = "unicorn-storyteller-stories";
    const STORIES_MAX = 20;
    const STORY_BOOK_THRESHOLD = 3;

    const WORDS = {
        nouns: [
            { word: "unicorn", emoji: "🦄" },
            { word: "rainbow", emoji: "🌈" },
            { word: "castle", emoji: "🏰" },
            { word: "star", emoji: "⭐" },
            { word: "cake", emoji: "🎂" },
            { word: "bird", emoji: "🐦" },
            { word: "flower", emoji: "🌸" },
            { word: "moon", emoji: "🌙" },
            { word: "sun", emoji: "☀️" },
            { word: "cloud", emoji: "☁️" },
        ],
        verbs: [
            { word: "jump", emoji: "🤸" },
            { word: "run", emoji: "🏃" },
            { word: "fly", emoji: "🪽" },
            { word: "sing", emoji: "🎤" },
            { word: "play", emoji: "🎮" },
            { word: "sleep", emoji: "💤" },
            { word: "dance", emoji: "💃" },
            { word: "eat", emoji: "🍽️" },
        ],
        adjectives: [
            { word: "big", emoji: "🔼" },
            { word: "little", emoji: "🔽" },
            { word: "pretty", emoji: "💖" },
            { word: "funny", emoji: "😄" },
            { word: "red", emoji: "🔴" },
            { word: "blue", emoji: "🔵" },
            { word: "pink", emoji: "💗" },
            { word: "yellow", emoji: "💛" },
        ],
    };

    const TEMPLATES = [
        { parts: ["I", "see", "the", { blank: "nouns" }], label: "I see the ___" },
        { parts: ["The", "unicorn", "can", { blank: "verbs" }], label: "The unicorn can ___" },
        { parts: ["Look", "at", "the", { blank: "adjectives" }, { blank: "nouns" }], label: "Look at the ___ ___" },
        { parts: ["I", "like", "to", { blank: "verbs" }], label: "I like to ___" },
        { parts: ["My", { blank: "nouns" }, "is", { blank: "adjectives" }], label: "My ___ is ___" },
        { parts: ["The", { blank: "adjectives" }, "unicorn", "can", { blank: "verbs" }], label: "The ___ unicorn can ___" },
    ];

    function loadStories() {
        try {
            const raw = localStorage.getItem(STORIES_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }

    function saveStories() {
        try { localStorage.setItem(STORIES_KEY, JSON.stringify(state.stories)); } catch (_) {}
    }

    const state = {
        mode: "listen",
        template: null,
        blankIndex: 0,
        filled: {},
        sessionCount: 0,
        stories: loadStories(),
        playerName: "",
    };

    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) {
        nameInput.value = saved;
        playerNameEl.textContent = saved;
    }

    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
    });

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
        const play = () => {
            const t0 = ac.currentTime + delay;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t0);
            if (endFreq != null) osc.frequency.linearRampToValueAtTime(endFreq, t0 + duration);
            gain.gain.setValueAtTime(volume, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
            osc.connect(gain).connect(ac.destination);
            osc.start(t0);
            osc.stop(t0 + duration);
        };
        if (ac.state === "suspended") {
            ac.resume().then(play);
        } else {
            play();
        }
    }
    function playSparkle() {
        tone({ freq: 880, endFreq: 1320, type: "triangle", duration: 0.14, volume: 0.18 });
        tone({ freq: 1320, endFreq: 1760, type: "triangle", duration: 0.14, volume: 0.14, delay: 0.08 });
    }
    function playFanfare() {
        tone({ freq: 660, type: "triangle", duration: 0.14, volume: 0.2 });
        tone({ freq: 880, type: "triangle", duration: 0.14, volume: 0.2, delay: 0.12 });
        tone({ freq: 1320, type: "triangle", duration: 0.22, volume: 0.22, delay: 0.24 });
    }

    function speak(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.92;
        u.pitch = 1.25;
        u.volume = 1;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find((v) => /en-US|en_GB|en-GB/i.test(v.lang) && /female|samantha|karen|victoria|zira/i.test(v.name))
            || voices.find((v) => /^en/i.test(v.lang));
        if (preferred) u.voice = preferred;
        window.speechSynthesis.speak(u);
    }

    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener?.("voiceschanged", () => {
            window.speechSynthesis.getVoices();
        });
    }

    function setMode(mode) {
        if (state.mode === mode) return;
        state.mode = mode;
        modeBtns.forEach((btn) => {
            btn.classList.toggle("selected", btn.dataset.mode === mode);
        });
        document.body.classList.toggle("read-mode", mode === "read");
    }
    modeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            ensureAudio();
            setMode(btn.dataset.mode);
        });
    });

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function pickTemplate() {
        const candidates = TEMPLATES.filter((t) => !state.template || t !== state.template);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    function startTemplate() {
        state.template = pickTemplate();
        state.filled = {};
        state.blankIndex = 0;
        nextBtn.textContent = "Next Story";
        nextBtn.classList.remove("magic");
        renderSentence();
        renderChoices();
    }

    function renderSentence() {
        sentenceTray.innerHTML = "";
        let blankCounter = 0;
        for (const part of state.template.parts) {
            const span = document.createElement("span");
            span.className = "word";
            if (typeof part === "string") {
                span.textContent = part;
            } else {
                const idx = blankCounter++;
                if (state.filled[idx]) {
                    span.classList.add("filled");
                    if (state.mode === "listen") {
                        span.textContent = `${state.filled[idx].emoji} ${state.filled[idx].word}`;
                    } else {
                        span.textContent = state.filled[idx].word;
                    }
                } else {
                    span.classList.add("blank");
                    span.textContent = "___";
                }
            }
            sentenceTray.appendChild(span);
        }
    }

    function renderChoices() {
        tilesEl.innerHTML = "";
        const blanks = state.template.parts.filter((p) => typeof p === "object");
        if (state.blankIndex >= blanks.length) return;
        const category = blanks[state.blankIndex].blank;
        const pool = WORDS[category];
        const choices = shuffle(pool).slice(0, 3);
        for (const c of choices) {
            const tile = document.createElement("button");
            tile.type = "button";
            tile.className = "tile";
            tile.innerHTML = `<div class="tile-emoji">${c.emoji}</div><div class="tile-word">${c.word}</div>`;
            tile.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                ensureAudio();
                onTileTap(tile, c);
            });
            tilesEl.appendChild(tile);
        }
    }

    function onTileTap(tile, choice) {
        tile.classList.add("tapped");
        playSparkle();
        emitSparkles(tile);
        if (state.mode === "listen") speak(choice.word);
        state.filled[state.blankIndex] = choice;
        state.blankIndex++;
        renderSentence();
        animateForWord(choice.word);
        const totalBlanks = state.template.parts.filter((p) => typeof p === "object").length;
        if (state.blankIndex >= totalBlanks) {
            setTimeout(completeStory, 600);
        } else {
            setTimeout(renderChoices, 350);
        }
    }

    function sentenceText() {
        let blankCounter = 0;
        return state.template.parts
            .map((p) => {
                if (typeof p === "string") return p;
                const filled = state.filled[blankCounter++];
                return filled ? filled.word : "___";
            })
            .join(" ");
    }

    function sentenceWords() {
        let blankCounter = 0;
        return state.template.parts.map((p) => {
            if (typeof p === "string") return { word: p, emoji: null };
            const filled = state.filled[blankCounter++];
            return filled ? { ...filled } : { word: "___", emoji: null };
        });
    }

    function completeStory() {
        tilesEl.innerHTML = "";
        nextBtn.textContent = "✨ Next Story";
        nextBtn.classList.add("magic");
        state.sessionCount++;
        storyCountEl.textContent = state.sessionCount;
        playFanfare();
        const words = sentenceWords();
        const sentence = sentenceText();
        state.stories.unshift({ sentence, words, at: Date.now() });
        state.stories = state.stories.slice(0, STORIES_MAX);
        saveStories();
        renderStoryBook();
        playFullStory(words);
    }

    function playFullStory(words) {
        const text = words.map((w) => w.word).join(" ");
        if (state.mode === "listen") speak(text);
        let delay = 0;
        for (const w of words) {
            if (w.emoji) {
                setTimeout(() => animateForWord(w.word), delay);
                delay += 450;
            }
        }
    }

    function renderStoryBook() {
        if (state.stories.length < STORY_BOOK_THRESHOLD) {
            storyBook.classList.remove("visible");
            return;
        }
        const wasVisible = storyBook.classList.contains("visible");
        storyBook.classList.add("visible");
        storyBookList.innerHTML = "";
        for (const s of state.stories) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "saved-story";
            btn.textContent = s.sentence;
            btn.addEventListener("click", () => {
                ensureAudio();
                clearScene();
                playFullStory(s.words);
            });
            storyBookList.appendChild(btn);
        }
        if (!wasVisible) {
            setTimeout(() => storyBook.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
        }
    }

    function emitSparkles(sourceEl) {
        const sceneRect = sceneFx.getBoundingClientRect();
        const srcRect = sourceEl.getBoundingClientRect();
        const cx = srcRect.left + srcRect.width / 2 - sceneRect.left;
        const cy = srcRect.top + srcRect.height / 2 - sceneRect.top;
        for (let i = 0; i < 5; i++) {
            const s = document.createElement("span");
            s.className = "sparkle";
            s.textContent = ["✨", "⭐", "💖"][i % 3];
            s.style.left = `${cx + (Math.random() * 40 - 20)}px`;
            s.style.top = `${cy + (Math.random() * 30 - 15)}px`;
            s.style.animationDelay = `${i * 40}ms`;
            sceneFx.appendChild(s);
            setTimeout(() => s.remove(), 900);
        }
    }

    function setUnicornStyle({ ux = 0, uy = 0, us = 1, ur = "0deg", hue = null } = {}) {
        unicornEl.style.setProperty("--ux", ux);
        unicornEl.style.setProperty("--uy", uy);
        unicornEl.style.setProperty("--us", us);
        unicornEl.style.setProperty("--ur", ur);
        unicornEl.style.filter = hue != null
            ? `hue-rotate(${hue}deg) drop-shadow(0 6px 6px rgba(0,0,0,0.25))`
            : `drop-shadow(0 6px 6px rgba(0,0,0,0.25))`;
    }

    function clearUnicornAnim() {
        unicornEl.classList.remove("bounce", "run", "dance");
        void unicornEl.offsetWidth;
    }

    function addProp(cls, emoji, opts = {}) {
        const el = document.createElement("div");
        el.className = `prop ${cls}`;
        el.textContent = emoji;
        if (opts.ttl !== 0) {
            setTimeout(() => el.remove(), opts.ttl || 4000);
        }
        sceneProps.appendChild(el);
        return el;
    }

    const HUE_MAP = { red: -40, blue: 180, pink: 0, yellow: 40 };

    function animateForWord(word) {
        const w = word.toLowerCase();
        clearUnicornAnim();

        if (w === "jump") {
            unicornEl.classList.add("bounce");
        } else if (w === "run") {
            unicornEl.classList.add("run");
            setTimeout(() => unicornEl.classList.remove("run"), 1800);
        } else if (w === "fly") {
            setUnicornStyle({ uy: -60, us: 1 });
            addProp("wings", "🪽", { ttl: 2500 });
            setTimeout(() => setUnicornStyle({ uy: 0, us: 1 }), 2200);
        } else if (w === "sing") {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const el = addProp("note", ["🎵", "🎶", "🎵"][i], { ttl: 1600 });
                    el.style.left = `${45 + i * 6}%`;
                    el.style.top = `${40 - i * 5}%`;
                }, i * 180);
            }
        } else if (w === "sleep") {
            addProp("zzz", "💤", { ttl: 1700 });
            setUnicornStyle({ ur: "-12deg" });
            setTimeout(() => setUnicornStyle({ ur: "0deg" }), 1700);
        } else if (w === "dance") {
            unicornEl.classList.add("dance");
        } else if (w === "play") {
            unicornEl.classList.add("bounce");
            addProp("star", "⭐", { ttl: 2000 });
        } else if (w === "eat") {
            addProp("cake", "🎂", { ttl: 2400 });
            unicornEl.classList.add("bounce");
        } else if (w === "big") {
            setUnicornStyle({ us: 1.35 });
            setTimeout(() => setUnicornStyle({ us: 1 }), 1600);
        } else if (w === "little") {
            setUnicornStyle({ us: 0.7 });
            setTimeout(() => setUnicornStyle({ us: 1 }), 1600);
        } else if (HUE_MAP[w] != null) {
            setUnicornStyle({ hue: HUE_MAP[w] });
            setTimeout(() => setUnicornStyle({ hue: null }), 2000);
        } else if (w === "pretty" || w === "funny") {
            unicornEl.classList.add("dance");
        } else if (w === "rainbow") {
            addProp("rainbow", "🌈");
        } else if (w === "castle") {
            addProp("castle", "🏰");
        } else if (w === "star") {
            addProp("star", "⭐");
        } else if (w === "flower") {
            addProp("flower", "🌸");
        } else if (w === "bird") {
            addProp("bird", "🐦");
        } else if (w === "cake") {
            addProp("cake", "🎂");
        } else if (w === "moon") {
            addProp("moon", "🌙");
        } else if (w === "sun") {
            addProp("sun", "☀️");
        } else if (w === "cloud") {
            addProp("cloud", "☁️");
        } else if (w === "unicorn") {
            unicornEl.classList.add("bounce");
        }
    }

    nextBtn.addEventListener("click", () => {
        ensureAudio();
        clearScene();
        startTemplate();
    });

    speakBtn.addEventListener("click", () => {
        ensureAudio();
        const text = sentenceText().replace(/___/g, "blank");
        speak(text);
    });

    function clearScene() {
        sceneProps.innerHTML = "";
        sceneFx.innerHTML = "";
        clearUnicornAnim();
        setUnicornStyle({});
    }

    function startGame() {
        ensureAudio();
        const n = (nameInput.value || "").trim().slice(0, 12) || "Player";
        state.playerName = n;
        localStorage.setItem(NAME_KEY, n);
        playerNameEl.textContent = n;
        overlay.classList.add("hidden");
        renderStoryBook();
        startTemplate();
    }

    startBtn.addEventListener("click", startGame);

    const scene = document.getElementById("scene");
    ["touchstart", "touchmove", "touchend"].forEach((ev) => {
        scene.addEventListener(ev, (e) => {
            if (e.cancelable) e.preventDefault();
        }, { passive: false });
    });
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
