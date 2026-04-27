// Gap #3: shared/play-tracker.js is the 32-line IIFE that the home page and
// every game can include via:
//   <script src="../shared/play-tracker.js" data-slug="<slug>"></script>
//
// The pure recordPlay() logic is tested in play-tracker.test.js; this file
// covers the IIFE wiring (data-slug discovery, localStorage roundtrip).

import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCRIPT = readFileSync(resolve('shared/play-tracker.js'), 'utf-8');
const KEY = 'games-plays-v1';
const NAME_KEY = 'highway-dash-last-name';

function load({ slug, prevName, prevStore }) {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body></body></html>`,
        {
            url: 'http://localhost/',
            runScripts: 'dangerously',
        }
    );
    const { window } = dom;
    const { document } = window;
    if (prevName !== undefined) window.localStorage.setItem(NAME_KEY, prevName);
    if (prevStore !== undefined) window.localStorage.setItem(KEY, JSON.stringify(prevStore));
    const s = document.createElement('script');
    if (slug !== undefined) s.dataset.slug = slug;
    s.textContent = SCRIPT;
    document.body.appendChild(s);
    const stored = window.localStorage.getItem(KEY);
    return { dom, store: stored ? JSON.parse(stored) : null };
}

test('play-tracker IIFE: increments game + player counts on first run', (t) => {
    const { dom, store } = load({ slug: 'piano', prevName: 'Alice' });
    t.after(() => dom.window.close());
    assert.equal(store.games['piano'].plays, 1);
    assert.equal(store.players['Alice'].plays, 1);
    assert.equal(store.players['Alice'].games['piano'], 1);
});

test('play-tracker IIFE: accumulates across multiple loads', (t) => {
    let { dom, store } = load({ slug: 'piano', prevName: 'Bob' });
    t.after(() => dom.window.close());
    ({ dom, store } = load({ slug: 'piano', prevName: 'Bob', prevStore: store }));
    t.after(() => dom.window.close());
    ({ dom, store } = load({ slug: 'highway-dash', prevName: 'Bob', prevStore: store }));
    t.after(() => dom.window.close());

    assert.equal(store.games['piano'].plays, 2);
    assert.equal(store.games['highway-dash'].plays, 1);
    assert.equal(store.players['Bob'].plays, 3);
    assert.equal(store.players['Bob'].games['piano'], 2);
    assert.equal(store.players['Bob'].games['highway-dash'], 1);
});

test('play-tracker IIFE: defaults missing player name to "Anonymous"', (t) => {
    const { dom, store } = load({ slug: 'piano' }); // no prevName
    t.after(() => dom.window.close());
    assert.equal(store.players['Anonymous'].plays, 1);
});

test('play-tracker IIFE: empty / whitespace name also becomes "Anonymous"', (t) => {
    const { dom, store } = load({ slug: 'piano', prevName: '   ' });
    t.after(() => dom.window.close());
    assert.equal(store.players['Anonymous'].plays, 1);
});

test('play-tracker IIFE: no slug => no localStorage write', (t) => {
    const { dom, store } = load({ slug: undefined, prevName: 'Alice' });
    t.after(() => dom.window.close());
    assert.equal(store, null, 'store should be untouched when data-slug missing');
});

test('play-tracker IIFE: tolerates malformed prior store', (t) => {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body></body></html>`,
        { url: 'http://localhost/', runScripts: 'dangerously' }
    );
    t.after(() => dom.window.close());
    const { window } = dom;
    const { document } = window;
    window.localStorage.setItem(KEY, '{not json');
    window.localStorage.setItem(NAME_KEY, 'Alice');
    const s = document.createElement('script');
    s.dataset.slug = 'piano';
    s.textContent = SCRIPT;
    document.body.appendChild(s);
    const store = JSON.parse(window.localStorage.getItem(KEY));
    assert.equal(store.games['piano'].plays, 1);
    assert.equal(store.players['Alice'].plays, 1);
});

test('play-tracker IIFE: preserves unrelated store keys', (t) => {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body></body></html>`,
        { url: 'http://localhost/', runScripts: 'dangerously' }
    );
    t.after(() => dom.window.close());
    const { window } = dom;
    const { document } = window;
    window.localStorage.setItem('unrelated-key', 'whatever');
    const s = document.createElement('script');
    s.dataset.slug = 'piano';
    s.textContent = SCRIPT;
    document.body.appendChild(s);
    assert.equal(window.localStorage.getItem('unrelated-key'), 'whatever');
});
