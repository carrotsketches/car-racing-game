(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const helpBtn = document.getElementById("help-btn");
    const helpModal = document.getElementById("help-modal");
    const helpClose = document.getElementById("help-close");
    const wordCountEl = document.getElementById("word-count");
    const bookBtn = document.getElementById("book-btn");
    const bookModal = document.getElementById("book-modal");
    const bookClose = document.getElementById("book-close");
    const bookGrid = document.getElementById("book-grid");
    const bookEmpty = document.getElementById("book-empty");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "airplane-sight-word-leaderboard";
    const COLLECTION_KEY = "airplane-sight-word-collection";
    const LB_MAX = 20;

    // Dolch sight words grouped by difficulty
    const WORD_SETS = [
        // Level 1 — pre-primer (very short, easy)
        ["A","I","AM","AN","AT","BE","DO","GO","HE","IN","IS","IT","ME","MY","NO","OF","ON","OR","SO","TO","UP","US","WE"],
        // Level 2 — primer
        ["ALL","AND","ARE","BIG","BUT","CAN","DAY","DID","FOR","FUN","GET","GOT","HAD","HAS","HER","HIM","HIS","HOW","IF","ITS","LET","MAN","NOT","NOW","OLD","ONE","OUR","OUT","OWN","PUT","RAN","RED","RUN","SAW","SAY","SHE","THE","TOO","TWO","USE","WAS","WAY","WHO","WHY","YET","YOU"],
        // Level 3 — grade 1
        ["AFTER","ALSO","AWAY","BALL","BLUE","BOOK","CAME","COME","DISH","DOWN","EVER","FAST","FIND","FIVE","FOUR","FROM","GIVE","GOOD","HAVE","HELP","HERE","HOLD","HOME","JUMP","JUST","KEEP","KIND","KNOW","LAST","LIKE","LIVE","LONG","LOOK","LOVE","MADE","MAKE","MANY","MILK","MORE","MOST","MUCH","MUST","NAME","NEED","NEW","NEXT","NICE","NINE","OPEN","OVER","PLAY","PULL","READ","RIDE","SAID","SAME","SEND","SHOW","SING","SITS","SLOW","SOME","SOON","STOP","SUCH","TAKE","TELL","THAN","THAT","THEM","THEN","THEY","THIS","TIME","TOLD","UPON","WALK","WANT","WELL","WENT","WERE","WHAT","WHEN","WITH","WORD","WORK","YEAR","YOUR"],
    ];

    // Resize canvas to fill stage
    function resize() {
        const stage = canvas.parentElement;
        canvas.width = stage.clientWidth;
        canvas.height = Math.max(380, Math.min(window.innerHeight - 160, 520));
    }
    resize();
    window.addEventListener("resize", () => { resize(); });

    const state = {
        running: false,
        mode: "flying",      // "flying" | "repair"
        repair: null,         // active repair-shop mini-break
        score: 0,
        playerName: "",
        leaderboard: loadLeaderboard(),
        planes: [],
        targetWord: "",
        spawnTimer: 0,
        spawnInterval: 2800, // ms between spawns
        lastTime: 0,
        flashTimer: 0,
        flashColor: "",
        particles: [],
        smoke: [],          // skywriting smoke puffs
        skywrite: null,      // { word, t } big drifting word after a catch
        collection: loadCollection(),
    };

    function loadCollection() {
        try { const a = JSON.parse(localStorage.getItem(COLLECTION_KEY)); return Array.isArray(a) ? a : []; }
        catch (_) { return []; }
    }
    function saveCollection() {
        try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(state.collection)); } catch (_) {}
    }
    function collectWord(word) {
        if (!state.collection.includes(word)) {
            state.collection.push(word);
            saveCollection();
            return true; // newly collected
        }
        return false;
    }

    function loadLeaderboard() {
        try { const r = localStorage.getItem(LB_KEY); return Array.isArray(JSON.parse(r)) ? JSON.parse(r) : []; }
        catch (_) { return []; }
    }
    function saveLeaderboard() {
        try { localStorage.setItem(LB_KEY, JSON.stringify(state.leaderboard)); } catch (_) {}
    }
    function personalBest(name) {
        return state.leaderboard.filter(e => e.name === name).reduce((b, e) => Math.max(b, e.score), 0);
    }
    function sanitizeName(raw) { return (raw || "").trim().slice(0, 12) || "Pilot"; }

    // Pick a word pool based on score
    function wordPool() {
        if (state.score < 8)  return WORD_SETS[0];
        if (state.score < 20) return [...WORD_SETS[0], ...WORD_SETS[1]];
        return [...WORD_SETS[0], ...WORD_SETS[1], ...WORD_SETS[2]];
    }

    function randomWord(exclude) {
        const pool = wordPool().filter(w => w !== exclude);
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function pickTarget() {
        state.targetWord = randomWord(state.targetWord);
    }

    // Plane speed scales with score
    function planeSpeed() {
        return 55 + Math.min(state.score * 3, 85);
    }

    // How many distractors to show (1-3)
    function distactorCount() {
        if (state.score < 5)  return 1;
        if (state.score < 12) return 2;
        return 3;
    }

    const PLANE_H = 48;
    const PLANE_COLORS = ["#4a90d9","#e88d2f","#3dba7a","#d94a7a","#9b59b6","#e84a4a"];

    function spawnWave() {
        const W = canvas.width;
        const H = canvas.height;
        const count = 1 + distactorCount(); // correct + distractors
        const words = [state.targetWord];
        while (words.length < count) {
            const w = randomWord(null);
            if (!words.includes(w)) words.push(w);
        }
        // Shuffle
        for (let i = words.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [words[i], words[j]] = [words[j], words[i]];
        }

        const laneH = (H - 110) / count; // distribute below cloud area
        const goRight = Math.random() < 0.5;
        const colorIdx = Math.floor(Math.random() * PLANE_COLORS.length);

        words.forEach((word, i) => {
            const laneY = 110 + laneH * i + laneH / 2;
            const x = goRight ? -180 : W + 180;
            const vx = goRight ? planeSpeed() : -planeSpeed();
            // Give each plane a slightly staggered entry so they don't all arrive simultaneously
            const delay = i * 350; // ms
            state.planes.push({
                word, x, y: laneY, vx,
                color: PLANE_COLORS[(colorIdx + i) % PLANE_COLORS.length],
                facingRight: goRight,
                delay,
                active: false,
                hit: false,
                hitTimer: 0,
            });
        });
    }

    // Draw a cute airplane
    function drawPlane(p) {
        const ctx2 = ctx;
        ctx2.save();
        ctx2.translate(p.x, p.y);
        if (!p.facingRight) ctx2.scale(-1, 1);

        const col = p.hit ? (p.correct ? "#7fff7f" : "#ff6666") : p.color;

        // Fuselage
        ctx2.beginPath();
        ctx2.ellipse(0, 0, 52, 14, 0, 0, Math.PI * 2);
        ctx2.fillStyle = col;
        ctx2.fill();

        // Nose cone
        ctx2.beginPath();
        ctx2.moveTo(50, -8);
        ctx2.lineTo(72, 0);
        ctx2.lineTo(50, 8);
        ctx2.closePath();
        ctx2.fillStyle = col;
        ctx2.fill();

        // Cockpit window
        ctx2.beginPath();
        ctx2.ellipse(38, -3, 10, 7, -0.2, 0, Math.PI * 2);
        ctx2.fillStyle = "rgba(200,240,255,0.7)";
        ctx2.fill();

        // Main wing (top)
        ctx2.beginPath();
        ctx2.moveTo(10, -14);
        ctx2.lineTo(-20, -40);
        ctx2.lineTo(-35, -40);
        ctx2.lineTo(-15, -14);
        ctx2.closePath();
        ctx2.fillStyle = col;
        ctx2.fill();

        // Tail fin
        ctx2.beginPath();
        ctx2.moveTo(-42, -14);
        ctx2.lineTo(-55, -30);
        ctx2.lineTo(-50, -14);
        ctx2.closePath();
        ctx2.fillStyle = col;
        ctx2.fill();

        // Small lower stabilizer
        ctx2.beginPath();
        ctx2.moveTo(-42, 8);
        ctx2.lineTo(-56, 20);
        ctx2.lineTo(-50, 8);
        ctx2.closePath();
        ctx2.fillStyle = col;
        ctx2.fill();

        ctx2.restore();

        // Banner / word label below plane
        const label = p.word;
        const bannerW = Math.max(label.length * 14 + 20, 60);
        const bannerH = 30;
        const bx = p.x - bannerW / 2;
        const by = p.y + 18;

        ctx2.save();
        ctx2.beginPath();
        ctx2.roundRect(bx, by, bannerW, bannerH, 6);
        ctx2.fillStyle = "rgba(255,255,255,0.9)";
        ctx2.fill();
        ctx2.strokeStyle = p.hit ? (p.correct ? "#3dba7a" : "#e84a4a") : "#aaa";
        ctx2.lineWidth = 2;
        ctx2.stroke();
        ctx2.fillStyle = "#111";
        ctx2.font = `bold ${Math.min(18, 160 / label.length + 4)}px 'Segoe UI', sans-serif`;
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillText(label, p.x, by + bannerH / 2);
        ctx2.restore();
    }

    // Draw the target cloud
    function drawCloud(word) {
        const W = canvas.width;
        const cx = W / 2;
        const cy = 54;

        ctx.save();
        // Cloud puffs
        const puffs = [
            [cx - 40, cy + 4, 36],
            [cx, cy - 8, 42],
            [cx + 40, cy + 4, 36],
            [cx - 20, cy + 18, 30],
            [cx + 20, cy + 18, 30],
        ];
        ctx.fillStyle = "rgba(220,235,255,0.92)";
        puffs.forEach(([x, y, r]) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        });

        // Word label
        ctx.fillStyle = "#1a2a4a";
        ctx.font = `bold ${Math.min(26, 220 / word.length + 10)}px 'Segoe UI', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(word, cx, cy + 8);

        // "Find:" prompt
        ctx.fillStyle = "#445";
        ctx.font = "12px 'Segoe UI', sans-serif";
        ctx.fillText("☁️ Find this word:", cx, cy - 42);

        ctx.restore();
    }

    // Particle burst on tap
    function burst(x, y, correct) {
        const col = correct ? "#7fff7f" : "#ff6666";
        for (let i = 0; i < 14; i++) {
            const angle = (Math.PI * 2 * i) / 14;
            const speed = 2 + Math.random() * 3;
            state.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                col,
                r: 4 + Math.random() * 4,
            });
        }
    }

    function updateParticles(dt) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.life -= dt * 2;
            if (p.life <= 0) state.particles.splice(i, 1);
        }
    }

    function drawParticles() {
        state.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.col;
            ctx.fill();
            ctx.restore();
        });
    }

    // Skywriting smoke: soft white puffs that swell and fade
    function updateSmoke(dt) {
        for (let i = state.smoke.length - 1; i >= 0; i--) {
            const s = state.smoke[i];
            s.life -= dt;
            s.r += dt * 14;       // expand
            s.y -= dt * 6;        // drift up gently
            if (s.life <= 0) state.smoke.splice(i, 1);
        }
    }
    function drawSmoke() {
        state.smoke.forEach(s => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, s.life / s.max) * (s.dark ? 0.5 : 0.55);
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = s.dark ? "#444" : "#ffffff";
            ctx.fill();
            ctx.restore();
        });
    }

    // The caught word drifting up the sky as a celebratory banner
    function updateSkywrite(dt) {
        if (!state.skywrite) return;
        state.skywrite.t += dt;
        if (state.skywrite.t >= state.skywrite.dur) state.skywrite = null;
    }
    function drawSkywrite() {
        const sw = state.skywrite;
        if (!sw) return;
        const prog = sw.t / sw.dur;
        const W = canvas.width;
        const cx = W / 2;
        const cy = canvas.height * 0.42 - prog * 60; // rise upward
        const alpha = prog < 0.15 ? prog / 0.15 : (1 - (prog - 0.15) / 0.85);
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const size = Math.min(64, 420 / sw.word.length) + 8;
        ctx.font = `bold ${size}px 'Segoe UI', sans-serif`;
        // Soft smoky glow
        ctx.shadowColor = "rgba(255,255,255,0.9)";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(sw.word, cx, cy);
        ctx.shadowBlur = 0;
        if (sw.isNew) {
            ctx.font = "bold 16px 'Segoe UI', sans-serif";
            ctx.fillStyle = "#ffe07a";
            ctx.fillText("★ NEW WORD! ★", cx, cy + size * 0.7);
        }
        ctx.restore();
    }

    function updateHUD() {
        scoreEl.textContent = state.score;
        if (wordCountEl) wordCountEl.textContent = state.collection.length;
    }

    // Audio
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }

    function playTone(freq, duration, type = "sine", vol = 0.3) {
        const ac = ensureAudio();
        if (!ac) return;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
        o.start(); o.stop(ac.currentTime + duration);
    }

    function playCorrect() {
        playTone(523, 0.1); // C5
        setTimeout(() => playTone(659, 0.1), 100); // E5
        setTimeout(() => playTone(784, 0.2), 200); // G5
    }

    function playWrong() {
        playTone(200, 0.25, "sawtooth", 0.2);
    }

    // Game loop
    function loop(ts) {
        if (!state.running) return;
        const dt = Math.min((ts - (state.lastTime || ts)) / 1000, 0.05);
        state.lastTime = ts;

        const W = canvas.width;
        const H = canvas.height;

        // Repair-shop mini-break takes over the whole screen
        if (state.mode === "repair") {
            updateRepair(dt);
            drawRepair();
            requestAnimationFrame(loop);
            return;
        }

        // Spawn
        state.spawnTimer -= dt * 1000;
        if (state.spawnTimer <= 0) {
            spawnWave();
            state.spawnTimer = state.spawnInterval;
        }

        // Update planes
        for (let i = state.planes.length - 1; i >= 0; i--) {
            const p = state.planes[i];
            if (p.delay > 0) {
                // A still-delayed plane already marked hit (its wave was cleared)
                // should vanish quietly rather than pop in flashing red.
                if (p.hit) { state.planes.splice(i, 1); }
                else { p.delay -= dt * 1000; }
                continue;
            }
            p.active = true;

            // Skywriting victory loop — the caught plane loops and trails smoke
            if (p.skywriting) {
                const s = p.skywriting;
                s.t += dt;
                const prog = s.t / s.dur;
                const angle = -Math.PI / 2 + prog * Math.PI * 2 * s.loops;
                p.x = s.cx + Math.cos(angle) * s.r;
                p.y = s.cy + Math.sin(angle) * s.r;
                p.facingRight = Math.cos(angle) >= 0;
                // Emit smoke along the loop path
                state.smoke.push({ x: p.x, y: p.y, r: 5, life: 1.6, max: 1.6 });
                if (s.t >= s.dur) {
                    // Resume flying off in the original direction
                    p.skywriting = null;
                    p.vx = (p.facingRight ? 1 : -1) * planeSpeed();
                }
                continue;
            }

            p.x += p.vx * dt;

            if (p.hitTimer > 0) {
                p.hitTimer -= dt;
                if (p.hitTimer <= 0) state.planes.splice(i, 1);
                continue;
            }

            // Plane flew past without being tapped
            if ((p.vx > 0 && p.x > W + 220) || (p.vx < 0 && p.x < -220)) {
                if (p.word === state.targetWord) {
                    // missed the correct plane — just pick a new target, no penalty
                    pickTarget();
                }
                state.planes.splice(i, 1);
            }
        }

        // If no planes with target word remain (all correct ones removed), pick new target
        // Count queued (still-delayed) target planes too, or a staggered correct
        // plane gets ignored and waves spawn far too fast.
        const targetPlaneExists = state.planes.some(p => p.word === state.targetWord && !p.hit);
        if (!targetPlaneExists && state.spawnTimer > 400) {
            // spawn sooner
            state.spawnTimer = Math.min(state.spawnTimer, 400);
        }

        updateParticles(dt);
        updateSmoke(dt);
        updateSkywrite(dt);

        // Draw
        ctx.clearRect(0, 0, W, H);

        // Sky gradient
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, "#1a3a6e");
        sky.addColorStop(1, "#0a1a3e");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Stars
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        for (let i = 0; i < 30; i++) {
            // deterministic stars
            const sx = ((i * 137 + 11) % W);
            const sy = 80 + ((i * 97 + 23) % (H - 80));
            ctx.beginPath();
            ctx.arc(sx, sy, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Screen flash on correct/wrong
        if (state.flashTimer > 0) {
            ctx.save();
            ctx.globalAlpha = state.flashTimer * 0.35;
            ctx.fillStyle = state.flashColor;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            state.flashTimer -= dt * 4;
        }

        // Skywriting smoke sits behind the planes
        drawSmoke();

        // Draw planes
        state.planes.forEach(p => { if (p.active) drawPlane(p); });

        // Celebratory drifting word
        drawSkywrite();

        // Target cloud
        drawCloud(state.targetWord);

        drawParticles();

        requestAnimationFrame(loop);
    }

    function startGame() {
        ensureAudio();
        state.playerName = sanitizeName(nameInput.value);
        localStorage.setItem(NAME_KEY, state.playerName);
        playerNameEl.textContent = state.playerName;

        state.score = 0;
        state.mode = "flying";
        state.repair = null;
        state.planes = [];
        state.particles = [];
        state.smoke = [];
        state.skywrite = null;
        state.spawnTimer = 500;
        state.spawnInterval = 2800;
        state.lastTime = 0;
        pickTarget();
        updateHUD();

        overlay.classList.add("hidden");
        state.running = true;
        requestAnimationFrame(loop);
    }

    // This game is endless (no timer or lives), so instead of a game-over
    // save we record the running score to the leaderboard as it grows.
    // Each player keeps a single best entry so the board never floods.
    function recordBest() {
        const name = state.playerName;
        if (!name) return;
        const existing = state.leaderboard.find(e => e.name === name);
        if (existing) {
            if (state.score <= existing.score) return; // no improvement
            existing.score = state.score;
            existing.at = Date.now();
        } else {
            state.leaderboard.push({ name, score: state.score, at: Date.now() });
        }
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        bestEl.textContent = personalBest(name);
    }

    // Tap / click handler
    function onTap(clientX, clientY) {
        if (!state.running) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        if (state.mode === "repair") return; // repair uses drag (pointer events)

        for (let i = state.planes.length - 1; i >= 0; i--) {
            const p = state.planes[i];
            if (!p.active || p.hit) continue;
            // Hit box: fuselage + banner area
            const dx = Math.abs(x - p.x);
            const dy = Math.abs(y - p.y);
            if (dx < 90 && dy < 55) {
                p.hit = true;
                p.hitTimer = 0.6;
                burst(p.x, p.y, p.word === state.targetWord);

                if (p.word === state.targetWord) {
                    p.correct = true;
                    state.score++;
                    state.flashColor = "#00ff88";
                    state.flashTimer = 1;
                    // Speed up slowly
                    state.spawnInterval = Math.max(1200, state.spawnInterval - 50);
                    playCorrect();

                    // Add the word to the collection book (logbook)
                    const isNew = collectWord(p.word);

                    // Skywriting victory: the caught plane loops & trails smoke,
                    // and the word drifts up the sky in puffy smoke letters.
                    const cy = Math.max(120, Math.min(p.y, canvas.height - 80));
                    p.hitTimer = 0; // cancel instant removal
                    p.skywriting = { t: 0, dur: 1.5, loops: 1.5, cx: p.x, cy, r: 42 };
                    state.skywrite = { word: p.word, t: 0, dur: 2.2, isNew };

                    // Remove all other planes from this wave
                    state.planes.forEach(other => {
                        if (other !== p && !other.hit) {
                            other.hit = true;
                            other.correct = false;
                            other.hitTimer = 0.4;
                        }
                    });
                    pickTarget();
                    updateHUD();
                    recordBest(); // leaderboard fills passively as score grows

                    // Every 10 words, the hard-working plane breaks down and
                    // needs a trip to the repair shop before flying again.
                    if (state.score % 10 === 0) enterRepair(p.color);
                } else {
                    p.correct = false;
                    state.flashColor = "#ff3333";
                    state.flashTimer = 1;
                    playWrong();
                }
                return;
            }
        }
    }

    // ── Repair shop puzzle (every 10 words) ──
    // The plane breaks apart; drag its wing, tail and propeller back on.
    function enterRepair(planeColor) {
        state.mode = "repair";
        state.planes = [];
        state.smoke = [];
        state.skywrite = null;
        state.particles = [];

        const W = canvas.width, H = canvas.height;
        const cx = W / 2, cy = H / 2 - 8;
        // Scatter the loose parts along the bottom "workbench"
        const benchY = H - 52;
        const parts = [
            { id: "wing", tx: cx - 14, ty: cy - 30, x: W * 0.24, y: benchY, placed: false },
            { id: "tail", tx: cx - 56, ty: cy - 24, x: W * 0.5,  y: benchY, placed: false },
            { id: "prop", tx: cx + 70, ty: cy,      x: W * 0.76, y: benchY, placed: false },
        ];
        // Shuffle which bench slot each part starts in
        const xs = parts.map(p => p.x);
        for (let i = xs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [xs[i], xs[j]] = [xs[j], xs[i]];
        }
        parts.forEach((p, i) => { p.x = xs[i]; });

        state.repair = {
            color: planeColor || "#4a90d9",
            cx, cy, parts,
            drag: null,
            done: false,
            doneTimer: 0,
            lift: 0,        // assembled plane lift-off offset
            smokeTimer: 0,
        };
        playWrong(); // sputtering breakdown sound
    }

    const PART_HALF = { w: 42, h: 34 }; // generous grab box

    function repairPartAt(x, y) {
        const r = state.repair;
        if (!r) return null;
        // topmost (last drawn) unplaced part under the point
        for (let i = r.parts.length - 1; i >= 0; i--) {
            const p = r.parts[i];
            if (p.placed) continue;
            if (Math.abs(x - p.x) < PART_HALF.w && Math.abs(y - p.y) < PART_HALF.h) return p;
        }
        return null;
    }

    function repairPointerDown(x, y) {
        const r = state.repair;
        if (!r || r.done) return;
        const p = repairPartAt(x, y);
        if (p) r.drag = { part: p, ox: x - p.x, oy: y - p.y };
    }

    function repairPointerMove(x, y) {
        const r = state.repair;
        if (!r || !r.drag) return;
        r.drag.part.x = x - r.drag.ox;
        r.drag.part.y = y - r.drag.oy;
    }

    function repairPointerUp() {
        const r = state.repair;
        if (!r || !r.drag) return;
        const p = r.drag.part;
        const dist = Math.hypot(p.x - p.tx, p.y - p.ty);
        if (dist < 52) {
            // Snap into place!
            p.x = p.tx; p.y = p.ty; p.placed = true;
            playTone(440 + r.parts.filter(q => q.placed).length * 110, 0.1, "square", 0.25);
            for (let i = 0; i < 12; i++) {
                const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
                state.particles.push({ x: p.tx, y: p.ty, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                    life: 0.7, col: "#ffd24a", r: 3 + Math.random() * 3 });
            }
            if (r.parts.every(q => q.placed)) { r.done = true; r.doneTimer = 1.8; playCorrect(); }
        }
        r.drag = null;
    }

    function updateRepair(dt) {
        const r = state.repair;
        if (!r) return;
        if (!r.done) {
            // Black smoke puffs from the broken engine
            r.smokeTimer -= dt;
            if (r.smokeTimer <= 0) {
                r.smokeTimer = 0.1;
                state.smoke.push({ x: r.cx + 50, y: r.cy - 6, r: 6, life: 1.2, max: 1.2, dark: true });
            }
        } else {
            r.doneTimer -= dt;
            r.lift += dt * 90; // assembled plane climbs away
            if (r.doneTimer <= 0) exitRepair();
        }
        updateParticles(dt);
        updateSmoke(dt);
    }

    function drawRepair() {
        const r = state.repair;
        const W = canvas.width, H = canvas.height;

        // Sky
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, "#1a3a6e");
        sky.addColorStop(1, "#0a1a3e");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Workbench floor
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, H - 76, W, 76);
        ctx.font = "34px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🔧", W * 0.1, H - 38);
        ctx.fillText("🛠️", W * 0.9, H - 38);

        drawSmoke();

        const placedCount = r.parts.filter(p => p.placed).length;
        const fixed = r.done;
        const liftY = -r.lift;

        // Plane body (always present), lifts off once fixed
        drawBodyPart(r.cx, r.cy + liftY, fixed ? r.color : "#3a3a3a", fixed);

        // Placed parts ride with the body; loose parts sit where dragged
        r.parts.forEach(p => {
            const px = p.placed ? p.tx : p.x;
            const py = (p.placed ? p.ty : p.y) + (p.placed ? liftY : 0);
            const col = p.placed ? r.color : "#3a3a3a";
            if (!p.placed) drawSlotGhost(p.tx, p.ty, p.id); // show where it goes
            drawPart(p.id, px, py, col, !p.placed);
        });

        drawParticles();

        // Prompt
        ctx.textAlign = "center";
        if (fixed) {
            ctx.fillStyle = "#9effa0";
            ctx.font = "bold 22px 'Segoe UI', sans-serif";
            ctx.fillText("✈️ All fixed! Off we go!", W / 2, 60);
        } else {
            ctx.fillStyle = "#ffe07a";
            ctx.font = "bold 20px 'Segoe UI', sans-serif";
            ctx.fillText("Oh no, the plane broke!", W / 2, 50);
            ctx.fillStyle = "#cfe3ff";
            ctx.font = "16px 'Segoe UI', sans-serif";
            ctx.fillText(`Drag the parts back on  (${placedCount}/${r.parts.length})`, W / 2, 76);
        }
    }

    // Faint outline showing where a part belongs
    function drawSlotGhost(x, y, id) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        drawPart(id, x, y, "rgba(255,255,255,0.08)", false, true);
        ctx.restore();
    }

    function drawBodyPart(x, y, col, fixed) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.ellipse(0, 0, 60, 17, 0, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        // Cockpit
        ctx.beginPath();
        ctx.ellipse(40, -4, 12, 8, -0.2, 0, Math.PI * 2);
        ctx.fillStyle = fixed ? "rgba(200,240,255,0.9)" : "rgba(120,140,160,0.6)"; ctx.fill();
        // Face
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        if (fixed) {
            ctx.beginPath(); ctx.arc(38, 0, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(34, -7); ctx.lineTo(40, -1); ctx.moveTo(40, -7); ctx.lineTo(34, -1);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Draw a single part centered at (x,y). `outline` only strokes the shape.
    function drawPart(id, x, y, col, loose, outline) {
        ctx.save();
        ctx.translate(x, y);
        if (loose && !outline) {
            ctx.shadowColor = "rgba(0,0,0,0.4)";
            ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
        }
        ctx.fillStyle = col;
        ctx.beginPath();
        if (id === "wing") {
            ctx.moveTo(-26, 16); ctx.lineTo(-2, -16); ctx.lineTo(16, -16); ctx.lineTo(-8, 16);
        } else if (id === "tail") {
            ctx.moveTo(8, 16); ctx.lineTo(-8, -18); ctx.lineTo(16, -18); ctx.lineTo(24, 16);
        } else { // prop (nose cone + propeller)
            ctx.moveTo(-12, -10); ctx.lineTo(10, 0); ctx.lineTo(-12, 10);
        }
        ctx.closePath();
        if (outline) ctx.stroke(); else ctx.fill();
        if (id === "prop" && !outline) {
            // propeller blades + hub
            ctx.fillStyle = col;
            ctx.fillRect(10, -22, 5, 44);
            ctx.beginPath(); ctx.arc(12, 0, 6, 0, Math.PI * 2); ctx.fillStyle = "#222"; ctx.fill();
        }
        ctx.restore();
    }

    function exitRepair() {
        state.repair = null;
        state.mode = "flying";
        state.smoke = [];
        state.particles = [];
        state.spawnTimer = 400;
        pickTarget();
    }

    // Convert a client point to canvas coordinates
    function canvasCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    canvas.addEventListener("click", e => onTap(e.clientX, e.clientY));
    canvas.addEventListener("touchstart", e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        onTap(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });

    // Pointer drag — used to assemble parts in the repair-shop puzzle
    canvas.addEventListener("pointerdown", e => {
        if (state.mode !== "repair") return;
        const c = canvasCoords(e.clientX, e.clientY);
        repairPointerDown(c.x, c.y);
    });
    canvas.addEventListener("pointermove", e => {
        if (state.mode !== "repair" || !state.repair || !state.repair.drag) return;
        const c = canvasCoords(e.clientX, e.clientY);
        repairPointerMove(c.x, c.y);
    });
    canvas.addEventListener("pointerup", () => { if (state.mode === "repair") repairPointerUp(); });
    canvas.addEventListener("pointercancel", () => { if (state.mode === "repair") repairPointerUp(); });
    canvas.addEventListener("touchend", e => e.preventDefault(), { passive: false });

    // Name pre-fill
    const saved = localStorage.getItem(NAME_KEY) || "";
    if (saved) { nameInput.value = saved; playerNameEl.textContent = saved; }
    bestEl.textContent = personalBest(saved);
    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        bestEl.textContent = personalBest(n);
    });

    // ── Word collection logbook ──
    function renderBook() {
        bookGrid.innerHTML = "";
        const words = [...state.collection].sort();
        bookEmpty.hidden = words.length > 0;
        words.forEach(w => {
            const tile = document.createElement("div");
            tile.className = "sticker";
            tile.innerHTML = `<span class="sticker-plane">✈️</span><span class="sticker-word">${w}</span>`;
            bookGrid.appendChild(tile);
        });
    }
    function openBook() { renderBook(); bookModal.hidden = false; }

    startBtn.addEventListener("click", startGame);
    helpBtn.addEventListener("click", () => { helpModal.hidden = false; });
    helpClose.addEventListener("click", () => { helpModal.hidden = true; });
    helpModal.addEventListener("click", (e) => { if (e.target === helpModal) helpModal.hidden = true; });
    bookBtn.addEventListener("click", openBook);
    bookClose.addEventListener("click", () => { bookModal.hidden = true; });
    bookModal.addEventListener("click", (e) => { if (e.target === bookModal) bookModal.hidden = true; });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (!helpModal.hidden) helpModal.hidden = true;
            if (!bookModal.hidden) bookModal.hidden = true;
        }
    });

    // Initial HUD
    updateHUD();
})();
