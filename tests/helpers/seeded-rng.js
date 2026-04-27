// Deterministic RNG for repeatable tests of Math.random-driven code.
// mulberry32 — small, fast, well-distributed.
function seededRng(seed = 1) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

module.exports = { seededRng };
