// Gap #5: per-name config picker (used by highway-dash for car colours).
// Pure function — no localStorage dependency, takes the configs map directly.

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../../shared/lib.js');

const DEFAULT_CAR = { body: '#f5c451', roof: '#1b2735', wheels: '#111111' };

test('pickConfigFor: returns defaults clone when name is empty', () => {
    const got = lib.pickConfigFor({ name: '', configs: {}, defaults: DEFAULT_CAR });
    assert.deepEqual(got, DEFAULT_CAR);
    assert.notEqual(got, DEFAULT_CAR, 'must return a fresh object');
});

test('pickConfigFor: returns defaults clone when name unknown', () => {
    const got = lib.pickConfigFor({
        name: 'Alice',
        configs: { bob: { body: '#fff' } },
        defaults: DEFAULT_CAR,
    });
    assert.deepEqual(got, DEFAULT_CAR);
});

test('pickConfigFor: name lookup is case-insensitive', () => {
    const got = lib.pickConfigFor({
        name: 'ALICE',
        configs: { alice: { body: '#abc' } },
        defaults: DEFAULT_CAR,
    });
    assert.equal(got.body, '#abc');
});

test('pickConfigFor: trims whitespace before lookup', () => {
    const got = lib.pickConfigFor({
        name: '  Alice  ',
        configs: { alice: { body: '#abc' } },
        defaults: DEFAULT_CAR,
    });
    assert.equal(got.body, '#abc');
});

test('pickConfigFor: merged config overrides defaults but keeps unspecified fields', () => {
    const got = lib.pickConfigFor({
        name: 'alice',
        configs: { alice: { body: '#abc' } }, // only body is overridden
        defaults: DEFAULT_CAR,
    });
    assert.equal(got.body, '#abc');
    assert.equal(got.roof, DEFAULT_CAR.roof);
    assert.equal(got.wheels, DEFAULT_CAR.wheels);
});

test('pickConfigFor: tolerates null/undefined configs', () => {
    assert.deepEqual(
        lib.pickConfigFor({ name: 'a', configs: null, defaults: DEFAULT_CAR }),
        DEFAULT_CAR
    );
    assert.deepEqual(
        lib.pickConfigFor({ name: 'a', configs: undefined, defaults: DEFAULT_CAR }),
        DEFAULT_CAR
    );
});

test('pickConfigFor: tolerates non-object configs entry', () => {
    const got = lib.pickConfigFor({
        name: 'a',
        configs: { a: 'junk' },
        defaults: DEFAULT_CAR,
    });
    assert.deepEqual(got, DEFAULT_CAR);
});

test('pickConfigFor: throws on missing defaults', () => {
    assert.throws(
        () => lib.pickConfigFor({ name: 'a', configs: {} }),
        TypeError
    );
});

test('pickConfigFor: result is detached from configs (mutation safe)', () => {
    const configs = { alice: { body: '#abc' } };
    const got = lib.pickConfigFor({ name: 'alice', configs, defaults: DEFAULT_CAR });
    got.body = '#mutated';
    assert.equal(configs.alice.body, '#abc', 'caller mutation must not leak');
});

test('setConfigFor: stores under lowercased name', () => {
    const next = lib.setConfigFor({
        name: 'Alice',
        value: { body: '#abc' },
        configs: {},
    });
    assert.deepEqual(next, { alice: { body: '#abc' } });
});

test('setConfigFor: returns configs unchanged when name empty', () => {
    const before = { bob: { body: '#fff' } };
    const next = lib.setConfigFor({ name: '', value: { body: '#abc' }, configs: before });
    assert.deepEqual(next, before);
});

test('setConfigFor: does not mutate caller configs', () => {
    const before = { bob: { body: '#fff' } };
    const next = lib.setConfigFor({
        name: 'Alice',
        value: { body: '#abc' },
        configs: before,
    });
    assert.deepEqual(before, { bob: { body: '#fff' } }, 'before should be untouched');
    assert.equal(next.alice.body, '#abc');
});

test('setConfigFor: bootstraps from null/undefined configs', () => {
    assert.deepEqual(
        lib.setConfigFor({ name: 'a', value: { body: '#abc' }, configs: null }),
        { a: { body: '#abc' } }
    );
});
