const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../../shared/lib.js");
const { memoryStorage, failingStorage } = require("../helpers/memory-storage.js");

const KEY = "test-game-leaderboard";

test("loadLeaderboard: returns empty array when key missing", () => {
    assert.deepEqual(lib.loadLeaderboard(memoryStorage(), KEY), []);
});

test("loadLeaderboard: parses valid JSON array", () => {
    const s = memoryStorage({
        [KEY]: JSON.stringify([{ name: "A", score: 5, at: 1 }]),
    });
    assert.deepEqual(lib.loadLeaderboard(s, KEY), [{ name: "A", score: 5, at: 1 }]);
});

test("loadLeaderboard: returns [] on malformed JSON", () => {
    const s = memoryStorage({ [KEY]: "{not json" });
    assert.deepEqual(lib.loadLeaderboard(s, KEY), []);
});

test("loadLeaderboard: returns [] when value is non-array JSON", () => {
    const s = memoryStorage({ [KEY]: JSON.stringify({ name: "A" }) });
    assert.deepEqual(lib.loadLeaderboard(s, KEY), []);
});

test("loadLeaderboard: filters out invalid entries (missing fields, NaN, wrong types)", () => {
    const s = memoryStorage({
        [KEY]: JSON.stringify([
            { name: "A", score: 10 },
            { name: "B", score: NaN },
            { name: 7, score: 5 },
            { score: 5 },
            null,
            "junk",
            { name: "C", score: 3 },
        ]),
    });
    assert.deepEqual(lib.loadLeaderboard(s, KEY), [
        { name: "A", score: 10 },
        { name: "C", score: 3 },
    ]);
});

test("loadLeaderboard: returns [] when storage throws", () => {
    assert.deepEqual(lib.loadLeaderboard(failingStorage(), KEY), []);
});

test("saveLeaderboard: writes JSON and reports success", () => {
    const s = memoryStorage();
    const ok = lib.saveLeaderboard(s, KEY, [{ name: "A", score: 1, at: 100 }]);
    assert.equal(ok, true);
    assert.deepEqual(JSON.parse(s.getItem(KEY)), [{ name: "A", score: 1, at: 100 }]);
});

test("saveLeaderboard: returns false when storage throws", () => {
    assert.equal(lib.saveLeaderboard(failingStorage(), KEY, []), false);
});

test("insertScore: keeps list sorted desc by score", () => {
    let lb = [];
    lb = lib.insertScore(lb, { name: "A", score: 10 });
    lb = lib.insertScore(lb, { name: "B", score: 30 });
    lb = lib.insertScore(lb, { name: "C", score: 20 });
    assert.deepEqual(lb.map((e) => e.score), [30, 20, 10]);
});

test("insertScore: caps at LB_MAX (default 20)", () => {
    let lb = [];
    for (let i = 0; i < 25; i++) {
        lb = lib.insertScore(lb, { name: "P" + i, score: i });
    }
    assert.equal(lb.length, 20);
    assert.equal(lb[0].score, 24);
    assert.equal(lb[19].score, 5);
});

test("insertScore: respects custom cap", () => {
    let lb = [];
    for (let i = 0; i < 10; i++) {
        lb = lib.insertScore(lb, { name: "P" + i, score: i }, 3);
    }
    assert.equal(lb.length, 3);
    assert.deepEqual(lb.map((e) => e.score), [9, 8, 7]);
});

test("insertScore: stamps `at` if missing", () => {
    const before = Date.now();
    const lb = lib.insertScore([], { name: "A", score: 1 });
    assert.ok(lb[0].at >= before);
});

test("insertScore: preserves provided `at`", () => {
    const lb = lib.insertScore([], { name: "A", score: 1, at: 12345 });
    assert.equal(lb[0].at, 12345);
});

test("insertScore: rejects invalid entry", () => {
    assert.throws(() => lib.insertScore([], { name: "A", score: "10" }), TypeError);
    assert.throws(() => lib.insertScore([], { name: "A" }), TypeError);
    assert.throws(() => lib.insertScore([], null), TypeError);
});

test("insertScore: does not mutate caller's array", () => {
    const original = [{ name: "A", score: 10, at: 1 }];
    const next = lib.insertScore(original, { name: "B", score: 20 });
    assert.equal(original.length, 1);
    assert.equal(next.length, 2);
});

test("personalBest: returns 0 for unknown player", () => {
    assert.equal(lib.personalBest([{ name: "A", score: 50 }], "B"), 0);
});

test("personalBest: returns 0 for empty leaderboard", () => {
    assert.equal(lib.personalBest([], "A"), 0);
});

test("personalBest: returns max score for matching name", () => {
    const lb = [
        { name: "A", score: 10 },
        { name: "A", score: 99 },
        { name: "A", score: 30 },
        { name: "B", score: 200 },
    ];
    assert.equal(lib.personalBest(lb, "A"), 99);
});

test("personalBest: name match is case-sensitive (matches game.js behavior)", () => {
    const lb = [{ name: "Alice", score: 10 }];
    assert.equal(lib.personalBest(lb, "alice"), 0);
});

test("rankOf: locates inserted entry by reference", () => {
    const lb = lib.insertScore([], { name: "A", score: 50 });
    assert.equal(lib.rankOf(lb, lb[0]), 0);
});

test("rankOf: returns -1 when not found", () => {
    const lb = [{ name: "A", score: 1 }];
    assert.equal(lib.rankOf(lb, { name: "A", score: 1 }), -1);
});

test("isValidEntry: accepts well-formed entries", () => {
    assert.equal(lib.isValidEntry({ name: "A", score: 0 }), true);
    assert.equal(lib.isValidEntry({ name: "A", score: -5 }), true);
});

test("isValidEntry: rejects bad shapes", () => {
    assert.equal(lib.isValidEntry(null), false);
    assert.equal(lib.isValidEntry({}), false);
    assert.equal(lib.isValidEntry({ name: "A" }), false);
    assert.equal(lib.isValidEntry({ name: "A", score: NaN }), false);
    assert.equal(lib.isValidEntry({ name: "A", score: "10" }), false);
    assert.equal(lib.isValidEntry({ name: 5, score: 10 }), false);
    assert.equal(lib.isValidEntry({ name: "A", score: Infinity }), false);
});
