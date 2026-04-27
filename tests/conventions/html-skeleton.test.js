const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { games } = require("./games-list.js");

const ROOT = path.resolve(__dirname, "../..");

function readGame(slug) {
    return {
        html: fs.readFileSync(path.join(ROOT, slug, "index.html"), "utf8"),
        js: fs.readFileSync(path.join(ROOT, slug, "game.js"), "utf8"),
        css: fs.readFileSync(path.join(ROOT, slug, "style.css"), "utf8"),
    };
}

for (const g of games) {
    test(`${g.slug}: has all three files (index.html, style.css, game.js)`, () => {
        for (const f of ["index.html", "style.css", "game.js"]) {
            const p = path.join(ROOT, g.slug, f);
            assert.ok(fs.existsSync(p), `missing ${g.slug}/${f}`);
        }
    });

    test(`${g.slug}: index.html declares mobile meta tags`, () => {
        const { html } = readGame(g.slug);
        assert.match(html, /<meta\s+name="viewport"\s+content="[^"]*width=device-width/i,
            "missing viewport meta");
        assert.match(html, /<meta\s+name="mobile-web-app-capable"\s+content="yes"/i,
            "missing mobile-web-app-capable");
        assert.match(html, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/i,
            "missing apple-mobile-web-app-capable");
    });

    test(`${g.slug}: nav-row contains home link + help button`, () => {
        const { html } = readGame(g.slug);
        assert.match(html, /class="nav-row"/, "missing .nav-row");
        assert.match(html, /class="home-link"/, "missing .home-link");
        assert.match(html, /href="\.\.\/?"/, "home link must point to '..' or '../'");
        assert.match(html, /id="help-btn"/, "missing #help-btn");
    });

    test(`${g.slug}: includes a #help-modal div`, () => {
        const { html } = readGame(g.slug);
        assert.match(html, /id="help-modal"/, "missing #help-modal element");
    });

    test(`${g.slug}: loads game.js relative`, () => {
        const { html } = readGame(g.slug);
        assert.match(html, /<script[^>]+src="game\.js"/);
    });

    test(`${g.slug}: game.js is wrapped in an IIFE (no globals leaked)`, () => {
        const { js } = readGame(g.slug);
        // The IIFE skeleton in CLAUDE.md uses `(() => { ... })();`. Allow either form.
        const trimmed = js.trim();
        const isIife = /^\(\s*\(\s*\)\s*=>\s*\{/.test(trimmed)
            || /^\(\s*function\s*\(/.test(trimmed);
        assert.ok(isIife, `${g.slug}/game.js does not start with an IIFE wrapper`);
    });
}
