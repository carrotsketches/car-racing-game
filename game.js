(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const speedEl = document.getElementById("speed");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMsg = document.getElementById("overlay-msg");
    const startBtn = document.getElementById("start-btn");

    const W = canvas.width;
    const H = canvas.height;
    const LANE_COUNT = 3;
    const LANE_WIDTH = W / LANE_COUNT;
    const CAR_W = 44;
    const CAR_H = 72;

    const state = {
        running: false,
        player: { x: W / 2 - CAR_W / 2, y: H - CAR_H - 30 },
        obstacles: [],
        stripes: [],
        score: 0,
        best: Number(localStorage.getItem("highway-dash-best") || 0),
        speed: 5,
        baseSpeed: 5,
        maxSpeed: 12,
        spawnTimer: 0,
        keys: {},
    };

    bestEl.textContent = state.best;

    const STRIPE_COUNT = 10;
    for (let i = 0; i < STRIPE_COUNT; i++) {
        state.stripes.push({ y: (H / STRIPE_COUNT) * i });
    }

    const CAR_COLORS = ["#e74c3c", "#3498db", "#9b59b6", "#1abc9c", "#e67e22"];

    function laneX(lane) {
        return lane * LANE_WIDTH + LANE_WIDTH / 2 - CAR_W / 2;
    }

    function spawnObstacle() {
        const lane = Math.floor(Math.random() * LANE_COUNT);
        const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
        state.obstacles.push({
            x: laneX(lane),
            y: -CAR_H,
            color,
            speed: state.speed * (0.6 + Math.random() * 0.4),
        });
    }

    function reset() {
        state.player.x = W / 2 - CAR_W / 2;
        state.obstacles = [];
        state.score = 0;
        state.speed = state.baseSpeed;
        state.spawnTimer = 0;
    }

    function startGame() {
        reset();
        overlay.classList.add("hidden");
        state.running = true;
    }

    function gameOver() {
        state.running = false;
        if (state.score > state.best) {
            state.best = state.score;
            localStorage.setItem("highway-dash-best", state.best);
            bestEl.textContent = state.best;
        }
        overlayTitle.textContent = "Crashed!";
        overlayMsg.textContent = `You scored ${state.score}. Try again?`;
        startBtn.textContent = "Race Again";
        overlay.classList.remove("hidden");
    }

    function update(dt) {
        if (!state.running) return;

        if (state.keys.left) state.player.x -= 6;
        if (state.keys.right) state.player.x += 6;
        if (state.keys.up) state.speed = Math.min(state.maxSpeed, state.speed + 0.05);
        if (state.keys.down) state.speed = Math.max(3, state.speed - 0.08);

        state.player.x = Math.max(4, Math.min(W - CAR_W - 4, state.player.x));

        for (const s of state.stripes) {
            s.y += state.speed;
            if (s.y > H) s.y -= H;
        }

        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
            spawnObstacle();
            state.spawnTimer = Math.max(350, 900 - state.score * 2);
        }

        for (const o of state.obstacles) {
            o.y += state.speed + o.speed * 0.15;
        }
        state.obstacles = state.obstacles.filter((o) => {
            if (o.y > H) {
                state.score += 10;
                return false;
            }
            return true;
        });

        state.speed = Math.min(state.maxSpeed, state.baseSpeed + state.score * 0.01);

        for (const o of state.obstacles) {
            if (collides(state.player, o)) {
                gameOver();
                return;
            }
        }

        scoreEl.textContent = state.score;
        speedEl.textContent = Math.round(state.speed * 18);
    }

    function collides(a, b) {
        return (
            a.x < b.x + CAR_W &&
            a.x + CAR_W > b.x &&
            a.y < b.y + CAR_H &&
            a.y + CAR_H > b.y
        );
    }

    function drawRoad() {
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#1f1f1f";
        ctx.fillRect(0, 0, 12, H);
        ctx.fillRect(W - 12, 0, 12, H);

        ctx.fillStyle = "#fff";
        for (let lane = 1; lane < LANE_COUNT; lane++) {
            const x = lane * LANE_WIDTH - 2;
            for (const s of state.stripes) {
                ctx.fillRect(x, s.y, 4, 30);
            }
        }
    }

    function drawCar(x, y, color) {
        ctx.fillStyle = color;
        roundRect(ctx, x, y, CAR_W, CAR_H, 8);
        ctx.fill();

        ctx.fillStyle = "rgba(20, 20, 30, 0.75)";
        roundRect(ctx, x + 6, y + 10, CAR_W - 12, 18, 4);
        ctx.fill();
        roundRect(ctx, x + 6, y + CAR_H - 28, CAR_W - 12, 18, 4);
        ctx.fill();

        ctx.fillStyle = "#111";
        ctx.fillRect(x - 3, y + 8, 4, 14);
        ctx.fillRect(x + CAR_W - 1, y + 8, 4, 14);
        ctx.fillRect(x - 3, y + CAR_H - 22, 4, 14);
        ctx.fillRect(x + CAR_W - 1, y + CAR_H - 22, 4, 14);
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function render() {
        drawRoad();
        for (const o of state.obstacles) drawCar(o.x, o.y, o.color);
        drawCar(state.player.x, state.player.y, "#f5c451");
    }

    let lastTime = performance.now();
    function loop(now) {
        const dt = now - lastTime;
        lastTime = now;
        update(dt);
        render();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    window.addEventListener("keydown", (e) => {
        if (["ArrowLeft", "a", "A"].includes(e.key)) state.keys.left = true;
        if (["ArrowRight", "d", "D"].includes(e.key)) state.keys.right = true;
        if (["ArrowUp", "w", "W"].includes(e.key)) state.keys.up = true;
        if (["ArrowDown", "s", "S"].includes(e.key)) state.keys.down = true;
        if (e.key === " " && !state.running) startGame();
    });

    window.addEventListener("keyup", (e) => {
        if (["ArrowLeft", "a", "A"].includes(e.key)) state.keys.left = false;
        if (["ArrowRight", "d", "D"].includes(e.key)) state.keys.right = false;
        if (["ArrowUp", "w", "W"].includes(e.key)) state.keys.up = false;
        if (["ArrowDown", "s", "S"].includes(e.key)) state.keys.down = false;
    });

    startBtn.addEventListener("click", startGame);
})();
