// Shared jsdom helper for tests that need to load a game's HTML + scripts.
// Returns `{ window, document, errors, dom }` where `errors` is a captured
// `console.error` log (push-only). Canvas 2D and AudioContext are stubbed so
// game.js init code doesn't throw on load.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function makeMockCanvasContext() {
    const noop = () => {};
    return {
        // State
        canvas: { width: 800, height: 600 },
        // Drawing rectangles
        fillRect: noop, clearRect: noop, strokeRect: noop,
        // Image data
        getImageData: () => ({ data: new Uint8ClampedArray() }),
        putImageData: noop, createImageData: () => [], drawImage: noop,
        // Transforms
        setTransform: noop, transform: noop, resetTransform: noop,
        save: noop, restore: noop,
        translate: noop, scale: noop, rotate: noop,
        // Text
        fillText: noop, strokeText: noop,
        measureText: () => ({ width: 0 }),
        // Paths
        beginPath: noop, closePath: noop,
        moveTo: noop, lineTo: noop,
        bezierCurveTo: noop, quadraticCurveTo: noop,
        arc: noop, arcTo: noop, ellipse: noop,
        rect: noop, roundRect: noop,
        stroke: noop, fill: noop, clip: noop,
        isPointInPath: () => false, isPointInStroke: () => false,
        // Line / shadow
        setLineDash: noop, getLineDash: () => [],
        // Gradients
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createConicGradient: () => ({ addColorStop: noop }),
        createPattern: () => ({ setTransform: noop }),
    };
}

function makeAudioParam(value) {
    const noop = () => {};
    return {
        value,
        setValueAtTime: noop,
        linearRampToValueAtTime: noop,
        exponentialRampToValueAtTime: noop,
        setTargetAtTime: noop,
        setValueCurveAtTime: noop,
        cancelScheduledValues: noop,
        cancelAndHoldAtTime: noop,
    };
}

class MockAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() {
        return { gain: makeAudioParam(1), connect: (dest) => dest, disconnect: () => {} };
    }
    createOscillator() {
        return {
            frequency: makeAudioParam(440),
            detune: makeAudioParam(0),
            type: 'sine',
            connect: (dest) => dest,
            disconnect: () => {},
            start: () => {},
            stop: () => {},
            addEventListener: () => {},
        };
    }
    createBufferSource() {
        return {
            buffer: null,
            playbackRate: makeAudioParam(1),
            connect: (dest) => dest,
            disconnect: () => {},
            start: () => {},
            stop: () => {},
        };
    }
    createBiquadFilter() {
        return {
            type: 'lowpass',
            frequency: makeAudioParam(350),
            Q: makeAudioParam(1),
            gain: makeAudioParam(0),
            detune: makeAudioParam(0),
            connect: (dest) => dest,
            disconnect: () => {},
        };
    }
    createBuffer() { return { getChannelData: () => new Float32Array(0) }; }
    createStereoPanner() {
        return { pan: makeAudioParam(0), connect: (dest) => dest, disconnect: () => {} };
    }
    get destination() { return { connect: () => {} }; }
}

export async function loadGame(slug, { settleMs = 100, baseDir = '.' } = {}) {
    const dir = resolve(baseDir, slug);
    const htmlPath = resolve(dir, 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');

    const dom = new JSDOM(html, {
        // jsdom only allows localStorage for http(s):// origins; using file://
        // throws "SecurityError" inside game.js. Use a localhost URL instead.
        url: `http://localhost/${slug}/`,
        pretendToBeVisual: true,
        // Without this, inline <script> elements (including the ones we synthesise
        // below) are parsed but never executed — game.js wouldn't actually run
        // and tests would silently pass on broken games.
        runScripts: 'dangerously',
        beforeParse(window) {
            window.HTMLCanvasElement.prototype.getContext = () => makeMockCanvasContext();
            window.AudioContext = MockAudioContext;
            window.webkitAudioContext = MockAudioContext;
            // jsdom doesn't ship matchMedia; some games query prefers-reduced-motion etc.
            window.matchMedia = () => ({
                matches: false,
                media: '',
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
            });
        },
    });

    const { window } = dom;
    const { document } = window;

    const errors = [];
    const originalError = window.console.error;
    window.console.error = (...args) => {
        errors.push(args.join(' '));
        originalError.apply(window.console, args);
    };
    // jsdom routes uncaught script errors here, not to console.error. Without
    // this hook, smoke tests would silently pass even when game.js threw.
    dom.virtualConsole.on('jsdomError', (e) => {
        errors.push(`jsdom: ${e.message}`);
    });

    // Inline relative <script src=…> content so jsdom executes it synchronously.
    for (const script of Array.from(document.querySelectorAll('script[src]'))) {
        const src = script.getAttribute('src');
        if (src && !src.startsWith('http')) {
            const scriptPath = resolve(dir, src);
            try {
                const content = readFileSync(scriptPath, 'utf-8');
                const inline = document.createElement('script');
                inline.textContent = content;
                script.replaceWith(inline);
            } catch (_) {
                // Script file not found, skip
            }
        }
    }

    if (settleMs > 0) {
        await new Promise((r) => setTimeout(r, settleMs));
    }
    // Callers MUST invoke close() (or pass a `t.after`-bound test context that
    // calls it) — otherwise requestAnimationFrame loops in game.js keep ticking
    // and the node test runner never exits.
    return {
        window,
        document,
        errors,
        dom,
        close: () => { try { window.close(); } catch (_) {} },
    };
}
