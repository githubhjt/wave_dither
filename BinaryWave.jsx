import { useRef, useEffect } from 'react';

const CW = 9;
const CH = 10;
const FS = 9;
const WAVE_SPEED = 0.12;

function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

function waveValue(nx, ny, t) {
    const flow = -ny + t * WAVE_SPEED;

    const xWarp = (
        Math.sin(nx * 4.0 + flow * 2.1) * 0.5 +
        Math.sin(nx * 9.7 + flow * 3.8) * 0.3 +
        Math.sin(nx * 19.1 + flow * 7.3) * 0.2
    ) * 0.15;

    const w1 = Math.sin(flow * Math.PI * 2.0 + xWarp * Math.PI * 2.0) * 0.5 + 0.5;
    const w2 = Math.sin(flow * Math.PI * 2.0 * 2.3 + xWarp * Math.PI * 3.0 + 1.0) * 0.3 + 0.5;
    const w3 = Math.sin(
        flow * Math.PI * 2.0 * 0.7 +
        (Math.sin(nx * 2.3 + flow * 1.5) * 0.7 +
            Math.sin(nx * 5.7 + flow * 3.1) * 0.3) * 3.0
    ) * 0.4 + 0.5;

    const foam = (
        Math.abs(Math.sin(nx * 2.1 + flow * 5.3)) * 0.500 +
        Math.abs(Math.sin(nx * 4.3 + flow * 10.7)) * 0.250 +
        Math.abs(Math.sin(nx * 8.7 + flow * 21.3)) * 0.125 +
        Math.abs(Math.sin(nx * 17.3 + flow * 42.7)) * 0.0625
    ) * 0.4;

    const f = w1 * 0.4 + w2 * 0.25 + w3 * 0.2 + foam * 0.35;
    return smoothstep(0.3, 0.85, f);
}

function cellHash(col, row, seed) {
    let h = ((col * 374761393 + row * 668265263 + seed * 2654435761) | 0);
    h = (h ^ (h >>> 13)) | 0;
    h = (Math.imul(h, 1274126177)) | 0;
    return ((h >>> 0) & 0xffff) / 0xffff;
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

        ctx.font = `${FS}px "Courier New", monospace`;
        ctx.textBaseline = 'top';

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
            const aspect = canvas.width / canvas.height;

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!grid) { raf = requestAnimationFrame(render); return; }

            // Background dots
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    ctx.fillRect(c * CW + 3.5, r * CH + 5.5, 1.5, 1.5);
                }
            }

            // Wave characters
            ctx.fillStyle = '#fff';
            for (let r = 0; r < rows; r++) {
                const ny = r / rows - 0.5;
                for (let c = 0; c < cols; c++) {
                    const nx = (c / cols - 0.5) * aspect;
                    const f = waveValue(nx, ny, t);
                    if (f > grid[r][c].thr) {
                        ctx.fillText(grid[r][c].char, c * CW, r * CH);
                    }
                }
            }

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
