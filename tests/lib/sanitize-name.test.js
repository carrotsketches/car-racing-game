const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../../shared/lib.js");

test("sanitizeName: trims whitespace", () => {
    assert.equal(lib.sanitizeName("  Alice  "), "Alice");
});

test("sanitizeName: caps at 12 chars", () => {
    assert.equal(lib.sanitizeName("ABCDEFGHIJKLMNOP"), "ABCDEFGHIJKL");
    assert.equal(lib.sanitizeName("ABCDEFGHIJKL").length, 12);
});

test("sanitizeName: defaults to 'Player' for empty/whitespace input", () => {
    assert.equal(lib.sanitizeName(""), "Player");
    assert.equal(lib.sanitizeName("   "), "Player");
    assert.equal(lib.sanitizeName(null), "Player");
    assert.equal(lib.sanitizeName(undefined), "Player");
});

test("sanitizeName: coerces non-string input safely", () => {
    assert.equal(lib.sanitizeName(42), "42");
    assert.equal(lib.sanitizeName(true), "true");
});

test("sanitizeName: never returns whitespace-only string", () => {
    assert.equal(lib.sanitizeName("\t\n  \r"), "Player");
});

test("clampName: preserves empty (no 'Player' fallback)", () => {
    assert.equal(lib.clampName(""), "");
    assert.equal(lib.clampName("   "), "");
});

test("clampName: still trims and caps at 12", () => {
    assert.equal(lib.clampName("  Bob  "), "Bob");
    assert.equal(lib.clampName("ABCDEFGHIJKLMNOP"), "ABCDEFGHIJKL");
});

test("NAME_KEY: shared cross-game key is stable", () => {
    // Changing this would silently log out every player on every game.
    assert.equal(lib.NAME_KEY, "highway-dash-last-name");
});

test("NAME_MAX is 12", () => {
    assert.equal(lib.NAME_MAX, 12);
});
