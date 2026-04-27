const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { games } = require("./games-list.js");

const ROOT = path.resolve(__dirname, "../..");

// Games that intentionally have no sound. Keep this list short — silent games are
// the exception. Add a slug here only after a deliberate design call.
const NO_AUDIO = new Set([
    "unicorn-storyteller",
]);

for (const g of games) {
    if (NO_AUDIO.has(g.slug)) continue;

    test(`${g.slug}: uses lazy ensureAudio() (or AudioContext) per CLAUDE.md`, () => {
        const js = fs.readFileSync(path.join(ROOT, g.slug, "game.js"), "utf8");
        const usesAudio = /AudioContext|webkitAudioContext|ensureAudio\s*\(/.test(js);
        assert.ok(usesAudio,
            `${g.slug}: expected AudioContext usage — add it or list ${g.slug} in NO_AUDIO`);
    });
}
