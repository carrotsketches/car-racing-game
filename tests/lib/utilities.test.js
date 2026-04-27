// Gap #6 (partial): the small helpers shared across game generators
// (pattern-party, color-mixing). The full pattern/recipe generators stay in
// their game.js files (they're tightly coupled to per-game pools), but the
// utilities they call through are now testable.

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../../shared/lib.js');
const { seededRng } = require('../helpers/seeded-rng.js');

// --- pick ---
test('pick: returns an element from the array', () => {
    const got = lib.pick([1, 2, 3], () => 0);
    assert.equal(got, 1);
});

test('pick: respects rng index', () => {
    assert.equal(lib.pick(['a', 'b', 'c'], () => 0.99), 'c');
});

test('pick: returns undefined for empty array', () => {
    assert.equal(lib.pick([]), undefined);
});

test('pick: returns undefined for non-array input', () => {
    assert.equal(lib.pick(null), undefined);
    assert.equal(lib.pick(undefined), undefined);
    assert.equal(lib.pick('abc'), undefined);
});

test('pick: deterministic with seeded rng', () => {
    const rng1 = seededRng(7);
    const rng2 = seededRng(7);
    const arr = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 50; i++) {
        assert.equal(lib.pick(arr, rng1), lib.pick(arr, rng2));
    }
});

// --- pickN ---
test('pickN: returns n distinct elements', () => {
    const got = lib.pickN(['a', 'b', 'c', 'd'], 3, seededRng(1));
    assert.equal(got.length, 3);
    assert.equal(new Set(got).size, 3, 'must be distinct');
});

test('pickN: caps at array length when n > array.length', () => {
    const got = lib.pickN(['a', 'b'], 5);
    assert.equal(got.length, 2);
});

test('pickN: returns [] for n=0', () => {
    assert.deepEqual(lib.pickN(['a', 'b'], 0), []);
});

test('pickN: returns [] for non-array', () => {
    assert.deepEqual(lib.pickN(null, 3), []);
});

test('pickN: throws on negative n', () => {
    assert.throws(() => lib.pickN(['a'], -1), RangeError);
});

test('pickN: never mutates input', () => {
    const before = ['a', 'b', 'c'];
    lib.pickN(before, 2, seededRng(1));
    assert.deepEqual(before, ['a', 'b', 'c']);
});

// --- shuffle ---
test('shuffle: returns same elements as input', () => {
    const got = lib.shuffle([1, 2, 3, 4], seededRng(2));
    assert.deepEqual(got.slice().sort(), [1, 2, 3, 4]);
});

test('shuffle: deterministic with seeded rng', () => {
    const a = lib.shuffle([1, 2, 3, 4, 5], seededRng(11));
    const b = lib.shuffle([1, 2, 3, 4, 5], seededRng(11));
    assert.deepEqual(a, b);
});

test('shuffle: never mutates input', () => {
    const before = [1, 2, 3];
    lib.shuffle(before, seededRng(1));
    assert.deepEqual(before, [1, 2, 3]);
});

test('shuffle: returns [] for non-array', () => {
    assert.deepEqual(lib.shuffle(null), []);
});

test('shuffle: returns single-element clone for length-1 input', () => {
    assert.deepEqual(lib.shuffle([42]), [42]);
});

// --- findRecipe (color-mixing pair lookup) ---
const RECIPES = [
    { pair: ['red', 'yellow'], id: 'orange' },
    { pair: ['yellow', 'blue'], id: 'green' },
    { pair: ['white', 'black'], id: 'gray' },
];

test('findRecipe: matches forward pair order', () => {
    assert.equal(lib.findRecipe(RECIPES, 'red', 'yellow').id, 'orange');
});

test('findRecipe: matches reverse pair order (commutative)', () => {
    assert.equal(lib.findRecipe(RECIPES, 'yellow', 'red').id, 'orange');
});

test('findRecipe: returns undefined for unknown pair', () => {
    assert.equal(lib.findRecipe(RECIPES, 'red', 'green'), undefined);
});

test('findRecipe: returns undefined for empty / non-array recipes', () => {
    assert.equal(lib.findRecipe([], 'red', 'yellow'), undefined);
    assert.equal(lib.findRecipe(null, 'red', 'yellow'), undefined);
});

test('findRecipe: skips malformed entries', () => {
    const broken = [null, { pair: 'not-array' }, ...RECIPES];
    assert.equal(lib.findRecipe(broken, 'red', 'yellow').id, 'orange');
});
