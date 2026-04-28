(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const W = canvas.width;   // 400
    const H = canvas.height;  // 500

    const scoreEl      = document.getElementById("score");
    const bestEl       = document.getElementById("best");
    const timeEl       = document.getElementById("time");
    const timeStatEl   = document.getElementById("time-stat");
    const overlay      = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg   = document.getElementById("overlay-msg");
    const startBtn     = document.getElementById("start-btn");
    const nameInput    = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const leftBtn      = document.getElementById("left-btn");
    const rightBtn     = document.getElementById("right-btn");
    const actionBtn    = document.getElementById("action-btn");

    const NAME_KEY  = "highway-dash-last-name";
    const LB_KEY    = "excavator-game-leaderboard";
    const LB_MAX    = 20;
    const ROUND_SEC = 60;

    // ── Geometry ────────────────────────────────────────────────────────────
    const GROUND_Y     = 390;
    const PIVOT_Y      = 355;
    const ARM_LEN      = 130;
    const ARM_SPEED    = 2.2;       // rad/s
    const EXCAV_MIN_X  = 120;       // leftmost excavator position
    const EXCAV_MAX_X  = 220;       // rightmost (before truck)
    const EXCAV_SPEED  = 95;        // px/s driving speed
    const TRUCK_HOME   = W - 145;   // 255

    // Arm angle: 0 = straight up, positive = clockwise
    const ANGLE_MIN    = -1.85;
    const ANGLE_MAX    =  1.85;
    const DIG_THRESHOLD  = -1.15;   // arm must be <= this to dig (pointing left)
    const DUMP_THRESHOLD =  1.15;   // arm must be >= this to dump (pointing right)

    const TRUCK_CAPACITY = 4;       // scoops to fill a truck

    // ── Leaderboard helpers ──────────────────────────────────────────────────
    function loadLeaderboard() {
        try {
            const arr = JSON.parse(localStorage.getItem(LB_KEY) || "[]");
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
        const t = (raw || "").trim().slice(0, 12);
        return t || "Player";
    }

    // ── State ────────────────────────────────────────────────────────────────
    const state = {
        running:      false,
        score:        0,
        timeLeft:     ROUND_SEC,
        playerName:   "",
        leaderboard:  loadLeaderboard(),

        angle:        -1.6,     // current arm angle (rad)
        excavatorX:   155,      // current excavator body x position
        bucket:       0,        // 0=empty, 1=full
        truckLoad:    0,        // scoops in current truck
        truckX:       0,        // truck draw x (animated on depart)
        departing:    false,    // truck currently driving off?
        departSpeed:  0,

        digAnim:      0,        // countdown timer for dig flash
        dumpAnim:     0,
        truckBounce:  0,        // wobble when dirt hits truck

        particles:    [],
        floats:       [],       // score float texts
        keys:         {},
        actionQueued: false,
    };

    // ── Name prefill ─────────────────────────────────────────────────────────
    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) { nameInput.value = saved; playerNameEl.textContent = saved; }
    bestEl.textContent = personalBest(saved);
    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    // ── Audio ────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audioCtx = new Ctx();
        }
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
        return audioCtx;
    }
    function beep(freq, dur, type = "square", vol = 0.12) {
        const ac = ensureAudio(); if (!ac) return;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.start(); o.stop(ac.currentTime + dur);
    }
    function playDig()  { beep(140, 0.18, "sawtooth", 0.14); }
    function playDump() {
        beep(330, 0.08, "square", 0.1);
        setTimeout(() => beep(440, 0.12, "square", 0.1), 70);
    }
    function playBonus() {
        [500, 650, 800, 1000].forEach((f, i) => setTimeout(() => beep(f, 0.12, "triangle", 0.14), i * 55));
    }

    // ── Input ────────────────────────────────────────────────────────────────
    window.addEventListener("keydown", e => {
        state.keys[e.key] = true;
        if ((e.key === " " || e.key === "ArrowUp") && !state.actionQueued) {
            state.actionQueued = true;
        }
    });
    window.addEventListener("keyup", e => { state.keys[e.key] = false; });

    function holdBtn(key, el) {
        el.addEventListener("pointerdown",  e => { e.preventDefault(); state.keys[key] = true;  el.classList.add("pressed"); });
        el.addEventListener("pointerup",       () => { state.keys[key] = false; el.classList.remove("pressed"); });
        el.addEventListener("pointercancel",   () => { state.keys[key] = false; el.classList.remove("pressed"); });
        el.addEventListener("pointerleave",    () => { state.keys[key] = false; el.classList.remove("pressed"); });
    }
    holdBtn("ArrowLeft",  leftBtn);
    holdBtn("ArrowRight", rightBtn);

    actionBtn.addEventListener("pointerdown", e => {
        e.preventDefault();
        actionBtn.classList.add("pressed");
        state.actionQueued = true;
        ensureAudio();
    });
    actionBtn.addEventListener("pointerup",     () => actionBtn.classList.remove("pressed"));
    actionBtn.addEventListener("pointercancel", () => actionBtn.classList.remove("pressed"));

    // ── Helpers ──────────────────────────────────────────────────────────────
    function bucketPos() {
        return {
            x: state.excavatorX + ARM_LEN * Math.sin(state.angle),
            y: PIVOT_Y - ARM_LEN * Math.cos(state.angle),
        };
    }

    function truckBedLeft()  { return state.truckX + 46; }
    function truckBedMidX()  { return state.truckX + 46 + 64; }
    function truckBedTop()   { return GROUND_Y - 42; }

    function spawnFloat(x, y, text, color) {
        state.floats.push({ x, y, text, color, life: 1.2, vy: -60 });
    }

    // ── Action handler (dig or dump) ─────────────────────────────────────────
    function handleAction() {
        if (!state.running) return;

        const a = state.angle;

        // DIG: arm left, bucket empty, not already animating
        if (a <= DIG_THRESHOLD && state.bucket === 0 && state.digAnim <= 0) {
            state.bucket = 1;
            state.digAnim = 0.35;
            playDig();
            // dirt burst
            const bpos = bucketPos();
            for (let i = 0; i < 10; i++) {
                state.particles.push({
                    x:     bpos.x + (Math.random() - 0.5) * 30,
                    y:     bpos.y + (Math.random() - 0.5) * 10,
                    vx:    (Math.random() - 0.4) * 90,
                    vy:    -Math.random() * 110 - 30,
                    life:  0.45 + Math.random() * 0.3,
                    r:     3 + Math.random() * 4,
                    color: `hsl(${28 + Math.random() * 18},${58 + Math.random() * 20}%,${38 + Math.random() * 18}%)`,
                });
            }
            spawnFloat(bpos.x, bpos.y - 20, "Scooped!", "#f5c842");
            return;
        }

        // DUMP: arm right, bucket full, truck present and not departing
        if (a >= DUMP_THRESHOLD && state.bucket === 1 && state.dumpAnim <= 0 && !state.departing) {
            state.bucket = 0;
            state.dumpAnim = 0.3;
            state.truckBounce = 0.25;
            state.truckLoad++;
            state.score += 10;
            scoreEl.textContent = state.score;
            playDump();
            // dirt falls into bed
            const bpos = bucketPos();
            for (let i = 0; i < 8; i++) {
                state.particles.push({
                    x:     bpos.x + (Math.random() - 0.5) * 20,
                    y:     bpos.y,
                    vx:    (Math.random() - 0.5) * 50,
                    vy:    Math.random() * 70 + 80,
                    life:  0.4 + Math.random() * 0.2,
                    r:     4 + Math.random() * 3,
                    color: `hsl(${28 + Math.random() * 18},65%,44%)`,
                });
            }
            spawnFloat(truckBedMidX(), truckBedTop() - 16, "+10", "#ffffff");

            if (state.truckLoad >= TRUCK_CAPACITY) {
                // truck full — bonus and depart
                const bonus = 50;
                state.score += bonus;
                scoreEl.textContent = state.score;
                spawnFloat(truckBedMidX(), truckBedTop() - 36, `+${bonus} BONUS!`, "#4ade80");
                playBonus();
                state.departing    = true;
                state.departSpeed  = 120;
            }
            return;
        }
    }

    // ── Update ────────────────────────────────────────────────────────────────
    function update(dt) {
        // Rotate arm; when arm hits its limit, drive the excavator instead
        const leftHeld  = state.keys["ArrowLeft"]  || state.keys["a"] || state.keys["A"];
        const rightHeld = state.keys["ArrowRight"] || state.keys["d"] || state.keys["D"];

        if (leftHeld) {
            if (state.angle > ANGLE_MIN) {
                state.angle = Math.max(ANGLE_MIN, state.angle - ARM_SPEED * dt);
            } else {
                state.excavatorX = Math.max(EXCAV_MIN_X, state.excavatorX - EXCAV_SPEED * dt);
            }
        }
        if (rightHeld) {
            if (state.angle < ANGLE_MAX) {
                state.angle = Math.min(ANGLE_MAX, state.angle + ARM_SPEED * dt);
            } else {
                state.excavatorX = Math.min(EXCAV_MAX_X, state.excavatorX + EXCAV_SPEED * dt);
            }
        }

        // Process queued action
        if (state.actionQueued) {
            state.actionQueued = false;
            handleAction();
        }

        // Anim timers
        if (state.digAnim   > 0) state.digAnim   -= dt;
        if (state.dumpAnim  > 0) state.dumpAnim  -= dt;
        if (state.truckBounce > 0) state.truckBounce -= dt;

        // Truck depart animation
        if (state.departing) {
            state.departSpeed += 180 * dt;   // accelerate off-screen
            state.truckX += state.departSpeed * dt;
            if (state.truckX > W + 60) {
                state.truckLoad   = 0;
                state.departing   = false;
                state.departSpeed = 0;
                state.truckX      = W + 60;  // start arrival from right edge
                state._arriving   = true;
            }
        }
        if (state._arriving) {
            state.truckX -= 200 * dt;        // constant speed slide in
            if (state.truckX <= TRUCK_HOME) {
                state.truckX    = TRUCK_HOME;
                state._arriving = false;
            }
        }

        // Particles
        for (const p of state.particles) {
            p.x   += p.vx * dt;
            p.y   += p.vy * dt;
            p.vy  += 320 * dt;
            p.life -= dt;
        }
        state.particles = state.particles.filter(p => p.life > 0);

        // Score floats
        for (const f of state.floats) {
            f.y    += f.vy * dt;
            f.life -= dt;
        }
        state.floats = state.floats.filter(f => f.life > 0);
    }

    // ── Draw helpers ─────────────────────────────────────────────────────────
    function rrect(x, y, w, h, r) {
        if (typeof r === "number") r = [r, r, r, r];
        ctx.beginPath();
        ctx.moveTo(x + r[0], y);
        ctx.lineTo(x + w - r[1], y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]);
        ctx.lineTo(x + w, y + h - r[2]);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
        ctx.lineTo(x + r[3], y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]);
        ctx.lineTo(x, y + r[0]);
        ctx.quadraticCurveTo(x, y, x + r[0], y);
        ctx.closePath();
    }

    function drawBackground() {
        // Sky
        const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        sky.addColorStop(0, "#5ba3d4");
        sky.addColorStop(1, "#c8e4f5");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, GROUND_Y);

        // Clouds
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        [[60, 60, 50], [200, 45, 40], [320, 70, 35]].forEach(([cx, cy, r]) => {
            ctx.beginPath();
            ctx.arc(cx,     cy,     r,       0, Math.PI * 2);
            ctx.arc(cx + r * 0.7, cy - r * 0.3, r * 0.7, 0, Math.PI * 2);
            ctx.arc(cx - r * 0.6, cy - r * 0.2, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
        });

        // Ground base
        ctx.fillStyle = "#7a5c2e";
        ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

        // Grass strip
        ctx.fillStyle = "#5a8a32";
        ctx.fillRect(0, GROUND_Y, W, 14);

        // Dirt pile (left)
        ctx.fillStyle = "#8b6020";
        ctx.beginPath();
        ctx.ellipse(68, GROUND_Y + 2, 55, 26, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#b07a38";
        ctx.beginPath();
        ctx.ellipse(62, GROUND_Y - 2, 42, 20, -0.1, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#c89048";
        ctx.beginPath();
        ctx.ellipse(58, GROUND_Y - 4, 30, 14, -0.15, Math.PI, 0);
        ctx.fill();
    }

    function drawExcavator() {
        const px = state.excavatorX;
        const py = PIVOT_Y;

        // ── Tracks ──
        ctx.fillStyle = "#2d2d2d";
        rrect(px - 64, GROUND_Y - 18, 128, 22, 7);
        ctx.fill();

        // Track bolt details
        ctx.fillStyle = "#444";
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.arc(px - 52 + i * 20, GROUND_Y - 7, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#666";
            ctx.beginPath();
            ctx.arc(px - 52 + i * 20, GROUND_Y - 7, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#444";
        }

        // ── Body ──
        ctx.fillStyle = "#f5a524";
        rrect(px - 50, GROUND_Y - 54, 100, 38, 7);
        ctx.fill();

        // Body stripe
        ctx.fillStyle = "#222";
        ctx.fillRect(px - 50, GROUND_Y - 30, 100, 6);

        // ── Cab ──
        ctx.fillStyle = "#e69318";
        rrect(px - 18, GROUND_Y - 88, 58, 38, [7, 7, 0, 0]);
        ctx.fill();

        // Window
        ctx.fillStyle = "#9dd4ef";
        rrect(px - 10, GROUND_Y - 82, 40, 20, 4);
        ctx.fill();
        // window glare
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        rrect(px - 8, GROUND_Y - 80, 12, 6, 2);
        ctx.fill();

        // ── Arm ──
        const angle = state.angle + (state.digAnim > 0 ? 0.08 : 0);
        const bx = px + ARM_LEN * Math.sin(angle);
        const by = py - ARM_LEN * Math.cos(angle);

        // Arm shadow
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = "#000";
        ctx.lineWidth   = 16;
        ctx.lineCap     = "round";
        ctx.beginPath(); ctx.moveTo(px + 2, py + 3); ctx.lineTo(bx + 2, by + 3); ctx.stroke();
        ctx.restore();

        // Arm body (two-tone)
        ctx.strokeStyle = "#c07810";
        ctx.lineWidth   = 14; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = "#f5a524";
        ctx.lineWidth   = 9;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();

        // Pivot joint
        ctx.fillStyle = "#333";
        ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#888";
        ctx.beginPath(); ctx.arc(px, py,  5, 0, Math.PI * 2); ctx.fill();

        // ── Bucket ──
        drawBucket(bx, by, angle);

        // Zone cues (hint arrows/labels)
        if (state.running) {
            const inDig  = state.angle <= DIG_THRESHOLD;
            const inDump = state.angle >= DUMP_THRESHOLD;

            ctx.font         = "bold 13px Arial";
            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";

            if (inDig && state.bucket === 0) {
                ctx.fillStyle = "rgba(255, 220, 50, 0.95)";
                ctx.fillText("⛏ DIG!", 65, GROUND_Y - 50);
            } else if (inDump && state.bucket === 1 && !state.departing) {
                ctx.fillStyle = "rgba(100, 255, 130, 0.95)";
                ctx.fillText("↓ DUMP!", truckBedMidX(), truckBedTop() - 14);
            }
        }
    }

    function drawBucket(bx, by, angle) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);

        const bw = 24, bh = 20;

        // Shadow
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.moveTo(-bw / 2 + 2, -4);
        ctx.lineTo(-bw / 2 + 2, bh);
        ctx.arc(2, bh, bw / 2, Math.PI, 0);
        ctx.lineTo(bw / 2 + 2, -4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Bucket body
        ctx.fillStyle = "#7a7a7a";
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-bw / 2, -4);
        ctx.lineTo(-bw / 2, bh);
        ctx.arc(0, bh, bw / 2, Math.PI, 0);
        ctx.lineTo(bw / 2, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Bucket teeth
        ctx.fillStyle = "#555";
        for (let t = -1; t <= 1; t++) {
            ctx.beginPath();
            ctx.moveTo(t * 7 - 4, bh + bw / 2 - 2);
            ctx.lineTo(t * 7,     bh + bw / 2 + 7);
            ctx.lineTo(t * 7 + 4, bh + bw / 2 - 2);
            ctx.closePath();
            ctx.fill();
        }

        // Dirt in bucket
        if (state.bucket > 0) {
            ctx.fillStyle = "#a07030";
            ctx.beginPath();
            ctx.ellipse(0, bh - 4, bw / 2 - 2, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#c49050";
            ctx.beginPath();
            ctx.ellipse(-3, bh - 8, 5, 4, -0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    function drawTruck() {
        const tx   = state.truckX;
        const ty   = GROUND_Y;
        const bounce = state.truckBounce > 0 ? Math.sin(state.truckBounce * 40) * 3 : 0;
        const drawY  = ty + bounce;

        // Bed (draw behind cab)
        const bedX = tx + 44;
        const bedW = 110;
        const bedH = 44;
        ctx.fillStyle = "#888";
        rrect(bedX, drawY - bedH - 8, bedW, bedH + 10, [0, 6, 4, 0]);
        ctx.fill();

        // Bed walls (sides)
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bedX + 2, drawY - 8); ctx.lineTo(bedX + 2, drawY - bedH - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bedX + bedW - 2, drawY - 8); ctx.lineTo(bedX + bedW - 2, drawY - bedH - 6); ctx.stroke();

        // Dirt fill
        if (state.truckLoad > 0) {
            const fillFrac = Math.min(state.truckLoad / TRUCK_CAPACITY, 1);
            const fillH    = (bedH - 4) * fillFrac;
            ctx.fillStyle  = "#a07030";
            rrect(bedX + 3, drawY - 9 - fillH, bedW - 6, fillH, [3, 3, 0, 0]);
            ctx.fill();
            // surface crumble
            ctx.fillStyle = "#c49050";
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.arc(bedX + 15 + i * 22, drawY - 10 - fillH + 3, 3 + i % 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Truck cab
        ctx.fillStyle = "#cc3322";
        rrect(tx, drawY - 58, 48, 58, [8, 0, 0, 8]);
        ctx.fill();

        // Cab window
        ctx.fillStyle = "#9dd4ef";
        rrect(tx + 5, drawY - 52, 34, 22, 4);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        rrect(tx + 7, drawY - 50, 10, 7, 2);
        ctx.fill();

        // Cab roof light bar
        ctx.fillStyle = "#ffcc00";
        rrect(tx + 12, drawY - 62, 20, 6, 3);
        ctx.fill();

        // Exhaust pipe
        ctx.fillStyle = "#555";
        ctx.fillRect(tx + 40, drawY - 68, 5, 18);

        // Wheels
        const wheelPositions = [tx + 18, tx + 120, tx + 140];
        wheelPositions.forEach(wx => {
            ctx.fillStyle = "#1a1a1a";
            ctx.beginPath(); ctx.arc(wx, drawY + 2, 14, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#444";
            ctx.beginPath(); ctx.arc(wx, drawY + 2,  7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#888";
            ctx.beginPath(); ctx.arc(wx, drawY + 2,  3, 0, Math.PI * 2); ctx.fill();
        });

        // Progress pips on truck bed
        for (let i = 0; i < TRUCK_CAPACITY; i++) {
            const pipX = bedX + 14 + i * 24;
            const pipY = drawY - bedH - 18;
            ctx.fillStyle = i < state.truckLoad ? "#4ade80" : "rgba(255,255,255,0.25)";
            ctx.beginPath(); ctx.arc(pipX, pipY, 7, 0, Math.PI * 2); ctx.fill();
        }

        // "FULL" flash
        if (state.truckLoad >= TRUCK_CAPACITY) {
            ctx.font      = "bold 16px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = "#4ade80";
            ctx.fillText("FULL! ✓", bedX + bedW / 2, drawY - bedH - 34);
        }
    }

    function drawParticles() {
        state.particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life / 0.65);
            ctx.fillStyle   = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawFloats() {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        state.floats.forEach(f => {
            ctx.globalAlpha = Math.min(1, f.life / 0.4);
            ctx.font        = "bold 15px Arial";
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth   = 3;
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle   = f.color;
            ctx.fillText(f.text, f.x, f.y);
        });
        ctx.globalAlpha  = 1;
        ctx.textBaseline = "alphabetic";
    }

    // ── Game loop ─────────────────────────────────────────────────────────────
    let prevTime = 0;

    function loop(now) {
        if (!state.running) return;

        const dt = Math.min((now - prevTime) / 1000, 0.05);
        prevTime = now;

        state.timeLeft = Math.max(0, state.timeLeft - dt);
        const secLeft  = Math.ceil(state.timeLeft);
        timeEl.textContent = secLeft;
        timeStatEl.classList.toggle("low", secLeft <= 10);

        if (state.timeLeft <= 0) { endGame(); return; }

        update(dt);

        ctx.clearRect(0, 0, W, H);
        drawBackground();
        drawTruck();
        drawExcavator();
        drawParticles();
        drawFloats();

        requestAnimationFrame(loop);
    }

    // ── Start / End ───────────────────────────────────────────────────────────
    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.score        = 0;
        state.timeLeft     = ROUND_SEC;
        state.angle        = -1.6;
        state.excavatorX   = 155;
        state.bucket       = 0;
        state.truckLoad    = 0;
        state.departing    = false;
        state.departSpeed  = 0;
        state._arriving    = false;
        state.truckX       = TRUCK_HOME;
        state.digAnim      = 0;
        state.dumpAnim     = 0;
        state.truckBounce  = 0;
        state.particles    = [];
        state.floats       = [];
        state.keys         = {};
        state.actionQueued = false;
        state.running      = true;

        scoreEl.textContent = "0";
        timeEl.textContent  = ROUND_SEC;
        timeStatEl.classList.remove("low");
        overlay.classList.add("hidden");

        prevTime = performance.now();
        requestAnimationFrame(loop);
    }

    function endGame() {
        state.running = false;
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);

        const s = state.score;
        const comment = s >= 300 ? "Master excavator! 🏆" : s >= 150 ? "Great digging! ⭐" : "Keep at it! ⛏";
        overlayTitle.textContent = "Time's Up!";
        overlayMsg.textContent   = `You scored ${s} points. ${comment}`;
        overlay.classList.remove("hidden");
    }

    startBtn.addEventListener("click", startGame);

    // Help modal
    const helpBtn   = document.getElementById("help-btn");
    const helpModal = document.getElementById("help-modal");
    const helpClose = document.getElementById("help-close");
    helpBtn.addEventListener("click",  () => helpModal.removeAttribute("hidden"));
    helpClose.addEventListener("click", () => helpModal.setAttribute("hidden", ""));
    helpModal.addEventListener("click", (e) => { if (e.target === helpModal) helpModal.setAttribute("hidden", ""); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") helpModal.setAttribute("hidden", ""); });

    // Prevent stray touch on canvas
    canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchmove",  e => e.preventDefault(), { passive: false });

    // Draw idle frame so canvas isn't blank before start
    drawBackground();
    state.truckX = TRUCK_HOME;
    drawTruck();
    drawExcavator();
})();
