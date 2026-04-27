import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { games } from '../conventions/games-list.js';

// Mock canvas and audio globally for jsdom
const mockCanvas = () => {
  return {
    getContext: () => ({
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray() }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
      createLinearGradient: () => ({
        addColorStop: () => {},
      }),
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
};

const mockAudioContext = class {
  constructor() {
    this.state = 'running';
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
  }
  createOscillator() {
    return {
      frequency: { value: 440 },
      type: 'sine',
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  get destination() {
    return { connect: () => {} };
  }
};

// Per-game smoke test
games.forEach(({ slug }) => {
  test(`${slug}: loads without console errors and start-btn fires`, async () => {
    const htmlPath = resolve(slug, 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');

    // Create JSDOM with mocked canvas and audio
    const dom = new JSDOM(html, {
      url: `file://${resolve(slug)}/index.html`,
      pretendToBeVisual: true,
      beforeParse(window) {
        window.HTMLCanvasElement.prototype.getContext = () => mockCanvas().getContext();
        window.AudioContext = mockAudioContext;
        window.webkitAudioContext = mockAudioContext;
        window.localStorage = {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
        };
        window.fetch = () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(''),
          });
      },
    });

    const { window } = dom;
    const { document, console: windowConsole } = window;

    // Capture console errors
    const errors = [];
    const originalError = windowConsole.error;
    windowConsole.error = (...args) => {
      errors.push(args.join(' '));
      originalError.apply(windowConsole, args);
    };

    // Resolve relative script paths to file:// URLs
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src && !src.startsWith('http')) {
        const resolvedPath = resolve(slug, src);
        try {
          const scriptContent = readFileSync(resolvedPath, 'utf-8');
          const newScript = document.createElement('script');
          newScript.textContent = scriptContent;
          script.replaceWith(newScript);
        } catch (e) {
          // Script file not found, skip
        }
      }
    }

    // Allow async scripts to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert no console errors occurred
    assert.equal(
      errors.length,
      0,
      `${slug}: console.error called with: ${errors.join(', ')}`
    );

    // Fire start button click
    const startBtn = document.querySelector('#start-btn');
    assert.ok(startBtn, `${slug}: #start-btn not found`);
    startBtn.click();

    // Allow click handlers to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert still no console errors after click
    assert.equal(
      errors.length,
      0,
      `${slug}: console.error after start-btn click: ${errors.join(', ')}`
    );
  });
});
