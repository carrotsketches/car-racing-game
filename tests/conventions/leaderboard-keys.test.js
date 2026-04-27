const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { games } = require("./games-list.js");

const ROOT = path.resolve(__dirname, "../..");
const HOME = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

for (const g of games) {
    if (!g.hasLeaderboard) continue;

    test(`${g.slug}: declares LB_KEY = "${g.lbKey}"`, () => {
        const js = fs.readFileSync(path.join(ROOT, g.slug, "game.js"), "utf8");
        const m = js.match(/LB_KEY\s*=\s*"([^"]+)"/);
        assert.ok(m, `${g.slug}/game.js: no LB_KEY declaration found`);
        assert.equal(m[1], g.lbKey,
            `${g.slug}/game.js LB_KEY drifted — home page card and other code may not find scores`);
    });

    test(`${g.slug}: shares NAME_KEY = "highway-dash-last-name"`, () => {
        const js = fs.readFileSync(path.join(ROOT, g.slug, "game.js"), "utf8");
        // Either the literal string anywhere, or NAME_KEY = "...".
        assert.match(js, /"highway-dash-last-name"/,
            `${g.slug}: must use the shared NAME_KEY so player name persists across games`);
    });

    test(`${g.slug}: caps leaderboard via LB_MAX (slice(0, LB_MAX))`, () => {
        const js = fs.readFileSync(path.join(ROOT, g.slug, "game.js"), "utf8");
        assert.match(js, /LB_MAX\s*=\s*\d+/, `${g.slug}: missing LB_MAX constant`);
        assert.match(js, /\.slice\(\s*0\s*,\s*LB_MAX\s*\)/,
            `${g.slug}: leaderboard never capped — will grow unbounded`);
    });
}

test("home page: every non-hidden game card links to its slug", () => {
    for (const g of games) {
        if (g.hidden || g.hardOnly) continue;
        const re = new RegExp(`href="${g.slug}/"`);
        assert.match(HOME, re, `home page is missing card for ${g.slug}`);
    }
});

test("home page: hidden games are NOT linked from index.html", () => {
    for (const g of games) {
        if (!g.hidden) continue;
        const re = new RegExp(`href="${g.slug}/"`);
        assert.doesNotMatch(HOME, re, `hidden game ${g.slug} is unexpectedly linked from home`);
    }
});

test("home page: cards with data-lb point to a real LB_KEY", () => {
    const re = /data-lb="([^"]+)"/g;
    const declared = new Set(games.filter((g) => g.hasLeaderboard).map((g) => g.lbKey));
    let m;
    while ((m = re.exec(HOME))) {
        assert.ok(declared.has(m[1]),
            `home page references data-lb="${m[1]}" but no game declares that LB_KEY`);
    }
});
