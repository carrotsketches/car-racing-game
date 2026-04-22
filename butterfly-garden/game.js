(() => {
    // ---------- DOM refs ----------
    const stage = document.getElementById("stage");
    const meadow = document.getElementById("meadow");
    const canvas = document.getElementById("butterfly-canvas");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const scoreEl = document.getElementById("score");
    const timeEl = document.getElementById("time");
    const timeStatEl = document.getElementById("time-stat");
    const bestEl = document.getElementById("best");

    const W = canvas.width;   // 400
    const H = canvas.height;  // 600
    const ROUND_SECONDS = 60;
    const FLOWER_COUNT = 6;
    const FLOWER_RADIUS = 40;

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "butterfly-garden-leaderboard";
    const LB_MAX = 20;

    const reduceMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduceMotion = () => reduceMotionMQ.matches;

    // ---------- Palette ----------
    const WING_COLORS = [
        { name: "pink",   hex: "#ec4899" },
        { name: "yellow", hex: "#fbbf24" },
        { name: "violet", hex: "#a78bfa" },
        { name: "coral",  hex: "#fb7185" }
    ];
    const FLOWER_EMOJI = {
        pink:   "🌸",
        yellow: "🌼",
        violet: "🌺",
        coral:  "🌻"
    };

    // ---------- Utilities ----------
    function sanitizeName(raw) {
        const trimmed = (raw || "").trim().slice(0, 12);
        return trimmed || "Player";
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
        for (const e of state.leaderboard) {
            if (e.name === name && e.score > best) best = e.score;
        }
        return best;
    }
    function lerp(a, b, k) { return a + (b - a) * k; }
    function randInt(n) { return Math.floor(Math.random() * n); }
    function randRange(lo, hi) { return lo + Math.random() * (hi - lo); }
    function pickColor(avoidName) {
        const pool = avoidName
            ? WING_COLORS.filter((c) => c.name !== avoidName)
            : WING_COLORS.slice();
        return pool[randInt(pool.length)];
    }

    // ---------- Audio ----------
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function tone(freq, dur = 0.3, type = "sine", gain = 0.05) {
        const a = ensureAudio();
        if (!a) return;
        const osc = a.createOscillator();
        const g = a.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const now = a.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(gain, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(g).connect(a.destination);
        osc.start(now);
        osc.stop(now + dur + 0.02);
    }
    function softChime() {
        // Soft sine chord (major third + fifth), gentle volumes.
        const base = 660 + Math.random() * 120;
        tone(base, 0.4, "sine", 0.045);
        tone(base * 1.25, 0.4, "sine", 0.035);
        tone(base * 1.5, 0.45, "sine", 0.028);
    }

    // ---------- State ----------
    const state = {
        running: false,
        score: 0,
        timeLeft: ROUND_SECONDS,
        elapsed: 0,
        lastTs: 0,
        pointer: { x: W / 2, y: H / 2 },
        butterfly: {
            x: W / 2,
            y: H / 2,
            color: WING_COLORS[0],
            flap: 0,
            stutterUntil: 0
        },
        flowers: [],
        raindrops: [],
        sparkles: [],
        playerName: "",
        leaderboard: loadLeaderboard(),
        nextRainAt: 0
    };

    // ---------- Name prefill ----------
    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) {
        nameInput.value = savedName;
        playerNameEl.textContent = savedName;
    }
    bestEl.textContent = personalBest(savedName);

    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    // ---------- Flowers (DOM) ----------
    function clearFlowers() {
        for (const f of state.flowers) {
            if (f.el && f.el.parentNode) f.el.parentNode.removeChild(f.el);
        }
        state.flowers = [];
    }

    function randomFlowerPos() {
        // Keep away from edges and give top margin so they don't overlap the HUD-looking area.
        const margin = 55;
        return {
            x: randRange(margin, W - margin),
            y: randRange(margin + 40, H - margin)
        };
    }

    function createFlower(color, pos) {
        const el = document.createElement("div");
        el.className = "flower";
        el.textContent = FLOWER_EMOJI[color.name];
        el.dataset.color = color.name;
        // Position using percentages so it tracks the meadow size.
        el.style.left = ((pos.x / W) * 100) + "%";
        el.style.top = ((pos.y / H) * 100) + "%";
        el.style.setProperty("--pulse-color", color.hex);
        meadow.appendChild(el);
        return { el, x: pos.x, y: pos.y, color, fading: false };
    }

    function spawnFlowers(n) {
        clearFlowers();
        for (let i = 0; i < n; i++) {
            const color = WING_COLORS[i % WING_COLORS.length];
            // Shuffle so the starting colors aren't in row order.
            const chosen = Math.random() < 0.5 ? color : pickColor();
            const flower = createFlower(chosen, randomFlowerPos());
            state.flowers.push(flower);
        }
        refreshFlowerHighlights();
    }

    function refreshFlowerHighlights() {
        const wing = state.butterfly.color.name;
        for (const f of state.flowers) {
            if (!f || !f.el) continue;
            if (f.color.name === wing && !f.fading) {
                f.el.classList.add("matching");
            } else {
                f.el.classList.remove("matching");
            }
        }
    }

    function respawnFlower(flower, avoidName) {
        // Fade out existing, then (after transition) replace with new color/pos in-place.
        if (flower.fading) return;
        flower.fading = true;
        flower.el.classList.remove("matching");
        flower.el.classList.add("faded");
        const oldEl = flower.el;
        setTimeout(() => {
            if (oldEl.parentNode) oldEl.parentNode.removeChild(oldEl);
        }, 300);
        // Create a new flower (new color, new location) and replace the slot.
        const newColor = pickColor(avoidName);
        const newPos = randomFlowerPos();
        const fresh = createFlower(newColor, newPos);
        // Fade in by briefly forcing an initial faded state via inline style.
        fresh.el.style.opacity = "0";
        fresh.el.style.transform = "translate(-50%, -50%) scale(0.4)";
        // Force reflow so the transition triggers.
        // eslint-disable-next-line no-unused-expressions
        fresh.el.offsetHeight;
        fresh.el.style.opacity = "";
        fresh.el.style.transform = "";
        // Replace the flower record in place.
        const idx = state.flowers.indexOf(flower);
        if (idx !== -1) state.flowers[idx] = fresh;
        refreshFlowerHighlights();
    }

    // ---------- Sparkles ----------
    function spawnSparkles(x, y, color) {
        const n = 10;
        for (let i = 0; i < n; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 90;
            state.sparkles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 20,
                life: 0.8 + Math.random() * 0.3,
                max: 1.1,
                color: Math.random() < 0.5 ? color : "#ffffff",
                r: 2 + Math.random() * 2
            });
        }
    }

    function updateSparkles(dt) {
        for (const s of state.sparkles) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy += 90 * dt; // gentle gravity
            s.life -= dt;
        }
        state.sparkles = state.sparkles.filter((s) => s.life > 0);
    }

    function drawSparkles() {
        for (const s of state.sparkles) {
            const a = Math.max(0, s.life / s.max);
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ---------- Raindrops ----------
    function spawnRaindrop() {
        // Drift diagonally across the meadow.
        const fromLeft = Math.random() < 0.5;
        const x = fromLeft ? -20 : W + 20;
        const y = randRange(30, H - 120);
        const dir = fromLeft ? 1 : -1;
        state.raindrops.push({
            x, y,
            vx: dir * randRange(60, 100),
            vy: randRange(35, 70),
            r: 8
        });
    }

    function updateRaindrops(dt) {
        const b = state.butterfly;
        const now = state.elapsed;
        for (const r of state.raindrops) {
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            // Collision with butterfly center (skip if already stuttering to avoid spam).
            if (b.stutterUntil < now) {
                const dx = r.x - b.x;
                const dy = r.y - b.y;
                if (dx * dx + dy * dy < 24 * 24) {
                    b.stutterUntil = now + 700;
                    tone(320, 0.18, "sine", 0.03);
                }
            }
        }
        state.raindrops = state.raindrops.filter((r) =>
            r.x > -40 && r.x < W + 40 && r.y < H + 40
        );
    }

    function drawRaindrops() {
        for (const r of state.raindrops) {
            ctx.save();
            ctx.translate(r.x, r.y);
            // Gentle rotation to face motion direction.
            ctx.rotate(Math.atan2(r.vy, r.vx) + Math.PI / 2);
            // Teardrop body.
            const g = ctx.createLinearGradient(0, -r.r, 0, r.r * 1.6);
            g.addColorStop(0, "rgba(180, 220, 255, 0.95)");
            g.addColorStop(1, "rgba(80, 140, 210, 0.85)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, -r.r * 1.4);
            ctx.bezierCurveTo(r.r, -r.r * 0.2, r.r, r.r, 0, r.r * 1.2);
            ctx.bezierCurveTo(-r.r, r.r, -r.r, -r.r * 0.2, 0, -r.r * 1.4);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = 1;
            ctx.stroke();
            // Highlight glint.
            ctx.fillStyle = "rgba(255,255,255,0.55)";
            ctx.beginPath();
            ctx.ellipse(-r.r * 0.25, -r.r * 0.2, r.r * 0.22, r.r * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ---------- Butterfly ----------
    function drawButterfly(b, t) {
        const stuttering = state.elapsed < b.stutterUntil;
        const jx = stuttering ? (Math.sin(state.elapsed / 35) * 3) : 0;
        const jy = stuttering ? (Math.cos(state.elapsed / 40) * 3) : 0;

        // Wing flap via sin unless reduce-motion.
        const flap = reduceMotion() ? 0 : Math.sin(t * 10);
        const wingScaleX = 1 + flap * 0.15;
        const wingScaleY = 1 - Math.abs(flap) * 0.12;

        ctx.save();
        ctx.translate(b.x + jx, b.y + jy);

        // Soft shadow below butterfly.
        ctx.fillStyle = "rgba(80, 60, 90, 0.18)";
        ctx.beginPath();
        ctx.ellipse(0, 18, 18, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wings — gradient-filled ellipses with lighter edge.
        const wingColor = b.color.hex;
        const wingEdge = "rgba(255,255,255,0.9)";

        // Left wing pair (upper + lower).
        drawWingPair(-1, wingColor, wingEdge, wingScaleX, wingScaleY);
        // Right wing pair.
        drawWingPair(1, wingColor, wingEdge, wingScaleX, wingScaleY);

        // Body — tiny rounded rectangle-ish ellipse stack.
        ctx.fillStyle = "#3b2a46";
        ctx.beginPath();
        ctx.ellipse(0, 0, 3, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head.
        ctx.beginPath();
        ctx.arc(0, -12, 3.6, 0, Math.PI * 2);
        ctx.fill();

        // Antennae.
        ctx.strokeStyle = "#3b2a46";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-1, -14);
        ctx.quadraticCurveTo(-5, -20, -7, -22);
        ctx.moveTo(1, -14);
        ctx.quadraticCurveTo(5, -20, 7, -22);
        ctx.stroke();
        // Tips.
        ctx.fillStyle = b.color.hex;
        ctx.beginPath();
        ctx.arc(-7, -22, 1.6, 0, Math.PI * 2);
        ctx.arc(7, -22, 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawWingPair(side, color, edgeColor, sx, sy) {
        ctx.save();
        ctx.scale(side * sx, sy);

        // Upper wing.
        const gUp = ctx.createRadialGradient(10, -6, 2, 10, -6, 26);
        gUp.addColorStop(0, lighten(color, 0.4));
        gUp.addColorStop(0.6, color);
        gUp.addColorStop(1, darken(color, 0.25));
        ctx.fillStyle = gUp;
        ctx.beginPath();
        ctx.ellipse(14, -7, 17, 13, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Small highlight dot on upper wing.
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(10, -10, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Lower wing (smaller).
        const gLo = ctx.createRadialGradient(10, 7, 2, 10, 7, 22);
        gLo.addColorStop(0, lighten(color, 0.3));
        gLo.addColorStop(0.7, color);
        gLo.addColorStop(1, darken(color, 0.3));
        ctx.fillStyle = gLo;
        ctx.beginPath();
        ctx.ellipse(10, 9, 12, 10, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    function lighten(hex, amt) {
        const { r, g, b } = hexToRgb(hex);
        const mix = (c) => Math.round(c + (255 - c) * amt);
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }
    function darken(hex, amt) {
        const { r, g, b } = hexToRgb(hex);
        const mix = (c) => Math.round(c * (1 - amt));
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }
    function hexToRgb(hex) {
        const h = hex.replace("#", "");
        return {
            r: parseInt(h.substring(0, 2), 16),
            g: parseInt(h.substring(2, 4), 16),
            b: parseInt(h.substring(4, 6), 16)
        };
    }

    // ---------- Input ----------
    function updatePointerFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches && e.touches.length > 0) {
            cx = e.touches[0].clientX;
            cy = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            cx = e.changedTouches[0].clientX;
            cy = e.changedTouches[0].clientY;
        } else {
            cx = e.clientX;
            cy = e.clientY;
        }
        if (cx === undefined || cy === undefined) return;
        state.pointer.x = (cx - rect.left) * (W / rect.width);
        state.pointer.y = (cy - rect.top) * (H / rect.height);
    }

    function onPointerMove(e) {
        updatePointerFromEvent(e);
    }
    function onTouchMove(e) {
        updatePointerFromEvent(e);
        e.preventDefault();
    }
    function onTouchStartOrEnd(e) {
        updatePointerFromEvent(e);
        e.preventDefault();
    }

    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerdown", onPointerMove);
    stage.addEventListener("touchstart", onTouchStartOrEnd, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", (e) => e.preventDefault(), { passive: false });

    // ---------- Collision ----------
    function checkFlowerCollisions() {
        if (!state.running) return;
        const b = state.butterfly;
        for (const f of state.flowers) {
            if (f.fading) continue;
            if (f.color.name !== b.color.name) continue;
            const dx = f.x - b.x;
            const dy = f.y - b.y;
            if (dx * dx + dy * dy <= FLOWER_RADIUS * FLOWER_RADIUS) {
                sipNectar(f);
                break; // one per frame — calmer UX
            }
        }
    }

    function sipNectar(flower) {
        state.score += 1;
        scoreEl.textContent = state.score;
        spawnSparkles(flower.x, flower.y, flower.color.hex);
        softChime();
        const oldColorName = state.butterfly.color.name;
        state.butterfly.color = pickColor(oldColorName);
        respawnFlower(flower, state.butterfly.color.name === "same" ? null : undefined);
        // After spawning the new flower the butterfly has a new wing color; refresh highlights.
        refreshFlowerHighlights();
    }

    // ---------- Loop ----------
    function update(dt) {
        if (!state.running) return;
        state.elapsed += dt * 1000;
        state.timeLeft = Math.max(0, ROUND_SECONDS - state.elapsed / 1000);
        timeEl.textContent = Math.ceil(state.timeLeft);
        if (state.timeLeft <= 10) timeStatEl.classList.add("low");
        else timeStatEl.classList.remove("low");

        // Butterfly spring-lerp toward pointer.
        const k = 0.12;
        state.butterfly.x = lerp(state.butterfly.x, state.pointer.x, k);
        state.butterfly.y = lerp(state.butterfly.y, state.pointer.y, k);
        state.butterfly.flap += dt;

        // Raindrops — only if motion allowed.
        if (!reduceMotion()) {
            if (state.elapsed >= state.nextRainAt) {
                spawnRaindrop();
                state.nextRainAt = state.elapsed + randRange(3000, 5000);
            }
            updateRaindrops(dt);
        } else {
            state.raindrops = [];
        }

        updateSparkles(dt);
        checkFlowerCollisions();

        if (state.timeLeft <= 0) endGame();
    }

    function render() {
        ctx.clearRect(0, 0, W, H);
        // Meadow CSS provides the background; canvas just draws the butterfly + particles.
        drawRaindrops();
        drawSparkles();
        drawButterfly(state.butterfly, state.butterfly.flap);
    }

    function loop(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;
        update(dt);
        render();
        if (state.running) requestAnimationFrame(loop);
        else render(); // one last draw after end so canvas shows final frame
    }

    // ---------- Start / End ----------
    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.running = true;
        state.score = 0;
        state.timeLeft = ROUND_SECONDS;
        state.elapsed = 0;
        state.lastTs = 0;
        state.pointer.x = W / 2;
        state.pointer.y = H / 2;
        state.butterfly.x = W / 2;
        state.butterfly.y = H / 2;
        state.butterfly.color = pickColor();
        state.butterfly.flap = 0;
        state.butterfly.stutterUntil = 0;
        state.raindrops = [];
        state.sparkles = [];
        state.nextRainAt = reduceMotion() ? Infinity : randRange(3000, 5000);

        scoreEl.textContent = "0";
        timeEl.textContent = ROUND_SECONDS;
        timeStatEl.classList.remove("low");

        spawnFlowers(FLOWER_COUNT);

        overlay.classList.add("hidden");
        stage.classList.add("playing");
        document.body.style.cursor = "none";

        requestAnimationFrame(loop);
    }

    function endGame() {
        if (!state.running) return;
        state.running = false;
        document.body.style.cursor = "";
        stage.classList.remove("playing");
        timeStatEl.classList.remove("low");

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);

        overlayTitle.textContent = "Lovely garden! 🦋";
        overlayMsg.textContent = `You sipped ${state.score} nectar. Play again?`;
        startBtn.textContent = "Play Again";
        overlay.classList.remove("hidden");
    }

    startBtn.addEventListener("click", startGame);

    // Initial idle render so the stage isn't totally blank.
    render();
})();
