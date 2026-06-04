import { useRef, useEffect } from 'react';

const CW = 9;
const CH = 10;
const FS = 9;
const WAVE_TRAVEL_TIME = 1.05;

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

function cellHash(col, row, seed) {
    let h = ((col * 374761393 + row * 668265263 + seed * 2654435761) | 0);
    h = (h ^ (h >>> 13)) | 0;
    h = (Math.imul(h, 1274126177)) | 0;
    return ((h >>> 0) & 0xffff) / 0xffff;
}

const WAVE_SPEED = 0.12;

function waveIntensity(nx, ny, wavePos, waveIdx, t) {
    // Per-wave phase offset for visual variety between waves
    const xOff = waveIdx * 1.618;

    // Temporal animation at same speed as old code (0.12 units/sec)
    // Pattern is centered on wavePos spatially
    const flow = -(ny - wavePos) + t * WAVE_SPEED + xOff;

    const xWarp = (
        Math.sin(nx * 4.0 + flow * 2.1 + xOff) * 0.5 +
        Math.sin(nx * 9.7 + flow * 3.8 + xOff * 0.7) * 0.3 +
        Math.sin(nx * 19.1 + flow * 7.3 + xOff * 0.3) * 0.2
    ) * 0.15;

    const w1 = Math.sin(flow * Math.PI * 2.0 + xWarp * Math.PI * 2.0) * 0.5 + 0.5;
    const w2 = Math.sin(flow * Math.PI * 2.0 * 2.3 + xWarp * Math.PI * 3.0 + 1.0) * 0.3 + 0.5;
    const w3 = Math.sin(
        flow * Math.PI * 2.0 * 0.7 +
        (Math.sin(nx * 2.3 + flow * 1.5 + xOff * 0.5) * 0.7 +
            Math.sin(nx * 5.7 + flow * 3.1 + xOff * 0.2) * 0.3) * 3.0
    ) * 0.4 + 0.5;

    const foam = (
        Math.abs(Math.sin(nx * 2.1 + flow * 5.3)) * 0.500 +
        Math.abs(Math.sin(nx * 4.3 + flow * 10.7)) * 0.250 +
        Math.abs(Math.sin(nx * 8.7 + flow * 21.3)) * 0.125 +
        Math.abs(Math.sin(nx * 17.3 + flow * 42.7)) * 0.0625
    ) * 0.4;

    const f = w1 * 0.4 + w2 * 0.25 + w3 * 0.2 + foam * 0.35;
    const pattern = smoothstep(0.3, 0.85, f);

    // Gaussian envelope — localizes pattern to this wave's y-position
    const dy = ny - wavePos;
    const envelope = Math.exp(-dy * dy / (2 * 0.12 * 0.12));

    return pattern * envelope;
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

        function buildGrid(c, r) {
            const g = [];
            for (let row = 0; row < r; row++) {
                g[row] = [];
                for (let col = 0; col < c; col++) {
                    g[row][col] = {
                        char: cellHash(col, row, 0) < 0.5 ? '0' : '1',
                        thr: 0.30 + cellHash(col, row, 1) * 0.60,
                    };
                }
            }
            return g;
        }

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            cols = Math.ceil(canvas.width / CW) + 1;
            rows = Math.ceil(canvas.height / CH) + 1;
            grid = buildGrid(cols, rows);
        }
        resize();
        window.addEventListener('resize', resize);

        function render() {
            const t = (performance.now() - t0) / 1000;

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!grid) { raf = requestAnimationFrame(render); return; }

            const aspect = canvas.width / canvas.height;

            // Collect active waves (±0.3 margin beyond screen bounds)
            const activeWaves = [];
            for (let i = 0; i < WAVE_TIMINGS.length; i++) {
                const wavePos = (t - WAVE_TIMINGS[i]) / WAVE_TRAVEL_TIME;
                if (wavePos >= -0.3 && wavePos <= 1.3) {
                    activeWaves.push({ pos: wavePos, idx: i });
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
                        for (const wave of activeWaves) {
                            const f = waveIntensity(nx, ny, wave.pos, wave.idx, t);
                            if (f > maxF) maxF = f;
                        }
                        if (maxF > grid[r][c].thr) {
                            ctx.fillText(grid[r][c].char, c * CW, r * CH);
                        }
                    }
                }
            }

            // Timer overlay (top-right)
            const waveLabels = activeWaves.map(w => `#${w.idx + 1}`).join(' ');
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.font = '13px monospace';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'right';
            ctx.fillText(`${formatTime(t)}  ${waveLabels}`, canvas.width - 16, 14);

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
