(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const heartsEl = document.getElementById("hearts");
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

    const W = canvas.width;   // 480
    const H = canvas.height;  // 340

    const BALLOON_X = 110;
    const BALLOON_W = 60;
    const BALLOON_H = 72;
    const BASKET_W = 26;
    const BASKET_H = 16;
    const ROPE_GAP = 8;
    const BALLOON_TOTAL_H = BALLOON_H + ROPE_GAP + BASKET_H;

    const CEILING_Y = 18;
    const GRAVITY = 480;
    const LIFT = 1050;
    const MAX_UP = 320;
    const MAX_DOWN = 420;

    const BASE_SPEED = 140;
    const MAX_SPEED = 310;
    const SPEED_RAMP = 4.5;

    const MAX_HEARTS = 3;
    const INVINCIBLE_MS = 1600;

    function mountainY(wx) {
        return H - 28
            - Math.abs(Math.sin(wx * 0.009)) * 28
            - Math.abs(Math.sin(wx * 0.022 + 2)) * 15
            - Math.abs(Math.sin(wx * 0.005 + 1)) * 12;
    }

    // ── Leaderboard helpers ──────────────────────────────────────
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
    function sanitizeName(raw) { return (raw || "").trim().slice(0, 12) || "Pilot"; }

    // ── State ────────────────────────────────────────────────────
    const state = {
        running: false,
        score: 0, starBonus: 0, distance: 0,
        speed: BASE_SPEED,
        playerName: "",
        leaderboard: loadLeaderboard(),
        hearts: MAX_HEARTS,
        invincibleUntil: 0,
        heating: false,
        balloon: { y: 110, vy: 0 },
        obstacles: [], collectibles: [], bgClouds: [], particles: [],
        nextObstX: W + 280,
        nextCollX: W + 140,
        shakeUntil: 0,
    };

    // ── Prefill name ─────────────────────────────────────────────
    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) { nameInput.value = saved; playerNameEl.textContent = saved; }
    bestEl.textContent = personalBest(saved);
    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    // ── Audio ────────────────────────────────────────────────────
    let audio = null;
    function ensureAudio() {
        if (!audio) { const C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function beep(freq, type, dur, vol = 0.25) {
        const ac = ensureAudio(); if (!ac) return;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + dur);
    }
    function playCollect() { beep(880, "sine", 0.14, 0.18); setTimeout(() => beep(1100, "sine", 0.1, 0.15), 60); }
    function playHit() { beep(160, "sawtooth", 0.28, 0.22); }
    function playOver() { beep(280, "sawtooth", 0.18, 0.28); setTimeout(() => beep(180, "sawtooth", 0.35, 0.22), 140); }

    // ── HUD helpers ───────────────────────────────────────────────
    function updateHearts() {
        heartsEl.textContent = "❤️".repeat(state.hearts) + "🖤".repeat(MAX_HEARTS - state.hearts);
    }

    // ── Spawn helpers ─────────────────────────────────────────────
    function initBgClouds() {
        state.bgClouds = [];
        for (let i = 0; i < 7; i++) state.bgClouds.push({
            x: Math.random() * W, y: 20 + Math.random() * (H * 0.5),
            w: 55 + Math.random() * 75, spd: 0.25 + Math.random() * 0.3,
            alpha: 0.35 + Math.random() * 0.3,
        });
    }

    function spawnObstacle() {
        const x = W + 60;
        if (Math.random() < 0.62) {
            state.obstacles.push({
                type: "bird", x, phase: Math.random() * Math.PI * 2,
                y: CEILING_Y + 35 + Math.random() * (H - 180),
            });
        } else {
            state.obstacles.push({
                type: "storm", x,
                y: CEILING_Y + 25 + Math.random() * (H - 190),
            });
        }
        state.nextObstX = x + 180 + Math.random() * 200;
    }

    function spawnCollectible() {
        const x = W + 60;
        state.collectibles.push({
            x, y: CEILING_Y + 40 + Math.random() * (H - 165),
            bob: Math.random() * Math.PI * 2, collected: false,
        });
        state.nextCollX = x + 110 + Math.random() * 140;
    }

    function addParticles(x, y, color, n = 8) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, spd = 55 + Math.random() * 110;
            state.particles.push({
                x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                life: 1, color, size: 3 + Math.random() * 4,
            });
        }
    }

    // ── Game flow ─────────────────────────────────────────────────
    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;
        Object.assign(state, {
            running: true, score: 0, starBonus: 0, distance: 0,
            speed: BASE_SPEED, hearts: MAX_HEARTS, invincibleUntil: 0,
            heating: false,
            balloon: { y: 110, vy: 0 },
            obstacles: [], collectibles: [], particles: [],
            nextObstX: W + 280, nextCollX: W + 140, shakeUntil: 0,
        });
        initBgClouds();
        updateHearts();
        scoreEl.textContent = "0";
        overlay.classList.add("hidden");
        startBtn.textContent = "Fly Again! 🎈";
    }

    function endGame() {
        state.running = false;
        state.heating = false;
        heatBtn.classList.remove("active");
        playOver();
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        const best = personalBest(state.playerName);
        bestEl.textContent = best;
        overlayTitle.textContent = "Landed! 🎈";
        overlayMsg.textContent = `You flew ${state.score} m! ${state.score >= best ? "New record! 🎉" : "Best: " + best}`;
        overlay.classList.remove("hidden");
    }

    function takeDamage() {
        if (Date.now() < state.invincibleUntil) return false;
        state.hearts--;
        updateHearts();
        state.invincibleUntil = Date.now() + INVINCIBLE_MS;
        state.shakeUntil = Date.now() + 350;
        playHit();
        if (state.hearts <= 0) { endGame(); return true; }
        return false;
    }

    function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    // ── Update ────────────────────────────────────────────────────
    function update(dt) {
        if (!state.running) return;

        state.distance += state.speed * dt;
        state.speed = Math.min(MAX_SPEED, state.speed + SPEED_RAMP * dt);
        state.score = Math.floor(state.distance / 10) + state.starBonus;
        scoreEl.textContent = state.score;

        const b = state.balloon;
        b.vy += (state.heating ? -LIFT : GRAVITY) * dt;
        b.vy = Math.max(-MAX_UP, Math.min(MAX_DOWN, b.vy));
        b.y += b.vy * dt;

        if (b.y < CEILING_Y) { b.y = CEILING_Y; b.vy = Math.abs(b.vy) * 0.25; }

        const baseMtnY = mountainY(state.distance + BALLOON_X + BALLOON_W / 2);
        const basketBottom = b.y + BALLOON_TOTAL_H;
        if (basketBottom >= baseMtnY) {
            b.y = baseMtnY - BALLOON_TOTAL_H;
            b.vy = -160;
            addParticles(BALLOON_X + BALLOON_W / 2, baseMtnY, "#a0d060");
            takeDamage();
        }

        // bg clouds
        for (const c of state.bgClouds) {
            c.x -= c.spd * state.speed * dt * 0.38;
            if (c.x + c.w < 0) { c.x = W + 10; c.y = 20 + Math.random() * (H * 0.5); }
        }

        const now = Date.now();
        const inv = now < state.invincibleUntil;
        const hx = BALLOON_X + (BALLOON_W - 40) / 2;
        const hy = b.y + 8;

        // obstacles
        if (state.distance + W > state.nextObstX) spawnObstacle();
        for (let i = state.obstacles.length - 1; i >= 0; i--) {
            const o = state.obstacles[i];
            o.x -= state.speed * dt;
            if (o.type === "bird") o.y += Math.sin(now * 0.0028 + o.phase) * 1.1;
            if (o.x < -100) { state.obstacles.splice(i, 1); continue; }
            if (!inv) {
                const [ow, oh] = o.type === "bird" ? [30, 22] : [68, 42];
                if (overlaps(hx, hy, 40, 52, o.x - ow / 2, o.y - oh / 2, ow, oh)) {
                    addParticles(BALLOON_X + BALLOON_W / 2, b.y + 30, o.type === "bird" ? "#c8a060" : "#8090b0");
                    if (takeDamage()) return;
                }
            }
        }

        // collectibles
        if (state.distance + W > state.nextCollX) spawnCollectible();
        for (let i = state.collectibles.length - 1; i >= 0; i--) {
            const c = state.collectibles[i];
            c.x -= state.speed * dt; c.bob += 2.2 * dt;
            if (c.x < -40) { state.collectibles.splice(i, 1); continue; }
            if (!c.collected && overlaps(hx, hy, 40, 52, c.x - 14, c.y - 14, 28, 28)) {
                c.collected = true;
                state.starBonus += 10;
                playCollect();
                addParticles(c.x, c.y, "#f5d020", 10);
            }
        }

        // particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vy += 200 * dt; p.life -= dt * 2.2;
            if (p.life <= 0) state.particles.splice(i, 1);
        }
    }

    // ── Draw helpers ──────────────────────────────────────────────
    function drawCloud(x, y, w, alpha) {
        ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "#fff";
        const r = w * 0.17;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.arc(x + w * 0.24, y - r * 0.5, r * 1.2, 0, Math.PI * 2);
        ctx.arc(x + w * 0.5, y, r * 1.1, 0, Math.PI * 2);
        ctx.arc(x + w * 0.74, y - r * 0.3, r, 0, Math.PI * 2);
        ctx.arc(x + w, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
    }

    function drawBird(x, y, now, phase) {
        const flap = Math.sin(now * 0.009 + phase);
        ctx.save(); ctx.translate(x, y);
        ctx.strokeStyle = "#2a1a0a"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-14, flap * 9);
        ctx.quadraticCurveTo(-5, -6 + flap * 14, 0, 0);
        ctx.quadraticCurveTo(5, -6 + flap * 14, 14, flap * 9);
        ctx.stroke();
        ctx.fillStyle = "#2a1a0a";
        ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawStormCloud(x, y) {
        ctx.save();
        ctx.fillStyle = "#6a7f96";
        ctx.beginPath();
        ctx.arc(x, y, 17, 0, Math.PI * 2);
        ctx.arc(x + 19, y - 9, 21, 0, Math.PI * 2);
        ctx.arc(x + 40, y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd020";
        ctx.beginPath();
        ctx.moveTo(x + 15, y + 14); ctx.lineTo(x + 7, y + 30);
        ctx.lineTo(x + 17, y + 27); ctx.lineTo(x + 9, y + 44);
        ctx.lineTo(x + 28, y + 24); ctx.lineTo(x + 18, y + 27);
        ctx.lineTo(x + 26, y + 14); ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    function drawStar(x, y, bob) {
        const s = 12 * (1 + Math.sin(bob) * 0.14);
        ctx.save(); ctx.translate(x, y + Math.sin(bob) * 3.5);
        ctx.fillStyle = "#f5d020"; ctx.strokeStyle = "#d4900a"; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const ai = a + Math.PI / 5;
            if (i === 0) ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
            else ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
            ctx.lineTo(Math.cos(ai) * s * 0.4, Math.sin(ai) * s * 0.4);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    const STRIPE_COLORS = ["#e63946", "#f4a261", "#2a9d8f", "#e9c46a", "#264653", "#e76f51"];

    function drawBalloon(by, heating, inv, now) {
        const flash = inv && Math.floor(now / 90) % 2 === 0;
        const cx = BALLOON_X + BALLOON_W / 2;
        ctx.save(); ctx.globalAlpha = flash ? 0.38 : 1;

        // Burner flame (inside bottom of envelope)
        if (heating) {
            const fh = 20 + Math.random() * 10;
            const fg = ctx.createLinearGradient(cx, by + BALLOON_H, cx, by + BALLOON_H - fh);
            fg.addColorStop(0, "rgba(255,90,0,0.85)");
            fg.addColorStop(0.55, "rgba(255,200,10,0.65)");
            fg.addColorStop(1, "rgba(255,255,80,0)");
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.moveTo(cx - 9, by + BALLOON_H);
            ctx.quadraticCurveTo(cx, by + BALLOON_H - fh, cx + 9, by + BALLOON_H);
            ctx.fill();
        }

        // Envelope stripes (clipped to ellipse)
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, by + BALLOON_H * 0.5, BALLOON_W / 2, BALLOON_H * 0.56, 0, 0, Math.PI * 2);
        ctx.clip();
        const sw = BALLOON_W / STRIPE_COLORS.length;
        STRIPE_COLORS.forEach((col, i) => {
            ctx.fillStyle = col;
            ctx.fillRect(BALLOON_X + i * sw, by - 4, sw, BALLOON_H + 8);
        });
        // highlight sheen
        const hi = ctx.createRadialGradient(cx - 10, by + 18, 4, cx, by + 32, BALLOON_W * 0.58);
        hi.addColorStop(0, "rgba(255,255,255,0.28)");
        hi.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = hi; ctx.fillRect(BALLOON_X, by, BALLOON_W, BALLOON_H);
        ctx.restore();

        // Outline
        ctx.strokeStyle = "rgba(0,0,0,0.38)"; ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(cx, by + BALLOON_H * 0.5, BALLOON_W / 2, BALLOON_H * 0.56, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Bottom neck cap
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.ellipse(cx, by + BALLOON_H, BALLOON_W * 0.2, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ropes
        const ropeY = by + BALLOON_H + 2;
        const baskTop = by + BALLOON_H + ROPE_GAP;
        const bx = cx - BASKET_W / 2;
        ctx.strokeStyle = "#8b7355"; ctx.lineWidth = 1.4;
        [[cx - 10, bx + 4], [cx + 10, bx + BASKET_W - 4]].forEach(([fx, tx]) => {
            ctx.beginPath(); ctx.moveTo(fx, ropeY); ctx.lineTo(tx, baskTop); ctx.stroke();
        });

        // Basket body
        ctx.fillStyle = "#8b6914"; ctx.strokeStyle = "#5c4a0a"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(bx, baskTop, BASKET_W, BASKET_H);
        ctx.fill(); ctx.stroke();
        // weave lines
        ctx.strokeStyle = "#6b5010"; ctx.lineWidth = 0.9;
        [0.5, 0.34, 0.67].forEach(f => {
            ctx.beginPath(); ctx.moveTo(bx, baskTop + BASKET_H * f); ctx.lineTo(bx + BASKET_W, baskTop + BASKET_H * f); ctx.stroke();
        });
        // pilot
        ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🧑", cx, baskTop + BASKET_H * 0.52);

        ctx.restore();
    }

    function drawMountains(dist) {
        const grad = ctx.createLinearGradient(0, H - 120, 0, H);
        grad.addColorStop(0, "#3a5c28"); grad.addColorStop(1, "#1c2e12");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 3) ctx.lineTo(x, mountainY(x + dist));
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }

    // ── Draw ──────────────────────────────────────────────────────
    function draw() {
        const now = Date.now();
        let sx = 0, sy = 0;
        if (now < state.shakeUntil) { sx = (Math.random() - 0.5) * 7; sy = (Math.random() - 0.5) * 7; }

        ctx.save(); ctx.translate(sx, sy);

        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, "#1565a8"); sky.addColorStop(0.65, "#4cb8e8"); sky.addColorStop(1, "#8ed4ee");
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

        // Sun
        ctx.save();
        ctx.shadowColor = "rgba(255,210,40,0.55)"; ctx.shadowBlur = 22;
        ctx.fillStyle = "rgba(255,218,60,0.92)";
        ctx.beginPath(); ctx.arc(W - 56, 46, 26, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        for (const c of state.bgClouds) drawCloud(c.x, c.y, c.w, c.alpha);
        drawMountains(state.distance);

        for (const c of state.collectibles) if (!c.collected) drawStar(c.x, c.y, c.bob);

        for (const o of state.obstacles) {
            if (o.type === "bird") drawBird(o.x, o.y, now, o.phase);
            else drawStormCloud(o.x - 34, o.y - 21);
        }

        drawBalloon(state.balloon.y, state.heating, now < state.invincibleUntil, now);

        for (const p of state.particles) {
            ctx.save(); ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    // ── Input ─────────────────────────────────────────────────────
    function setHeat(on) { if (state.running) state.heating = on; }

    document.addEventListener("keydown", e => {
        if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); setHeat(true); }
    });
    document.addEventListener("keyup", e => {
        if (e.code === "Space" || e.code === "ArrowUp") setHeat(false);
    });

    canvas.addEventListener("pointerdown", e => { e.preventDefault(); setHeat(true); });
    canvas.addEventListener("pointerup", e => { e.preventDefault(); setHeat(false); });
    canvas.addEventListener("pointercancel", () => setHeat(false));
    canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchend", e => e.preventDefault(), { passive: false });

    heatBtn.addEventListener("pointerdown", e => { e.preventDefault(); heatBtn.classList.add("active"); setHeat(true); });
    heatBtn.addEventListener("pointerup", e => { e.preventDefault(); heatBtn.classList.remove("active"); setHeat(false); });
    heatBtn.addEventListener("pointercancel", () => { heatBtn.classList.remove("active"); setHeat(false); });

    {
        const hModal = document.getElementById("help-modal");
        document.getElementById("help-btn").addEventListener("click", () => { hModal.hidden = false; });
        document.getElementById("help-close").addEventListener("click", () => { hModal.hidden = true; });
        hModal.addEventListener("click", (e) => { if (e.target === hModal) hModal.hidden = true; });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") hModal.hidden = true; });
    }
    startBtn.addEventListener("click", startGame);

    // ── Game loop ─────────────────────────────────────────────────
    let last = null;
    function loop(ts) {
        if (!last) last = ts;
        const dt = Math.min((ts - last) / 1000, 0.05);
        last = ts;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }
    initBgClouds();
    requestAnimationFrame(loop);
})();
