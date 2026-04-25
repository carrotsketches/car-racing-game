(() => {
    // ---------- DOM refs ----------
    const stage = document.getElementById("stage");
    const canvas = document.getElementById("seahorse-canvas");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const scoreEl = document.getElementById("score");
    const friendsEl = document.getElementById("friends");
    const friendsStatEl = friendsEl ? friendsEl.closest(".friends-stat") : null;
    const doneBtn = document.getElementById("done-btn");
    const bestEl = document.getElementById("best");

    const W = canvas.width;   // 400
    const H = canvas.height;  // 600
    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "seahorse-game-leaderboard";
    const LB_MAX = 20;

    const reduceMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduceMotion = () => reduceMotionMQ.matches;

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
    function randRange(lo, hi) { return lo + Math.random() * (hi - lo); }
    function hexToRgba(hex, alpha) {
        const h = hex.replace("#", "");
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    function popChime(tier) {
        // Higher tiers (small bubble = best) get a brighter chime.
        const base = tier === "small" ? 880 : tier === "medium" ? 660 : 520;
        tone(base, 0.18, "sine", 0.045);
        tone(base * 1.5, 0.22, "sine", 0.03);
    }
    function hurtBuzz() {
        tone(160, 0.22, "square", 0.05);
        tone(110, 0.28, "square", 0.04);
    }
    function friendChime() {
        tone(660, 0.14, "triangle", 0.05);
        setTimeout(() => tone(880, 0.18, "triangle", 0.04), 80);
        setTimeout(() => tone(1320, 0.22, "triangle", 0.035), 160);
    }

    // ---------- Seahorse palettes ----------
    // The player is a classic golden seahorse. Wild seahorses that drift
    // through the ocean can be befriended and will then follow the player
    // in a happy train, each keeping their own color.
    const PLAYER_PALETTE = {
        name: "gold",
        body: "#f5b341", belly: "#ffd884", crest: "#ff8a3d",
    };
    const FRIEND_PALETTES = [
        { name: "pink",   body: "#ff8ac4", belly: "#ffc2de", crest: "#ff5fa2" },
        { name: "purple", body: "#b89cf0", belly: "#dcc2ff", crest: "#7b55d8" },
        { name: "blue",   body: "#6ec6ff", belly: "#b3e0ff", crest: "#2b9ce8" },
        { name: "green",  body: "#7bd6a4", belly: "#c1edcf", crest: "#3ba86d" },
        { name: "coral",  body: "#ff8f77", belly: "#ffc2b3", crest: "#e85a42" },
        { name: "teal",   body: "#5ecdbe", belly: "#a8e8df", crest: "#2a9e92" },
        { name: "cream",  body: "#ffe7a6", belly: "#fff5d0", crest: "#e8c05a" },
    ];
    function pickFriendPalette() {
        return FRIEND_PALETTES[Math.floor(Math.random() * FRIEND_PALETTES.length)];
    }

    // ---------- State ----------
    const state = {
        running: false,
        score: 0,
        friendCount: 0,
        elapsed: 0,
        lastTs: 0,
        pointer: { x: W / 2, y: H * 0.65 },
        seahorse: {
            x: W / 2,
            y: H * 0.65,
            facing: 1,         // +1 right, -1 left
            flap: 0,
            invulnUntil: 0,
            palette: PLAYER_PALETTE,
        },
        bubbles: [],
        jellies: [],
        sparkles: [],
        wildHorses: [],       // friendly seahorses drifting by, waiting to be befriended
        friends: [],          // seahorses that are following the player in a train
        playerName: "",
        leaderboard: loadLeaderboard()
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
    function onPointerMove(e) { updatePointerFromEvent(e); }
    function onTouchMove(e) {
        if (overlay.contains(e.target)) return;
        updatePointerFromEvent(e);
        e.preventDefault();
    }
    function onTouchStartOrEnd(e) {
        if (overlay.contains(e.target)) return;
        updatePointerFromEvent(e);
        e.preventDefault();
    }
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerdown", onPointerMove);
    stage.addEventListener("touchstart", onTouchStartOrEnd, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", (e) => {
        if (overlay.contains(e.target)) return;
        e.preventDefault();
    }, { passive: false });

    // ---------- Seahorse drawing ----------
    // Drawn from primitives — curled body with a coiled tail, snout, dorsal
    // fin, and a crest of small triangles along the back. Takes a palette so
    // friend seahorses can have their own colors, and a scale so followers
    // can be drawn a bit smaller than the player.
    function drawSeahorse(s, t, opts = {}) {
        const scale = opts.scale || 1;
        const palette = s.palette || PLAYER_PALETTE;
        const flap = reduceMotion() ? 0 : Math.sin(t * 12);
        const invuln = state.elapsed < (s.invulnUntil || 0);
        // Flicker during invulnerability (player only).
        if (invuln && Math.floor(state.elapsed / 80) % 2 === 0) return;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(s.facing * scale, scale);

        // Soft halo behind the seahorse, tinted by body color.
        const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, 30);
        halo.addColorStop(0, hexToRgba(palette.body, 0.35));
        halo.addColorStop(1, hexToRgba(palette.body, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fill();

        // Body — curved spine made of stacked ellipses.
        const bodyHex = palette.body;
        const bellyHex = palette.belly;
        const outline = "rgba(45, 30, 10, 0.8)";

        // Belly (lighter blob behind the main body).
        ctx.fillStyle = bellyHex;
        ctx.beginPath();
        ctx.ellipse(-4, 4, 10, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main body (a curving stack of segments).
        const segments = [
            { x:  0, y: -14, rx: 7,  ry: 8 },   // upper neck
            { x:  2, y:  -4, rx: 9,  ry: 10 },  // chest
            { x:  0, y:   8, rx: 9,  ry: 10 },  // belly
            { x: -4, y:  18, rx: 7,  ry: 8 }    // base of tail
        ];
        ctx.fillStyle = bodyHex;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.2;
        for (const seg of segments) {
            ctx.beginPath();
            ctx.ellipse(seg.x, seg.y, seg.rx, seg.ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        // Coiled tail — quadratic curve spiraling inward.
        ctx.strokeStyle = bodyHex;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, 24);
        ctx.quadraticCurveTo(-16, 30, -12, 40);
        ctx.quadraticCurveTo(-2, 48, -2, 38);
        ctx.quadraticCurveTo(-2, 32, -8, 34);
        ctx.stroke();
        // Tail outline.
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Head bump + snout.
        ctx.fillStyle = bodyHex;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(2, -22, 8, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Snout (thin triangle pointing forward).
        ctx.beginPath();
        ctx.moveTo(8, -22);
        ctx.quadraticCurveTo(18, -22, 18, -18);
        ctx.quadraticCurveTo(14, -19, 8, -19);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Crest of tiny fin spikes along the back of the head.
        ctx.fillStyle = palette.crest;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(-3 - i * 3, -28);
            ctx.lineTo(-1 - i * 3, -32);
            ctx.lineTo(0 - i * 3, -28);
            ctx.closePath();
            ctx.fill();
        }

        // Dorsal fin on the back (flutters with `flap`).
        ctx.save();
        ctx.translate(-6, -2);
        ctx.rotate(flap * 0.18);
        const finGrad = ctx.createLinearGradient(0, -6, 0, 8);
        finGrad.addColorStop(0, hexToRgba(palette.belly, 0.95));
        finGrad.addColorStop(1, hexToRgba(palette.crest, 0.9));
        ctx.fillStyle = finGrad;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.quadraticCurveTo(-12, 0, 0, 10);
        ctx.quadraticCurveTo(-2, 2, 0, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Eye.
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(4, -22, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1b2a3b";
        ctx.beginPath();
        ctx.arc(4.6, -21.6, 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ---------- Bubbles ----------
    // Three tiers — small bubbles are zippy and worth the most, large bubbles
    // are slow and worth the least.
    const BUBBLE_TIERS = [
        { name: "small",  r: 8,  speed: 110, points: 5, weight: 0.45 },
        { name: "medium", r: 14, speed: 70,  points: 3, weight: 0.35 },
        { name: "large",  r: 22, speed: 45,  points: 1, weight: 0.20 }
    ];
    const BUBBLE_CAP = 14;
    const BUBBLE_SPAWN_MS = 450;
    let nextBubbleAt = 0;

    function pickBubbleTier() {
        const r = Math.random();
        let acc = 0;
        for (const t of BUBBLE_TIERS) {
            acc += t.weight;
            if (r <= acc) return t;
        }
        return BUBBLE_TIERS[BUBBLE_TIERS.length - 1];
    }

    function spawnBubble() {
        if (state.bubbles.length >= BUBBLE_CAP) return;
        const tier = pickBubbleTier();
        const margin = tier.r + 6;
        state.bubbles.push({
            x: randRange(margin, W - margin),
            y: H + tier.r + 6,
            r: tier.r,
            speed: tier.speed * randRange(0.85, 1.15),
            wobbleAmp: randRange(8, 18),
            wobbleFreq: randRange(0.9, 1.6),
            phase: Math.random() * Math.PI * 2,
            tier: tier.name,
            points: tier.points,
            popped: false
        });
    }

    function updateBubbles(dt) {
        const t = state.elapsed / 1000;
        const sx = state.seahorse.x;
        const sy = state.seahorse.y;
        for (const b of state.bubbles) {
            if (b.popped) continue;
            b.y -= b.speed * dt;
            b.x += Math.sin(t * b.wobbleFreq + b.phase) * b.wobbleAmp * dt;
            // Touch test against the seahorse body (~radius 20).
            const dx = b.x - sx;
            const dy = b.y - sy;
            const reach = b.r + 18;
            if (dx * dx + dy * dy <= reach * reach) {
                popBubble(b);
            }
        }
        // Drop popped or off-screen bubbles.
        state.bubbles = state.bubbles.filter((b) => !b.popped && b.y + b.r > -4);
    }

    function popBubble(b) {
        b.popped = true;
        spawnSparkles(b.x, b.y, b.tier);
        if (state.running) {
            state.score += b.points;
            scoreEl.textContent = state.score;
        }
        popChime(b.tier);
    }

    function drawBubbles() {
        for (const b of state.bubbles) {
            if (b.popped) continue;
            // Bubble fill — translucent radial gradient.
            const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, 1, b.x, b.y, b.r);
            g.addColorStop(0, "rgba(255, 255, 255, 0.85)");
            g.addColorStop(0.4, "rgba(180, 230, 255, 0.55)");
            g.addColorStop(1, "rgba(120, 200, 240, 0.18)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            // Rim highlight.
            ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r - 0.6, 0, Math.PI * 2);
            ctx.stroke();
            // Glint.
            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.beginPath();
            ctx.arc(b.x - b.r * 0.4, b.y - b.r * 0.5, b.r * 0.22, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---------- Jellyfish ----------
    // Drift horizontally, bob vertically with a sine wave, sting on contact.
    const JELLY_HIT_INVULN_MS = 1200;
    let nextJellyAt = 0;

    function spawnJelly() {
        const fromLeft = Math.random() < 0.5;
        const baseY = randRange(80, H - 140);
        state.jellies.push({
            x: fromLeft ? -40 : W + 40,
            baseY,
            y: baseY,
            vx: (fromLeft ? 1 : -1) * randRange(35, 60),
            bobAmp: randRange(8, 22),
            bobFreq: randRange(0.6, 1.1),
            phase: Math.random() * Math.PI * 2,
            r: 22 // bell radius
        });
    }

    function updateJellies(dt) {
        const t = state.elapsed / 1000;
        const sx = state.seahorse.x;
        const sy = state.seahorse.y;
        const invuln = state.elapsed < state.seahorse.invulnUntil;
        for (const j of state.jellies) {
            j.x += j.vx * dt;
            j.y = j.baseY + Math.sin(t * j.bobFreq + j.phase) * j.bobAmp;
            // Collision check (only when running and not invulnerable).
            if (state.running && !invuln) {
                const dx = j.x - sx;
                const dy = (j.y + 6) - sy; // bias toward bell + tentacles
                const reach = j.r + 14;
                if (dx * dx + dy * dy <= reach * reach) {
                    handleJellyHit();
                }
            }
        }
        // Drop jellies that have drifted fully off-screen.
        state.jellies = state.jellies.filter((j) => j.x > -80 && j.x < W + 80);
    }

    function handleJellyHit() {
        state.seahorse.invulnUntil = state.elapsed + JELLY_HIT_INVULN_MS;
        hurtBuzz();
    }

    function drawJellies() {
        for (const j of state.jellies) {
            ctx.save();
            ctx.translate(j.x, j.y);

            // Tentacles — wavy quadratic curves trailing below the bell.
            ctx.strokeStyle = "rgba(255, 150, 200, 0.7)";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            const t = state.elapsed / 200;
            for (let i = -2; i <= 2; i++) {
                const x0 = i * 6;
                const sway = Math.sin(t + i * 0.5) * 4;
                ctx.beginPath();
                ctx.moveTo(x0, 8);
                ctx.quadraticCurveTo(x0 + sway, 18, x0 - sway, 30);
                ctx.quadraticCurveTo(x0 + sway, 38, x0, 46);
                ctx.stroke();
            }

            // Bell.
            const bell = ctx.createRadialGradient(0, -4, 4, 0, 0, j.r);
            bell.addColorStop(0, "rgba(255, 220, 240, 0.85)");
            bell.addColorStop(0.6, "rgba(240, 130, 200, 0.65)");
            bell.addColorStop(1, "rgba(180, 80, 160, 0.45)");
            ctx.fillStyle = bell;
            ctx.beginPath();
            ctx.ellipse(0, 0, j.r, j.r * 0.8, 0, Math.PI, 0);
            ctx.lineTo(j.r, 6);
            ctx.quadraticCurveTo(j.r * 0.5, 12, 0, 8);
            ctx.quadraticCurveTo(-j.r * 0.5, 12, -j.r, 6);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 200, 230, 0.55)";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Inner glow / stinger dot.
            ctx.fillStyle = "rgba(255, 230, 240, 0.5)";
            ctx.beginPath();
            ctx.ellipse(0, -2, j.r * 0.45, j.r * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    // ---------- Wild seahorses + friend train ----------
    // Wild seahorses drift onto the stage from either side with gentle bobbing,
    // waving a little heart above their head. When the player's seahorse bumps
    // into one, the wild one becomes a friend and joins the train behind the
    // player. Each friend keeps its own color and follows the one in front.
    const FRIEND_POINTS = 2;
    const WILD_CAP = 2;
    let nextWildAt = 0;

    function spawnWildSeahorse() {
        if (state.wildHorses.length >= WILD_CAP) return;
        const fromLeft = Math.random() < 0.5;
        const y = randRange(80, H - 160);
        state.wildHorses.push({
            x: fromLeft ? -30 : W + 30,
            y,
            baseY: y,
            vx: (fromLeft ? 1 : -1) * randRange(28, 48),
            bobAmp: randRange(8, 16),
            bobFreq: randRange(0.6, 1.2),
            phase: Math.random() * Math.PI * 2,
            facing: fromLeft ? 1 : -1,
            flap: Math.random() * 10,
            palette: pickFriendPalette(),
            heartPhase: Math.random() * Math.PI * 2,
        });
    }

    function updateWildHorses(dt) {
        const t = state.elapsed / 1000;
        const sx = state.seahorse.x;
        const sy = state.seahorse.y;
        for (const w of state.wildHorses) {
            w.x += w.vx * dt;
            w.y = w.baseY + Math.sin(t * w.bobFreq + w.phase) * w.bobAmp;
            w.flap += dt;
            // Face the player when close so befriending feels personal.
            const toPlayer = sx - w.x;
            if (Math.abs(toPlayer) > 2) w.facing = toPlayer >= 0 ? 1 : -1;
            // Friendship check — generous hit radius so little fingers connect easily.
            const dx = w.x - sx;
            const dy = w.y - sy;
            const reach = 30;
            if (state.running && dx * dx + dy * dy <= reach * reach) {
                befriend(w);
                w.befriended = true;
            }
        }
        state.wildHorses = state.wildHorses.filter((w) =>
            !w.befriended && w.x > -60 && w.x < W + 60
        );
    }

    function befriend(w) {
        state.friends.push({
            x: w.x, y: w.y,
            facing: w.facing,
            flap: w.flap,
            palette: w.palette,
            scale: 0.72,
        });
        state.friendCount += 1;
        state.score += FRIEND_POINTS;
        scoreEl.textContent = state.score;
        friendsEl.textContent = state.friendCount;
        if (friendsStatEl) {
            friendsStatEl.classList.remove("bump");
            void friendsStatEl.offsetWidth;
            friendsStatEl.classList.add("bump");
        }
        spawnHearts(w.x, w.y, w.palette);
        friendChime();
    }

    function drawWildHorses() {
        const t = state.elapsed / 1000;
        for (const w of state.wildHorses) {
            drawSeahorse(w, w.flap, { scale: 0.9 });
            // Floating heart above — signals "come say hi!"
            const hx = w.x;
            const hy = w.y - 34 + Math.sin(t * 2 + w.heartPhase) * 3;
            drawHeart(hx, hy, 6, w.palette.crest);
        }
    }

    function drawHeart(x, y, size, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, size * 0.9);
        ctx.bezierCurveTo(size * 1.2, size * 0.1, size * 0.6, -size * 0.9, 0, -size * 0.2);
        ctx.bezierCurveTo(-size * 0.6, -size * 0.9, -size * 1.2, size * 0.1, 0, size * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Offset along the train so followers line up instead of stacking on each other.
    const FRIEND_GAP = 22;
    function updateFriendTrain() {
        // Each friend springs toward the one in front of it, offset behind.
        for (let i = 0; i < state.friends.length; i++) {
            const f = state.friends[i];
            const lead = i === 0 ? state.seahorse : state.friends[i - 1];
            // Target is offset behind the lead, opposite its facing so we trail it.
            const tx = lead.x - lead.facing * FRIEND_GAP;
            const ty = lead.y + 6;
            f.x = lerp(f.x, tx, 0.16);
            f.y = lerp(f.y, ty, 0.16);
            const dx = tx - f.x;
            if (Math.abs(dx) > 1) f.facing = dx >= 0 ? 1 : -1;
            f.flap += 0.06;
        }
    }

    function drawFriends() {
        // Draw back-to-front so closer friends overlap ones further back.
        for (let i = state.friends.length - 1; i >= 0; i--) {
            const f = state.friends[i];
            drawSeahorse(f, f.flap, { scale: f.scale || 0.7 });
        }
    }

    function spawnHearts(x, y, palette) {
        // Pink/palette-tinted burst that looks like hearts flying out.
        const n = 10;
        for (let i = 0; i < n; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 90;
            state.sparkles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 20,
                life: 0.7 + Math.random() * 0.4,
                max: 1.1,
                r: 2 + Math.random() * 1.8,
                color: palette ? palette.crest : "#ff8ac4",
            });
        }
    }

    // ---------- Sparkles (bubble pop confetti) ----------
    function spawnSparkles(x, y, tier) {
        const n = tier === "small" ? 12 : tier === "medium" ? 9 : 7;
        for (let i = 0; i < n; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 100;
            state.sparkles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.6 + Math.random() * 0.4,
                max: 1.0,
                r: 1.6 + Math.random() * 1.6
            });
        }
    }
    function updateSparkles(dt) {
        for (const s of state.sparkles) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy += 30 * dt; // bubble pop "spray" drifts down very gently
            s.life -= dt;
        }
        state.sparkles = state.sparkles.filter((s) => s.life > 0);
    }
    function drawSparkles() {
        for (const s of state.sparkles) {
            const a = Math.max(0, s.life / s.max);
            ctx.globalAlpha = a;
            ctx.fillStyle = s.color || "#cdeaff";
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ---------- Idle render loop ----------
    // Runs continuously so the seahorse follows the pointer even on the
    // overlay screen. The full game loop in a later commit will layer on
    // bubbles, jellyfish, and scoring.
    function idleStep(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;
        state.elapsed += dt * 1000;

        // Spring toward pointer.
        const k = 0.14;
        state.seahorse.x = lerp(state.seahorse.x, state.pointer.x, k);
        state.seahorse.y = lerp(state.seahorse.y, state.pointer.y, k);
        // Face the direction of travel.
        const dx = state.pointer.x - state.seahorse.x;
        if (Math.abs(dx) > 1) state.seahorse.facing = dx >= 0 ? 1 : -1;
        state.seahorse.flap += dt;

        // Bubble field — runs even on the overlay so the scene feels alive.
        if (state.elapsed >= nextBubbleAt) {
            spawnBubble();
            nextBubbleAt = state.elapsed + BUBBLE_SPAWN_MS * randRange(0.7, 1.3);
        }
        updateBubbles(dt);
        updateSparkles(dt);

        // Jellyfish only spawn during a running round; in-flight ones still
        // animate after the round ends so they drift off-screen naturally.
        if (state.running && state.elapsed >= nextJellyAt) {
            const cap = state.score >= 10 ? 2 : 1;
            if (state.jellies.length < cap) {
                spawnJelly();
            }
            nextJellyAt = state.elapsed + randRange(2800, 4200);
        }
        updateJellies(dt);

        // Wild seahorses only spawn while the round is live — they're the
        // little "friends to make" that the player chases down. The train of
        // already-befriended friends keeps following after the round ends.
        if (state.running && state.elapsed >= nextWildAt) {
            spawnWildSeahorse();
            nextWildAt = state.elapsed + randRange(2400, 4600);
        }
        updateWildHorses(dt);
        updateFriendTrain();

        ctx.clearRect(0, 0, W, H);
        drawBubbles();
        drawJellies();
        drawWildHorses();
        drawSparkles();
        drawFriends();
        drawSeahorse(state.seahorse, state.seahorse.flap);

        requestAnimationFrame(idleStep);
    }
    requestAnimationFrame(idleStep);

    // ---------- Start / End ----------
    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.running = true;
        state.score = 0;
        state.friendCount = 0;
        state.bubbles = [];
        state.jellies = [];
        state.sparkles = [];
        state.wildHorses = [];
        state.friends = [];
        state.seahorse.invulnUntil = 0;
        nextBubbleAt = state.elapsed; // resume spawning from now
        nextJellyAt = state.elapsed + randRange(1200, 2200);
        nextWildAt = state.elapsed + randRange(900, 1800);

        scoreEl.textContent = "0";
        friendsEl.textContent = "0";
        doneBtn.removeAttribute("hidden");

        overlay.classList.add("hidden");
        stage.classList.add("playing");
    }

    function endGame() {
        if (!state.running) return;
        state.running = false;
        stage.classList.remove("playing");
        doneBtn.setAttribute("hidden", "");

        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(state.playerName);

        const friendsLine = state.friendCount > 0
            ? ` You made ${state.friendCount} new ${state.friendCount === 1 ? "friend" : "friends"}! 💞`
            : "";
        overlayTitle.textContent = "Nice swim! 🌊";
        overlayMsg.textContent = `You scored ${state.score} points.${friendsLine}`;
        startBtn.textContent = "Play Again";
        overlay.classList.remove("hidden");
    }

    startBtn.addEventListener("click", startGame);
    doneBtn.addEventListener("click", endGame);
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
