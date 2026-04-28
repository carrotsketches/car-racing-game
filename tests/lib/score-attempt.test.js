// Gap #4 (scoped): the first-try / retry scoring rule used by add-it-up.
// Encapsulates "10 if you got it in one, 5 otherwise" behind a named
// function so changes are visible in a diff.

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../../shared/lib.js');

const ADD_IT_UP = { pointsFirstTry: 10, pointsRetry: 5 };

test('scoreForAttempt: 0 mistakes => first-try points', () => {
    assert.equal(lib.scoreForAttempt({ mistakes: 0, ...ADD_IT_UP }), 10);
});

test('scoreForAttempt: 1 mistake => retry points', () => {
    assert.equal(lib.scoreForAttempt({ mistakes: 1, ...ADD_IT_UP }), 5);
});

test('scoreForAttempt: many mistakes still award retry points (no negative scoring)', () => {
    assert.equal(lib.scoreForAttempt({ mistakes: 7, ...ADD_IT_UP }), 5);
});

test('scoreForAttempt: works with custom point values', () => {
    assert.equal(
        lib.scoreForAttempt({ mistakes: 0, pointsFirstTry: 100, pointsRetry: 25 }),
        100
    );
    assert.equal(
        lib.scoreForAttempt({ mistakes: 3, pointsFirstTry: 100, pointsRetry: 25 }),
        25
    );
});

test('scoreForAttempt: rejects fractional mistakes', () => {
    assert.throws(
        () => lib.scoreForAttempt({ mistakes: 1.5, ...ADD_IT_UP }),
        RangeError
    );
});

test('scoreForAttempt: rejects negative mistakes', () => {
    assert.throws(
        () => lib.scoreForAttempt({ mistakes: -1, ...ADD_IT_UP }),
        RangeError
    );
});

test('scoreForAttempt: rejects NaN / Infinity in point values', () => {
    assert.throws(
        () => lib.scoreForAttempt({ mistakes: 0, pointsFirstTry: NaN, pointsRetry: 5 }),
        TypeError
    );
    assert.throws(
        () => lib.scoreForAttempt({ mistakes: 0, pointsFirstTry: Infinity, pointsRetry: 5 }),
        TypeError
    );
});

// Oracle test: simulate a 10-question round and assert the running total
// matches what add-it-up's game.js would compute.
test('scoreForAttempt: 10-round oracle matches expected totals', () => {
    const attempts = [
        { mistakes: 0 }, // 10
        { mistakes: 0 }, // 10
        { mistakes: 1 }, // 5
        { mistakes: 0 }, // 10
        { mistakes: 0 }, // 10
        { mistakes: 2 }, // 5
        { mistakes: 0 }, // 10
        { mistakes: 0 }, // 10
        { mistakes: 1 }, // 5
        { mistakes: 0 }, // 10
    ];
    const total = attempts.reduce(
        (sum, a) => sum + lib.scoreForAttempt({ ...a, ...ADD_IT_UP }),
        0
    );
    // 10*7 + 5*3 = 85
    assert.equal(total, 85);
});

test('scoreForAttempt: max possible for N questions = N * pointsFirstTry', () => {
    const N = 10;
    const total = Array.from({ length: N }, () =>
        lib.scoreForAttempt({ mistakes: 0, ...ADD_IT_UP })
    ).reduce((a, b) => a + b, 0);
    assert.equal(total, N * ADD_IT_UP.pointsFirstTry);
});
