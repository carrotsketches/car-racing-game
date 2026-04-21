(() => {
    const hourHand = document.getElementById("hour-hand");
    const minuteHand = document.getElementById("minute-hand");
    const ticksGroup = document.getElementById("ticks");
    const numbersGroup = document.getElementById("numbers");
    const hourDisplay = document.getElementById("hour-display");
    const minuteDisplay = document.getElementById("minute-display");
    const slotHour = document.getElementById("slot-hour");
    const slotMinute = document.getElementById("slot-minute");
    const keypad = document.getElementById("keypad");
    const hintEl = document.getElementById("hint");

    const state = {
        hourStr: "",
        minuteStr: "",
        active: "hour",
    };

    buildClockFace();
    render();

    let audio = null;
    function ensureAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio = new Ctx();
        }
        if (audio && audio.state === "suspended") audio.resume();
        return audio;
    }
    function tone({ freq, endFreq = null, type = "triangle", duration = 0.08, volume = 0.14 }) {
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
    const playTap = () => tone({ freq: 620 });
    const playBack = () => tone({ freq: 320, type: "square", duration: 0.07 });
    const playSwitch = () => tone({ freq: 440, endFreq: 660, duration: 0.1 });

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

    function currentHour() {
        const h = parseInt(state.hourStr, 10);
        return Number.isFinite(h) && h >= 1 ? h : 12;
    }
    function currentMinute() {
        const m = parseInt(state.minuteStr, 10);
        return Number.isFinite(m) ? m : 0;
    }

    function render() {
        hourDisplay.textContent = state.hourStr === "" ? "_" : state.hourStr;
        let mText;
        if (state.minuteStr === "") mText = "_ _";
        else if (state.minuteStr.length === 1) mText = state.minuteStr + " _";
        else mText = state.minuteStr[0] + " " + state.minuteStr[1];
        minuteDisplay.textContent = mText;

        slotHour.classList.toggle("active", state.active === "hour");
        slotMinute.classList.toggle("active", state.active === "minute");

        setClock(currentHour(), currentMinute());
    }

    function setActive(slot) {
        if (state.active === slot) return;
        state.active = slot;
        playSwitch();
        render();
    }

    function tapDigit(d) {
        ensureAudio();
        if (state.active === "hour") {
            if (state.hourStr === "") {
                if (d === "0") return; // no leading zero for hour
                state.hourStr = d;
                playTap();
                // 2-9 can't grow into a valid 2-digit hour; switch focus silently
                if (d !== "1") state.active = "minute";
            } else if (state.hourStr === "1") {
                if (d === "0" || d === "1" || d === "2") {
                    state.hourStr = "1" + d; // 10, 11, 12
                    state.active = "minute";
                    playTap();
                } else {
                    // "1" + (3-9): keep hour as 1, overflow digit becomes minute
                    state.active = "minute";
                    render();
                    tapDigit(d);
                    return;
                }
            } else {
                // hour already 2 digits or single non-"1" digit — push to minute
                state.active = "minute";
                render();
                tapDigit(d);
                return;
            }
        } else {
            // minute slot
            if (state.minuteStr.length === 0) {
                if (parseInt(d, 10) > 5) return; // tens digit must be 0-5
                state.minuteStr = d;
                playTap();
            } else if (state.minuteStr.length === 1) {
                state.minuteStr = state.minuteStr + d;
                playTap();
            } else {
                return; // minute full
            }
        }
        render();
    }

    function tapBack() {
        ensureAudio();
        if (state.active === "minute") {
            if (state.minuteStr.length > 0) {
                state.minuteStr = state.minuteStr.slice(0, -1);
                playBack();
            } else {
                state.active = "hour";
                playSwitch();
            }
        } else {
            if (state.hourStr.length > 0) {
                state.hourStr = state.hourStr.slice(0, -1);
                playBack();
            }
        }
        render();
    }

    function tapClear() {
        ensureAudio();
        state.hourStr = "";
        state.minuteStr = "";
        state.active = "hour";
        playBack();
        render();
    }

    keypad.addEventListener("click", (e) => {
        const btn = e.target.closest("button.key");
        if (!btn) return;
        const k = btn.dataset.k;
        if (k === "back") tapBack();
        else if (k === "clear") tapClear();
        else if (/^[0-9]$/.test(k)) tapDigit(k);
    });

    slotHour.addEventListener("click", () => setActive("hour"));
    slotMinute.addEventListener("click", () => setActive("minute"));
})();
