// Gap #7: stats/ page renders game + player tables from games-plays-v1
// localStorage. Tests cover: populated state, empty state, malformed JSON,
// per-row sort order, missing slug fallback, HTML escaping of player names.

import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KEY = 'games-plays-v1';
const HTML = readFileSync(resolve('stats/index.html'), 'utf-8');
const SCRIPT = readFileSync(resolve('stats/stats.js'), 'utf-8');

async function loadStats(initialStore) {
    const dom = new JSDOM(HTML, {
        url: 'http://localhost/stats/',
        runScripts: 'dangerously',
    });
    const { window } = dom;
    if (initialStore !== null) {
        window.localStorage.setItem(KEY, JSON.stringify(initialStore));
    }
    // Inline the stats script (the <script src="stats.js"> in HTML is unresolvable
    // at file:// origin under runScripts:'dangerously').
    const document = window.document;
    for (const script of Array.from(document.querySelectorAll('script[src]'))) {
        const inline = document.createElement('script');
        inline.textContent = SCRIPT;
        script.replaceWith(inline);
    }
    return { window, document, close: () => dom.window.close() };
}

test('stats: empty store shows empty notes and hides tables', async (t) => {
    const { document, close } = await loadStats({});
    t.after(close);

    assert.equal(document.getElementById('games-table').hidden, true);
    assert.equal(document.getElementById('games-empty').hidden, false);
    assert.equal(document.getElementById('players-table').hidden, true);
    assert.equal(document.getElementById('players-empty').hidden, false);
});

test('stats: missing localStorage key is treated as empty', async (t) => {
    const { document, close } = await loadStats(null);
    t.after(close);
    assert.equal(document.getElementById('games-empty').hidden, false);
});

test('stats: malformed JSON falls back to empty', async (t) => {
    const dom = new JSDOM(HTML, {
        url: 'http://localhost/stats/',
        runScripts: 'dangerously',
    });
    t.after(() => dom.window.close());
    dom.window.localStorage.setItem(KEY, '{not json');
    const inline = dom.window.document.createElement('script');
    inline.textContent = SCRIPT;
    dom.window.document.querySelector('script[src]').replaceWith(inline);
    assert.equal(dom.window.document.getElementById('games-empty').hidden, false);
});

test('stats: populates games table sorted by plays desc', async (t) => {
    const { document, close } = await loadStats({
        games: {
            'piano': { plays: 3 },
            'highway-dash': { plays: 5 },
            'add-it-up': { plays: 1 },
        },
        players: {},
    });
    t.after(close);

    const rows = document.querySelectorAll('#games-table tbody tr');
    assert.equal(rows.length, 3);
    // First row should be highway-dash (5 plays)
    assert.match(rows[0].textContent, /Highway Dash/);
    assert.match(rows[0].textContent, /5/);
    assert.match(rows[1].textContent, /Piano Memory/);
    assert.match(rows[2].textContent, /Add It Up/);
});

test('stats: filters out games with 0 plays', async (t) => {
    const { document, close } = await loadStats({
        games: { 'piano': { plays: 0 }, 'highway-dash': { plays: 2 } },
        players: {},
    });
    t.after(close);

    const rows = document.querySelectorAll('#games-table tbody tr');
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent, /Highway Dash/);
});

test('stats: unknown slug gets a humanised fallback name', async (t) => {
    const { document, close } = await loadStats({
        games: { 'mystery-game-xyz': { plays: 4 } },
        players: {},
    });
    t.after(close);

    const rows = document.querySelectorAll('#games-table tbody tr');
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent, /Mystery Game Xyz/);
});

test('stats: populates players table sorted by games then plays', async (t) => {
    const { document, close } = await loadStats({
        games: {},
        players: {
            'Alice': { plays: 10, games: { 'piano': 5, 'highway-dash': 5 } },
            'Bob':   { plays: 20, games: { 'piano': 20 } },
            'Carol': { plays: 8,  games: { 'piano': 4, 'highway-dash': 2, 'maze-game': 2 } },
        },
    });
    t.after(close);

    const rows = document.querySelectorAll('#players-table tbody tr');
    assert.equal(rows.length, 3);
    // Carol has 3 games (most), Alice 2, Bob 1.
    assert.match(rows[0].textContent, /Carol/);
    assert.match(rows[1].textContent, /Alice/);
    assert.match(rows[2].textContent, /Bob/);
});

test('stats: empty player name renders as "Anonymous"', async (t) => {
    const { document, close } = await loadStats({
        games: {},
        players: { '': { plays: 3, games: { 'piano': 3 } } },
    });
    t.after(close);

    const row = document.querySelector('#players-table tbody tr');
    assert.match(row.textContent, /Anonymous/);
});

test('stats: HTML-escapes player names to prevent XSS', async (t) => {
    const { document, close } = await loadStats({
        games: {},
        players: { '<img src=x onerror=alert(1)>': { plays: 2, games: { 'piano': 2 } } },
    });
    t.after(close);

    const row = document.querySelector('#players-table tbody tr');
    // Should not have rendered an actual <img>.
    assert.equal(row.querySelector('img'), null);
    // The name text should appear escaped.
    assert.match(row.innerHTML, /&lt;img/);
});
