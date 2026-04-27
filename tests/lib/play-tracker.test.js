const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../../shared/lib.js");

test("recordPlay: bootstraps store from undefined/null", () => {
    const next = lib.recordPlay(undefined, "highway-dash", "Alice");
    assert.deepEqual(next.games["highway-dash"], { plays: 1 });
    assert.deepEqual(next.players["Alice"], { plays: 1, games: { "highway-dash": 1 } });
});

test("recordPlay: increments existing counts", () => {
    let store = lib.recordPlay(null, "piano", "Bob");
    store = lib.recordPlay(store, "piano", "Bob");
    store = lib.recordPlay(store, "piano", "Bob");
    assert.equal(store.games["piano"].plays, 3);
    assert.equal(store.players["Bob"].plays, 3);
    assert.equal(store.players["Bob"].games["piano"], 3);
});

test("recordPlay: tracks per-game counts per player", () => {
    let store = {};
    store = lib.recordPlay(store, "piano", "Bob");
    store = lib.recordPlay(store, "highway-dash", "Bob");
    store = lib.recordPlay(store, "highway-dash", "Bob");
    assert.equal(store.players["Bob"].plays, 3);
    assert.deepEqual(store.players["Bob"].games, { piano: 1, "highway-dash": 2 });
});

test("recordPlay: empty/whitespace name becomes 'Anonymous'", () => {
    const a = lib.recordPlay({}, "piano", "");
    const b = lib.recordPlay(a, "piano", "   ");
    const c = lib.recordPlay(b, "piano", null);
    assert.equal(c.players["Anonymous"].plays, 3);
});

test("recordPlay: throws on missing slug", () => {
    assert.throws(() => lib.recordPlay({}, "", "Alice"), TypeError);
    assert.throws(() => lib.recordPlay({}, null, "Alice"), TypeError);
});

test("recordPlay: tolerates malformed pre-existing store", () => {
    const store = { games: "not-an-object", players: 42 };
    const next = lib.recordPlay(store, "piano", "Alice");
    assert.equal(typeof next.games, "object");
    assert.equal(typeof next.players, "object");
    assert.equal(next.games["piano"].plays, 1);
});

test("recordPlay: tolerates malformed per-player.games field", () => {
    const store = { players: { Alice: { plays: 5, games: "junk" } }, games: {} };
    const next = lib.recordPlay(store, "piano", "Alice");
    assert.equal(next.players["Alice"].games["piano"], 1);
    assert.equal(next.players["Alice"].plays, 6);
});

test("PLAY_TRACKER_KEY constant matches shared/play-tracker.js", () => {
    assert.equal(lib.PLAY_TRACKER_KEY, "games-plays-v1");
});
