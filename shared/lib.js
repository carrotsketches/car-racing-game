// Canonical helpers shared by every game. Pure functions only — no DOM, no audio.
// Browser usage:    <script src="../shared/lib.js"></script>  →  window.GameLib.sanitizeName(...)
// Node usage:       const lib = require("../shared/lib.js");
//
// Keep this file tiny and pure. If you add a helper, add a test in tests/lib/.

(function (root, factory) {
    const lib = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = lib;
    } else {
        root.GameLib = lib;
    }
})(typeof self !== "undefined" ? self : this, function () {
    const NAME_KEY = "highway-dash-last-name";
    const NAME_MAX = 12;
    const LB_MAX = 20;
    const PLAY_TRACKER_KEY = "games-plays-v1";

    function sanitizeName(raw) {
        const trimmed = String(raw == null ? "" : raw).trim().slice(0, NAME_MAX);
        return trimmed || "Player";
    }

    function clampName(raw) {
        // Same trimming/cap as sanitizeName but preserves empty string for live UI feedback.
        return String(raw == null ? "" : raw).trim().slice(0, NAME_MAX);
    }

    function loadLeaderboard(storage, key) {
        try {
            const raw = storage.getItem(key);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.filter(isValidEntry) : [];
        } catch (_) {
            return [];
        }
    }

    function saveLeaderboard(storage, key, entries) {
        try {
            storage.setItem(key, JSON.stringify(entries));
            return true;
        } catch (_) {
            return false;
        }
    }

    function isValidEntry(e) {
        return !!(e && typeof e === "object"
            && typeof e.name === "string"
            && typeof e.score === "number"
            && Number.isFinite(e.score));
    }

    function insertScore(entries, entry, max) {
        const cap = Number.isInteger(max) && max > 0 ? max : LB_MAX;
        if (!isValidEntry(entry)) throw new TypeError("insertScore: invalid entry");
        const next = entries.slice();
        next.push({ name: entry.name, score: entry.score, at: entry.at || Date.now() });
        next.sort((a, b) => b.score - a.score);
        return next.slice(0, cap);
    }

    function personalBest(entries, name) {
        let best = 0;
        for (const e of entries) {
            if (e && e.name === name && typeof e.score === "number" && e.score > best) {
                best = e.score;
            }
        }
        return best;
    }

    function rankOf(entries, entry) {
        // Returns 0-based index of the entry reference in `entries`, or -1.
        for (let i = 0; i < entries.length; i++) {
            if (entries[i] === entry) return i;
        }
        return -1;
    }

    // --- Add It Up problem generator (extracted, deterministic when seeded) ---
    function makeProblem({ op, level, rng = Math.random }) {
        if (op !== "add" && op !== "sub") throw new RangeError("op must be 'add' or 'sub'");
        if (level !== "easy" && level !== "medium") throw new RangeError("level must be 'easy' or 'medium'");
        const pair = op === "sub" ? genSubPair(level, rng) : genAddPair(level, rng);
        const { a, b } = pair;
        const result = op === "sub" ? a - b : a + b;
        const aOnes = a % 10;
        const bOnes = b % 10;
        return {
            a, b, op, result,
            aTens: Math.floor(a / 10),
            aOnes,
            bTens: Math.floor(b / 10),
            bOnes,
            resultTens: Math.floor(result / 10),
            resultOnes: result % 10,
            hasCarry: op === "add" && aOnes + bOnes >= 10,
            hasBorrow: op === "sub" && aOnes < bOnes,
        };
    }

    function genAddPair(level, rng) {
        let a, b;
        if (level === "easy") {
            a = 1 + Math.floor(rng() * 8);
            b = 1 + Math.floor(rng() * (10 - a));
        } else {
            const r = rng();
            if (r < 0.25) {
                a = 1 + Math.floor(rng() * 8);
                b = 1 + Math.floor(rng() * (9 - a));
            } else if (r < 0.75) {
                a = 2 + Math.floor(rng() * 7);
                const minB = Math.max(2, 11 - a);
                const maxB = 9;
                b = minB + Math.floor(rng() * (maxB - minB + 1));
            } else {
                a = 10 + Math.floor(rng() * 9);
                const maxB = 20 - a;
                b = 1 + Math.floor(rng() * maxB);
            }
        }
        if (rng() < 0.5) { const t = a; a = b; b = t; }
        return { a, b };
    }

    function genSubPair(level, rng) {
        let a, b;
        if (level === "easy") {
            a = 2 + Math.floor(rng() * 9);
            b = 1 + Math.floor(rng() * (a - 1));
        } else {
            const r = rng();
            if (r < 0.2) {
                a = 3 + Math.floor(rng() * 7);
                b = 1 + Math.floor(rng() * (a - 1));
            } else if (r < 0.65) {
                a = 11 + Math.floor(rng() * 8);
                const aOnes = a % 10;
                b = (aOnes + 1) + Math.floor(rng() * (9 - aOnes));
            } else {
                a = 11 + Math.floor(rng() * 10);
                const aOnes = a % 10;
                if (aOnes === 0) {
                    b = 10;
                } else {
                    b = 1 + Math.floor(rng() * aOnes);
                }
            }
        }
        return { a, b };
    }

    // --- Play tracker (mirrors shared/play-tracker.js logic, but pure) ---
    function recordPlay(store, slug, name) {
        if (!slug || typeof slug !== "string") throw new TypeError("recordPlay: slug required");
        const next = store && typeof store === "object" ? store : {};
        if (!next.games || typeof next.games !== "object") next.games = {};
        if (!next.players || typeof next.players !== "object") next.players = {};
        const player = (name || "").trim() || "Anonymous";

        const g = next.games[slug] || { plays: 0 };
        g.plays = (g.plays || 0) + 1;
        next.games[slug] = g;

        const p = next.players[player] || { plays: 0, games: {} };
        p.plays = (p.plays || 0) + 1;
        if (!p.games || typeof p.games !== "object") p.games = {};
        p.games[slug] = (p.games[slug] || 0) + 1;
        next.players[player] = p;

        return next;
    }

    return {
        NAME_KEY,
        NAME_MAX,
        LB_MAX,
        PLAY_TRACKER_KEY,
        sanitizeName,
        clampName,
        loadLeaderboard,
        saveLeaderboard,
        insertScore,
        personalBest,
        rankOf,
        isValidEntry,
        makeProblem,
        recordPlay,
    };
});
