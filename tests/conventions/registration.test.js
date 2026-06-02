const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { games } = require("./games-list.js");

const ROOT = path.resolve(__dirname, "../..");

// Parse the GAMES array out of stats/stats.js without executing the IIFE.
function loadStatsSlugs() {
    const src = fs.readFileSync(path.join(ROOT, "stats", "stats.js"), "utf8");
    const slugs = [];
    const re = /\bslug:\s*["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) slugs.push(m[1]);
    return new Set(slugs);
}

const statsSlugs = loadStatsSlugs();
const CLAUDE = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

for (const g of games) {
    if (g.hidden) continue; // hidden games are intentionally omitted from docs

    test(`${g.slug}: registered in stats/stats.js`, () => {
        assert.ok(
            statsSlugs.has(g.slug),
            `${g.slug} is missing from the GAMES array in stats/stats.js — add { slug: "${g.slug}", name: "…", emoji: "…" }`
        );
    });

    test(`${g.slug}: mentioned in CLAUDE.md`, () => {
        assert.ok(
            CLAUDE.includes(g.slug),
            `${g.slug} is not mentioned anywhere in CLAUDE.md — add it to the folder tree and games table`
        );
    });

    test(`${g.slug}: mentioned in README.md`, () => {
        assert.ok(
            README.includes(g.slug),
            `${g.slug} is not mentioned anywhere in README.md — add it to the games list and folder tree`
        );
    });
}
