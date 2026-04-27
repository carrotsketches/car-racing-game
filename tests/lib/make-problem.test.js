const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../../shared/lib.js");
const { seededRng } = require("../helpers/seeded-rng.js");

function range(n) { return Array.from({ length: n }, (_, i) => i); }

test("makeProblem: rejects unknown op", () => {
    assert.throws(() => lib.makeProblem({ op: "mul", level: "easy" }), RangeError);
});

test("makeProblem: rejects unknown level", () => {
    assert.throws(() => lib.makeProblem({ op: "add", level: "hard" }), RangeError);
});

test("makeProblem easy add: a+b never exceeds 10, both >= 1", () => {
    const rng = seededRng(42);
    for (const _ of range(500)) {
        const p = lib.makeProblem({ op: "add", level: "easy", rng });
        assert.ok(p.a >= 1 && p.b >= 1, `a=${p.a} b=${p.b}`);
        assert.ok(p.a + p.b <= 10, `sum too large: ${p.a}+${p.b}`);
        assert.equal(p.result, p.a + p.b);
        // hasCarry true only at the boundary (e.g. 4+6=10). Borrow is always false for add.
        assert.equal(p.hasCarry, p.aOnes + p.bOnes >= 10);
        assert.equal(p.hasBorrow, false);
    }
});

test("makeProblem easy sub: result is always positive", () => {
    const rng = seededRng(7);
    for (const _ of range(500)) {
        const p = lib.makeProblem({ op: "sub", level: "easy", rng });
        assert.ok(p.a > p.b, `a=${p.a} should exceed b=${p.b}`);
        assert.ok(p.result >= 1, `result must be >= 1, got ${p.result}`);
        assert.equal(p.result, p.a - p.b);
    }
});

test("makeProblem medium add: a+b <= 20", () => {
    const rng = seededRng(11);
    for (const _ of range(1000)) {
        const p = lib.makeProblem({ op: "add", level: "medium", rng });
        assert.ok(p.a >= 1 && p.b >= 1);
        assert.ok(p.result <= 20, `medium add overflow: ${p.a}+${p.b}=${p.result}`);
    }
});

test("makeProblem medium sub: result is always positive", () => {
    const rng = seededRng(99);
    for (const _ of range(1000)) {
        const p = lib.makeProblem({ op: "sub", level: "medium", rng });
        assert.ok(p.a >= p.b, `a=${p.a} b=${p.b}`);
        assert.ok(p.result >= 0, `negative result ${p.result}`);
    }
});

test("makeProblem: digit decomposition is correct", () => {
    const rng = seededRng(123);
    for (const _ of range(200)) {
        const p = lib.makeProblem({ op: "add", level: "medium", rng });
        assert.equal(p.aTens * 10 + p.aOnes, p.a);
        assert.equal(p.bTens * 10 + p.bOnes, p.b);
        assert.equal(p.resultTens * 10 + p.resultOnes, p.result);
    }
});

test("makeProblem add: hasCarry matches arithmetic", () => {
    const rng = seededRng(321);
    for (const _ of range(200)) {
        const p = lib.makeProblem({ op: "add", level: "medium", rng });
        assert.equal(p.hasCarry, (p.aOnes + p.bOnes) >= 10);
    }
});

test("makeProblem sub: hasBorrow matches arithmetic", () => {
    const rng = seededRng(555);
    for (const _ of range(200)) {
        const p = lib.makeProblem({ op: "sub", level: "medium", rng });
        assert.equal(p.hasBorrow, p.aOnes < p.bOnes);
    }
});

test("makeProblem: deterministic for a given seed", () => {
    const r1 = seededRng(1234);
    const r2 = seededRng(1234);
    for (const _ of range(50)) {
        const p1 = lib.makeProblem({ op: "add", level: "medium", rng: r1 });
        const p2 = lib.makeProblem({ op: "add", level: "medium", rng: r2 });
        assert.deepEqual(p1, p2);
    }
});

test("makeProblem: defaults to Math.random when no rng provided", () => {
    const p = lib.makeProblem({ op: "add", level: "easy" });
    assert.equal(p.result, p.a + p.b);
});
