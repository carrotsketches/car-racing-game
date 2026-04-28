// Gap #2 from TRACEABILITY: every game's #help-btn opens the modal,
// #help-close closes it, the backdrop dismisses it, and Escape dismisses it.
//
// The pattern in every game.js is identical (see CLAUDE.md):
//   btn.click  → modal.removeAttribute('hidden')
//   close.click→ modal.setAttribute('hidden', '')
//   modal.click(on backdrop) → close
//   keydown Escape → close

import { test } from 'node:test';
import assert from 'node:assert';
import { loadGame } from '../helpers/load-game.js';
import { games } from '../conventions/games-list.js';

games.forEach(({ slug }) => {
    test(`${slug}: help modal opens via #help-btn and closes via #help-close`, async (t) => {
        const { window, document, close } = await loadGame(slug);
        t.after(close);

        const btn = document.getElementById('help-btn');
        const modal = document.getElementById('help-modal');
        const closeBtn = document.getElementById('help-close');

        assert.ok(btn, `${slug}: #help-btn missing`);
        assert.ok(modal, `${slug}: #help-modal missing`);
        assert.ok(closeBtn, `${slug}: #help-close missing`);
        assert.ok(modal.hasAttribute('hidden'), `${slug}: modal must start hidden`);

        btn.click();
        assert.ok(!modal.hasAttribute('hidden'),
            `${slug}: modal didn't open after #help-btn click`);

        closeBtn.click();
        assert.ok(modal.hasAttribute('hidden'),
            `${slug}: modal didn't close after #help-close click`);

        btn.click();
        assert.ok(!modal.hasAttribute('hidden'), `${slug}: modal didn't reopen`);

        const evt = new window.KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(evt);
        assert.ok(modal.hasAttribute('hidden'),
            `${slug}: modal didn't close on Escape`);
    });

    test(`${slug}: help modal closes when clicking the backdrop`, async (t) => {
        const { window, document, close } = await loadGame(slug);
        t.after(close);

        const btn = document.getElementById('help-btn');
        const modal = document.getElementById('help-modal');
        if (!btn || !modal) return;

        btn.click();
        assert.ok(!modal.hasAttribute('hidden'));

        const evt = new window.MouseEvent('click', { bubbles: true, cancelable: true });
        modal.dispatchEvent(evt);
        assert.ok(modal.hasAttribute('hidden'),
            `${slug}: modal didn't close on backdrop click`);
    });
});
