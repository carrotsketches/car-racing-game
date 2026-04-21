(() => {
    const hourHand = document.getElementById("hour-hand");
    const minuteHand = document.getElementById("minute-hand");
    const ticksGroup = document.getElementById("ticks");
    const numbersGroup = document.getElementById("numbers");
    const hourInput = document.getElementById("hour-input");
    const minuteInput = document.getElementById("minute-input");
    const adjustBtns = document.querySelectorAll(".adjust");

    buildClockFace();

    // Audio (lazy) — a soft tick when the time changes
    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function playTick() {
        const ac = ensureAudio();
        if (!ac) return;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(620, ac.currentTime);
        gain.gain.setValueAtTime(0.12, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + 0.08);
    }

    function buildClockFace() {
        const SVG = "http://www.w3.org/2000/svg";
        const cx = 100, cy = 100;
        for (let i = 0; i < 60; i++) {
            const angle = (i * 6 - 90) * Math.PI / 180;
            const isMajor = i % 5 === 0;
            const inner = isMajor ? 80 : 84;
            const outer = 90;
            const x1 = cx + Math.cos(angle) * inner;
            const y1 = cy + Math.sin(angle) * inner;
            const x2 = cx + Math.cos(angle) * outer;
            const y2 = cy + Math.sin(angle) * outer;
            const tick = document.createElementNS(SVG, "line");
            tick.setAttribute("x1", x1);
            tick.setAttribute("y1", y1);
            tick.setAttribute("x2", x2);
            tick.setAttribute("y2", y2);
            tick.setAttribute("class", "tick " + (isMajor ? "major" : "minor"));
            ticksGroup.appendChild(tick);
        }
        for (let h = 1; h <= 12; h++) {
            const angle = (h * 30 - 90) * Math.PI / 180;
            const r = 68;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            const text = document.createElementNS(SVG, "text");
            text.setAttribute("x", x);
            text.setAttribute("y", y);
            text.setAttribute("class", "num");
            text.textContent = String(h);
            numbersGroup.appendChild(text);
        }
    }

    function setClock(hour, minute) {
        const minuteAngle = minute * 6;
        const hourAngle = (hour % 12) * 30 + (minute / 60) * 30;
        hourHand.setAttribute("transform", `rotate(${hourAngle} 100 100)`);
        minuteHand.setAttribute("transform", `rotate(${minuteAngle} 100 100)`);
    }

    function wrap(value, min, max) {
        const span = max - min + 1;
        let v = ((value - min) % span + span) % span + min;
        return v;
    }

    function readTime() {
        const hRaw = parseInt(hourInput.value, 10);
        const mRaw = parseInt(minuteInput.value, 10);
        const hour = Number.isFinite(hRaw) ? hRaw : 12;
        const minute = Number.isFinite(mRaw) ? mRaw : 0;
        return { hour, minute };
    }

    function applyTime({ silent = false } = {}) {
        const { hour, minute } = readTime();
        setClock(hour, minute);
        if (!silent) playTick();
    }

    function clampOnBlur(input, min, max) {
        const raw = parseInt(input.value, 10);
        if (!Number.isFinite(raw)) {
            input.value = String(min);
        } else {
            input.value = String(Math.min(max, Math.max(min, raw)));
        }
        applyTime({ silent: true });
    }

    hourInput.addEventListener("input", () => applyTime());
    minuteInput.addEventListener("input", () => applyTime());
    hourInput.addEventListener("blur", () => clampOnBlur(hourInput, 1, 12));
    minuteInput.addEventListener("blur", () => clampOnBlur(minuteInput, 0, 59));

    adjustBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const dir = Number(btn.dataset.dir);
            if (btn.dataset.unit === "hour") {
                const cur = parseInt(hourInput.value, 10);
                const base = Number.isFinite(cur) ? cur : 12;
                hourInput.value = String(wrap(base + dir, 1, 12));
            } else {
                const cur = parseInt(minuteInput.value, 10);
                const base = Number.isFinite(cur) ? cur : 0;
                minuteInput.value = String(wrap(base + dir, 0, 59));
            }
            applyTime();
        });
    });

    // Initial render
    applyTime({ silent: true });
})();
