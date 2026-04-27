import { test } from 'node:test';
import assert from 'node:assert';
import { loadGame } from '../helpers/load-game.js';
import { games } from '../conventions/games-list.js';

games.forEach(({ slug }) => {
    test(`${slug}: loads without console errors and start-btn fires`, async (t) => {
        const { document, errors, close } = await loadGame(slug);
        t.after(close);

        assert.equal(
            errors.length,
            0,
            `${slug}: console.error called with: ${errors.join(', ')}`
        );

        // Some games (e.g. clock-it) run without a start overlay; loading
        // cleanly is enough for them.
        const startBtn = document.querySelector('#start-btn');
        if (startBtn) {
            startBtn.click();
            await new Promise((r) => setTimeout(r, 50));
            assert.equal(
                errors.length,
                0,
                `${slug}: console.error after start-btn click: ${errors.join(', ')}`
            );
        }
    });
});
