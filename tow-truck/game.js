(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const timeEl = document.getElementById("time");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");
    const nameInput = document.getElementById("name-input");
    const playerNameEl = document.getElementById("player-name");
    const lbList = document.getElementById("leaderboard-list");
    const winchBtn = document.getElementById("winch-btn");
    const winchFill = document.getElementById("winch-fill");
    const laneBtns = document.querySelectorAll(".touch-btn.lane");

    const NAME_KEY = "highway-dash-last-name";
    const LB_KEY = "tow-truck-leaderboard";
    const LB_MAX = 20;
    const ROUND_MS = 60000;

    const LANE_YS = [260, 360, 460];
    const TRUCK_SCREEN_X = 90;
    const TRUCK_W = 90;
    const TRUCK_H = 48;
    const ADJ_RANGE = 60;
    const COLORS = ["#ef4444", "#3b82f6", "#22c55e"];

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
        const t = (raw || "").trim().slice(0, 12);
        return t || "Player";
    }
    function renderLb() {
        if (!lbList) return;
        lbList.innerHTML = "";
        for (const e of state.leaderboard.slice(0, 10)) {
            const li = document.createElement("li");
            li.textContent = `${e.name} — ${e.score}`;
            lbList.appendChild(li);
        }
    }

    const state = {
        running: false,
        score: 0,
        timeLeft: ROUND_MS,
        cameraX: 0,
        speed: 180,
        truckLane: 1,
        carried: null,          // {color}
        winchDown: false,
        winchProgress: 0,
        entities: [],            // {type, worldX, lane, color, done}
        nextSpawnX: 500,
        parallax: { hills: 0, trees: 0, stripes: 0 },
        particles: [],
        playerName: "",
        leaderboard: loadLeaderboard(),
        wheelAngle: 0,
    };

    function updateBestDisplay() {
        const name = (nameInput.value || state.playerName || "").trim().slice(0, 12);
        bestEl.textContent = name ? personalBest(name) : 0;
    }
    const savedName = localStorage.getItem(NAME_KEY) || "";
    if (savedName) { nameInput.value = savedName; playerNameEl.textContent = savedName; }
    updateBestDisplay();
    renderLb();
    nameInput.addEventListener("input", () => {
        const n = nameInput.value.trim().slice(0, 12);
        playerNameEl.textContent = n || "—";
        updateBestDisplay();
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
    function tone({ freq = 440, endFreq = null, type = "sine", duration = 0.15, volume = 0.2 }) {
        const ac = ensureAudio();
        if (!ac) return;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ac.currentTime);
        if (endFreq != null) osc.frequency.linearRampToValueAtTime(endFreq, ac.currentTime + duration);
        gain.gain.setValueAtTime(volume, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + duration);
    }
    let lastWinchTick = 0;
    function winchTick(now) {
        if (now - lastWinchTick > 70) {
            tone({ freq: 420, type: "square", duration: 0.04, volume: 0.08 });
            lastWinchTick = now;
        }
    }
    function playAttach() { tone({ freq: 660, endFreq: 880, type: "triangle", duration: 0.16, volume: 0.22 }); }
    function playCorrect() {
        tone({ freq: 660, type: "triangle", duration: 0.12, volume: 0.22 });
        setTimeout(() => tone({ freq: 990, type: "triangle", duration: 0.18, volume: 0.24 }), 110);
    }
    function playWrong() { tone({ freq: 160, type: "sine", duration: 0.22, volume: 0.2 }); }
    function playTick() { tone({ freq: 540, type: "triangle", duration: 0.05, volume: 0.12 }); }
    function playEnd() {
        tone({ freq: 523, type: "triangle", duration: 0.15, volume: 0.22 });
        setTimeout(() => tone({ freq: 659, type: "triangle", duration: 0.15, volume: 0.22 }), 130);
        setTimeout(() => tone({ freq: 784, type: "triangle", duration: 0.25, volume: 0.24 }), 260);
    }

    function spawnPair() {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const carX = state.nextSpawnX;
        const carLane = Math.floor(Math.random() * 3);
        state.entities.push({ type: "car", worldX: carX, lane: carLane, color, done: false });
        const garageX = carX + 650 + Math.random() * 200;
        const garageLane = Math.floor(Math.random() * 3);
        state.entities.push({ type: "garage", worldX: garageX, lane: garageLane, color, done: false });
        state.nextSpawnX = garageX + 500 + Math.random() * 200;
    }

    function adjacentCar() {
        const truckWorldX = state.cameraX + TRUCK_SCREEN_X + TRUCK_W / 2;
        for (const e of state.entities) {
            if (e.type !== "car" || e.done) continue;
            if (e.lane !== state.truckLane) continue;
            if (Math.abs(e.worldX - truckWorldX) < ADJ_RANGE) return e;
        }
        return null;
    }
    function adjacentGarage() {
        const truckWorldX = state.cameraX + TRUCK_SCREEN_X + TRUCK_W / 2;
        for (const e of state.entities) {
            if (e.type !== "garage" || e.done) continue;
            if (e.lane !== state.truckLane) continue;
            if (Math.abs(e.worldX - truckWorldX) < ADJ_RANGE + 20) return e;
        }
        return null;
    }

    function burstConfetti(sx, sy, color) {
        for (let i = 0; i < 22; i++) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 80 + Math.random() * 160;
            state.particles.push({
                x: sx, y: sy,
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp - 60,
                life: 1,
                color: Math.random() < 0.5 ? color : "#ef4444",
                size: 3 + Math.random() * 3,
            });
        }
    }

    function onWinchPress() {
        if (!state.running) return;
        if (state.carried) {
            const g = adjacentGarage();
            if (g) {
                g.done = true;
                if (g.color === state.carried.color) {
                    state.score += 1;
                    scoreEl.textContent = state.score;
                    playCorrect();
                    burstConfetti(TRUCK_SCREEN_X + TRUCK_W / 2, LANE_YS[state.truckLane], state.carried.color);
                } else {
                    playWrong();
                }
                state.carried = null;
            }
        }
    }
    function setWinchDown(down) {
        state.winchDown = down;
        winchBtn.classList.toggle("pressed", down);
    }

    function changeLane(delta) {
        if (!state.running) return;
        const next = Math.max(0, Math.min(2, state.truckLane + delta));
        state.truckLane = next;
    }

    laneBtns.forEach(btn => {
        btn.addEventListener("pointerdown", e => {
            e.preventDefault();
            const k = btn.dataset.key;
            changeLane(k === "left" ? -1 : 1);
        });
    });
    winchBtn.addEventListener("pointerdown", e => {
        e.preventDefault();
        setWinchDown(true);
        onWinchPress();
    });
    window.addEventListener("pointerup", () => setWinchDown(false));
    winchBtn.addEventListener("pointercancel", () => setWinchDown(false));

    window.addEventListener("keydown", e => {
        if (e.code === "ArrowLeft") { e.preventDefault(); changeLane(-1); }
        else if (e.code === "ArrowRight") { e.preventDefault(); changeLane(1); }
        else if (e.code === "Space") {
            e.preventDefault();
            if (!state.winchDown) { setWinchDown(true); onWinchPress(); }
        }
    });
    window.addEventListener("keyup", e => { if (e.code === "Space") setWinchDown(false); });

    function reset() {
        state.score = 0;
        state.timeLeft = ROUND_MS;
        state.cameraX = 0;
        state.speed = 180;
        state.truckLane = 1;
        state.carried = null;
        state.winchDown = false;
        state.winchProgress = 0;
        state.entities = [];
        state.nextSpawnX = 450;
        state.parallax = { hills: 0, trees: 0, stripes: 0 };
        state.particles = [];
        state.wheelAngle = 0;
        winchFill.style.width = "0%";
        scoreEl.textContent = 0;
        timeEl.textContent = Math.ceil(ROUND_MS / 1000);
        // prime a couple of pairs
        spawnPair();
        spawnPair();
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
    }

    function endGame() {
        state.running = false;
        setWinchDown(false);
        playEnd();
        const entry = { name: state.playerName, score: state.score, at: Date.now() };
        state.leaderboard.push(entry);
        state.leaderboard.sort((a, b) => b.score - a.score);
        state.leaderboard = state.leaderboard.slice(0, LB_MAX);
        saveLeaderboard();
        updateBestDisplay();
        renderLb();
        const rank = state.leaderboard.indexOf(entry);
        let msg = `${state.playerName} rescued ${state.score} cars!`;
        if (rank === 0) msg += " 🏆 New top score!";
        else if (rank >= 0 && rank < 10) msg += ` Rank #${rank + 1}.`;
        overlayTitle.textContent = "Time's up!";
        overlayMsg.textContent = msg;
        startBtn.textContent = "Play Again";
        overlay.classList.remove("hidden");
    }

    function drawSky() {
        ctx.clearRect(0, 0, W, H);
        const g = ctx.createLinearGradient(0, 0, 0, 200);
        g.addColorStop(0, "#7fb1d6");
        g.addColorStop(1, "#b7d8ea");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, 220);
    }
    function drawHills() {
        ctx.fillStyle = "#7a9b56";
        const off = -(state.parallax.hills % 260);
        for (let i = 0; i < 4; i++) {
            const cx = off + i * 260;
            ctx.beginPath();
            ctx.arc(cx, 230, 90, Math.PI, 0);
            ctx.fill();
        }
        ctx.fillStyle = "#5f7e3e";
        const off2 = -(state.parallax.trees % 140);
        for (let i = 0; i < 8; i++) {
            const cx = off2 + i * 140;
            ctx.beginPath();
            ctx.arc(cx, 240, 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(cx - 3, 240, 6, 14);
            ctx.fillStyle = "#5f7e3e";
        }
    }
    function drawRoad() {
        ctx.fillStyle = "#2a2d35";
        ctx.fillRect(0, 250, W, 240);
        // lane dividers
        ctx.fillStyle = "#d8d4b0";
        const off = -(state.parallax.stripes % 60);
        for (let y of [LANE_YS[0] + 50, LANE_YS[1] + 50]) {
            for (let i = 0; i < 9; i++) {
                ctx.fillRect(off + i * 60, y - 3, 32, 6);
            }
        }
        // shoulders
        ctx.fillStyle = "#8a7a42";
        ctx.fillRect(0, 490, W, 30);
    }
    function drawTruck() {
        const y = LANE_YS[state.truckLane];
        const x = TRUCK_SCREEN_X;
        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(x + TRUCK_W / 2, y + TRUCK_H / 2 + 6, TRUCK_W / 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // flatbed
        ctx.fillStyle = "#555";
        ctx.fillRect(x + TRUCK_W - 50, y - 4, 50, 12);
        if (state.carried) {
            ctx.fillStyle = state.carried.color;
            ctx.fillRect(x + TRUCK_W - 48, y - 22, 46, 18);
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.strokeRect(x + TRUCK_W - 48, y - 22, 46, 18);
        }
        // body (red)
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(x, y - 8, 56, TRUCK_H);
        ctx.fillStyle = "#b91c1c";
        ctx.fillRect(x + 56, y - 8, 18, 20);
        // window
        ctx.fillStyle = "#b7d8ea";
        ctx.fillRect(x + 6, y - 4, 38, 14);
        // wheels
        ctx.fillStyle = "#111";
        for (const wx of [x + 14, x + 48, x + 78]) {
            ctx.save();
            ctx.translate(wx, y + TRUCK_H - 6);
            ctx.rotate(state.wheelAngle);
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#888";
            ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
            ctx.restore();
        }
        // hook + chain when winching
        const car = adjacentCar();
        if (car && !state.carried && state.winchDown) {
            const carScreenX = car.worldX - state.cameraX;
            const carY = LANE_YS[car.lane];
            const progX = x + TRUCK_W + (carScreenX - (x + TRUCK_W)) * (1 - state.winchProgress * 0.6);
            ctx.strokeStyle = "#222";
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + TRUCK_W, y + TRUCK_H / 2 - 4);
            ctx.lineTo(progX, carY + 4);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    function drawEntities() {
        for (const e of state.entities) {
            if (e.done) continue;
            const sx = e.worldX - state.cameraX;
            if (sx < -100 || sx > W + 100) continue;
            const y = LANE_YS[e.lane];
            if (e.type === "car") {
                // shadow
                ctx.fillStyle = "rgba(0,0,0,0.22)";
                ctx.beginPath();
                ctx.ellipse(sx, y + TRUCK_H / 2 + 6, 32, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                // body
                ctx.fillStyle = e.color;
                ctx.fillRect(sx - 28, y - 6, 56, 30);
                ctx.fillStyle = "#b7d8ea";
                ctx.fillRect(sx - 20, y - 2, 40, 10);
                ctx.fillStyle = "#111";
                ctx.beginPath();
                ctx.arc(sx - 16, y + 24, 7, 0, Math.PI * 2);
                ctx.arc(sx + 16, y + 24, 7, 0, Math.PI * 2);
                ctx.fill();
                // smoke puff above
                ctx.globalAlpha = 0.75;
                ctx.fillStyle = "#cfd7e3";
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(sx - 10 + i * 8, y - 18 - i * 4, 6 + i, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            } else {
                // garage: colored doorway
                ctx.fillStyle = "#3a3a3a";
                ctx.fillRect(sx - 32, y - 32, 64, 64);
                ctx.fillStyle = e.color;
                ctx.fillRect(sx - 32, y - 32, 64, 10);
                // inner door
                ctx.fillStyle = "#1b2735";
                ctx.fillRect(sx - 24, y - 18, 48, 46);
                // label stripe
                ctx.fillStyle = "#fff";
                ctx.font = "bold 14px sans-serif";
                ctx.fillText("🏚️", sx - 10, y + 10);
            }
        }
    }
    function drawParticles(dt) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 260 * dt;
            p.life -= dt * 1.1;
            if (p.life <= 0) { state.particles.splice(i, 1); continue; }
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.globalAlpha = 1;
        }
    }

    let lastTime = performance.now();
    let timeLow = false;
    function loop(now) {
        const dtMs = now - lastTime;
        lastTime = now;
        const dt = Math.min(0.05, dtMs / 1000);

        drawSky();
        drawHills();
        drawRoad();

        if (state.running) {
            state.timeLeft -= dtMs;
            if (state.timeLeft <= 0) {
                timeEl.textContent = 0;
                endGame();
            } else {
                const curr = Math.ceil(state.timeLeft / 1000);
                if (curr !== Number(timeEl.textContent)) {
                    timeEl.textContent = curr;
                    if (curr <= 5) playTick();
                }
                const low = curr <= 10;
                if (low !== timeLow) { timeLow = low; }

                // world advance
                state.cameraX += state.speed * dt;
                state.parallax.stripes += state.speed * dt;
                state.parallax.hills += state.speed * 0.25 * dt;
                state.parallax.trees += state.speed * 0.5 * dt;
                state.wheelAngle += state.speed * 0.02 * dt * 60;
                state.speed = Math.min(260, state.speed + dt * 1.5);

                // spawn if stage nearly empty ahead
                const aheadOf = state.cameraX + W + 200;
                while (state.nextSpawnX < aheadOf + 600) spawnPair();

                // cull far-left entities
                state.entities = state.entities.filter(e => (e.worldX - state.cameraX) > -160);

                // winch progress
                if (!state.carried && state.winchDown) {
                    const car = adjacentCar();
                    if (car) {
                        state.winchProgress = Math.min(1, state.winchProgress + dt * 0.9);
                        winchTick(now);
                        if (state.winchProgress >= 1) {
                            car.done = true;
                            state.carried = { color: car.color };
                            state.winchProgress = 0;
                            playAttach();
                        }
                    } else {
                        state.winchProgress = Math.max(0, state.winchProgress - dt * 1.4);
                    }
                } else if (!state.carried) {
                    state.winchProgress = Math.max(0, state.winchProgress - dt * 1.4);
                }
                winchFill.style.width = (state.winchProgress * 100).toFixed(1) + "%";
                winchBtn.classList.toggle("active", !state.carried && adjacentCar() != null);
            }
        }

        drawEntities();
        drawTruck();
        drawParticles(dt);

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    startBtn.addEventListener("click", startGame);

    ["touchstart", "touchmove", "touchend"].forEach(evt => {
        canvas.addEventListener(evt, e => e.preventDefault(), { passive: false });
    });
})();
