import { useRef, useEffect } from 'react';

const CW = 14;
const CH = 16;
const FS = 14;
const WAVE_TRAVEL_TIME = 1.05; // top -> bottom (uprush)
const RUNUP_PEAK = 0.9; // max reach before receding (stays just short of bottom edge)

const WAVE_TIMINGS = [
    1.855, 5.158, 8.974, 12.22, 15.955, 20.503, 24.874, 28.433, 32.374, 36.015,
    39.481, 42.678, 45.202, 48.63, 51.576, 55.729, 60.12, 64.724, 69.339, 73.73,
    78.077, 82.113, 85.959, 89.781, 93.323, 97.152, 101.269, 105.023, 109.133, 113.706,
    118.479, 123.089, 127.568, 131.34, 135.694, 139.723, 143.689, 147.63, 151.065, 155.461,
    159.852, 164.481, 169.196, 173.794, 177.835, 182.081, 185.734, 189.506, 193.204, 196.532,
    200.324, 204.473, 208.421, 212.599, 217.146, 221.319, 225.498, 229.571, 233.43, 237.033,
    240.561, 244.177, 247.967, 252.165, 256.594, 261.336, 265.976, 270.523, 275.213, 279.467,
    283.095, 286.149, 289.859, 293.501, 297.223, 301.688, 306.361, 310.732, 315.135, 319.527,
    323.037, 326.341, 329.108, 331.923, 334.833, 338.66, 342.669, 347.053, 351.669, 356.411,
    360.889, 365.124, 369.635, 373.957, 377.199, 379.765, 382.862, 386.677, 390.174, 394.646,
    399.018, 403.576, 407.406, 411.64, 416.175, 419.872, 423.082, 426.947, 430.456, 433.303,
    436.007, 439.455, 443.646, 447.769, 452.134, 456.462, 460.521, 464.593, 467.991, 471.189,
    474.187, 477.679, 481.745, 486.029, 490.338,
];

function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

// --- Value noise / fBm for organic foam turbulence ---
function vhash(x, y) {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
}
function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = vhash(xi, yi);
    const b = vhash(xi + 1, yi);
    const c = vhash(xi, yi + 1);
    const d = vhash(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y) {
    return (
        vnoise(x, y) * 0.5 +
        vnoise(x * 2.03, y * 2.03) * 0.25 +
        vnoise(x * 4.01, y * 4.01) * 0.125 +
        vnoise(x * 8.0, y * 8.0) * 0.0625
    );
}

function cellHash(col, row, seed) {
    let h = ((col * 374761393 + row * 668265263 + seed * 2654435761) | 0);
    h = (h ^ (h >>> 13)) | 0;
    h = (Math.imul(h, 1274126177)) | 0;
    return ((h >>> 0) & 0xffff) / 0xffff;
}

// Foam density at a point for one wave.
// crest = leading-edge y position (0 top / ocean .. 1 bottom / shore)
// The wake always trails toward the ocean (above the crest) so the foam
// stays one continuous sheet whether the wave is advancing or receding.
// morph: 0 while advancing, grows 0 -> 1 while receding. Distorts the crest
// so the wave breaks up instead of returning in its exact shape.
function foamDensity(nx, ny, crest, strength, waveIdx, t, morph) {
    // Irregular, curving crest line — wobble amplitude grows as it recedes
    const wobAmp = 0.03 * (1 + morph * 2.2);
    const wob = (
        Math.sin(nx * 5.0 + waveIdx * 1.3) * 0.5 +
        Math.sin(nx * 11.0 + waveIdx * 2.1) * 0.3 +
        Math.sin(nx * 23.0 + waveIdx * 4.7) * 0.2
    ) * wobAmp;

    // Extra jagged, noisy breakup of the edge that only appears when receding
    const breakup = (fbm(nx * 9.0 + waveIdx * 3.0, t * 0.5) - 0.5) * morph * 0.14;

    const edge = crest + wob + breakup;

    // Distance into the wet wake (ocean side / above the crest)
    const d = edge - ny;

    const L = 0.80 * (1 + morph * 0.25); // wake widens/sprawls when receding
    if (d < -0.015 || d > L) return 0;

    // Overall sheet envelope: dense at crest, thinning into the wake
    const body = smoothstep(L, 0.0, d);

    // Turbulence advected with the crest position (continuous across reversal)
    const adv = -crest * 5.0;
    const turb = fbm(nx * 7.0 + waveIdx * 10.0, ny * 9.0 + adv + t * 0.6);

    // Bright foam line at the leading edge — dissolves as the wave recedes
    const crestBand = Math.exp(-(d * d) / (2 * 0.045 * 0.045));
    const crestFoam = crestBand * (0.45 + 0.6 * fbm(nx * 13.0 + waveIdx * 7.0, ny * 13.0 + adv)) * (1 - morph * 0.7);

    // Foam patches — base density fills the body, turbulence adds variation.
    // Gets patchier/sparser (more broken) as the wave recedes.
    const base = 0.35 * (1 - morph * 0.4);
    const foam = body * (base + (1 - base) * smoothstep(0.28 + morph * 0.18, 0.70, turb));

    const dens = (foam + crestFoam) * strength;
    return dens > 1 ? 1 : dens;
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1).padStart(4, '0');
    return `${m}:${sec}`;
}

export default function BinaryWave() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let raf;
        const t0 = performance.now();
        let grid = null;
        let cols = 0, rows = 0;
        let cssW = 0, cssH = 0; // logical (CSS pixel) dimensions

        function buildGrid(c, r) {
            const g = [];
            for (let row = 0; row < r; row++) {
                g[row] = [];
                for (let col = 0; col < c; col++) {
                    g[row][col] = {
                        char: cellHash(col, row, 0) < 0.5 ? '0' : '1',
                        thr: 0.25 + cellHash(col, row, 1) * 0.55,
                        // sparse cells that draw 0 AND 1 overlapped -> bright foam sparkle
                        sparkle: cellHash(col, row, 2) < 0.18,
                    };
                }
            }
            return g;
        }

        function resize() {
            // Render at full device-pixel resolution for crisp text on any display
            const dpr = window.devicePixelRatio || 1;
            cssW = window.innerWidth;
            cssH = window.innerHeight;
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
            // Draw in CSS-pixel coordinates; the transform scales up to device pixels
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            cols = Math.ceil(cssW / CW) + 1;
            rows = Math.ceil(cssH / CH) + 1;
            grid = buildGrid(cols, rows);
        }
        resize();
        window.addEventListener('resize', resize);

        function render() {
            const t = (performance.now() - t0) / 1000;

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, cssW, cssH);

            if (!grid) { raf = requestAnimationFrame(render); return; }

            const aspect = cssW / cssH;

            // Build the set of currently-visible waves with natural motion
            const activeWaves = [];
            for (let i = 0; i < WAVE_TIMINGS.length; i++) {
                const elapsed = t - WAVE_TIMINGS[i];
                if (elapsed < 0) continue;

                if (elapsed <= WAVE_TRAVEL_TIME) {
                    // Uprush: top -> run-up peak, decelerating (easeOut)
                    const u = elapsed / WAVE_TRAVEL_TIME;
                    const front = RUNUP_PEAK * (1 - (1 - u) * (1 - u));
                    activeWaves.push({ crest: front, receding: false, strength: 1.0, morph: 0, idx: i });
                } else {
                    // Backwash: run-up peak -> top, accelerating (easeIn) and fading
                    const nextWt = i + 1 < WAVE_TIMINGS.length
                        ? WAVE_TIMINGS[i + 1]
                        : WAVE_TIMINGS[i] + WAVE_TRAVEL_TIME + 3.0;
                    let recedeDur = nextWt - WAVE_TIMINGS[i] - WAVE_TRAVEL_TIME;
                    recedeDur = Math.max(0.4, Math.min(3.0, recedeDur));
                    const r = (elapsed - WAVE_TRAVEL_TIME) / recedeDur;
                    if (r >= 1) continue;
                    const front = RUNUP_PEAK * (1 - r * r); // retreat upward from peak, speeding up
                    const strength = 1 - r * r;             // dissipate, continuous from 1.0 at peak
                    activeWaves.push({ crest: front, receding: true, strength, morph: r, idx: i });
                }
            }

            if (activeWaves.length > 0) {
                ctx.font = `${FS}px "Courier New", monospace`;
                ctx.textBaseline = 'top';
                ctx.textAlign = 'left';
                ctx.fillStyle = '#fff';

                for (let r = 0; r < rows; r++) {
                    const ny = r / rows;
                    for (let c = 0; c < cols; c++) {
                        const nx = (c / cols - 0.5) * aspect;
                        let maxF = 0;
                        for (const w of activeWaves) {
                            const f = foamDensity(nx, ny, w.crest, w.strength, w.idx, t, w.morph);
                            if (f > maxF) maxF = f;
                        }
                        const cell = grid[r][c];
                        if (maxF > cell.thr) {
                            const x = c * CW, y = r * CH;
                            // bright foam sparkle: overlap 0 and 1 where foam is dense
                            if (cell.sparkle && maxF > 0.5) {
                                ctx.fillText('0', x, y);
                                ctx.fillText('1', x, y);
                            } else {
                                ctx.fillText(cell.char, x, y);
                            }
                        }
                    }
                }
            }

            // Timer overlay (top-right) — for timing verification
            const labels = activeWaves.map(w => `#${w.idx + 1}${w.receding ? '↑' : '↓'}`).join(' ');
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.font = '13px monospace';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'right';
            ctx.fillText(`${formatTime(t)}  ${labels}`, cssW - 16, 14);

            raf = requestAnimationFrame(render);
        }

        render();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100vw', height: '100vh' }}
        />
    );
}
