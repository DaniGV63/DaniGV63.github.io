// Geometry for the animated pieces on the home page. Everything is computed at
// build time from the project data, so the pieces draw real circuits and hours.
import track from '../data/f1/2021-abu-dhabi-grand-prix-r/track.json';
import hours from '../data/energinet/hours.json';
import { boundsOf, orient, type Point } from '../scripts/f1/circuit';

/** Seeded random numbers, so every build draws the same piece. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** The Yas Marina outline as an SVG path that fits a width x height box. */
export function circuitPath(width: number, height: number, pad: number): string {
  const points = orient(track.outline as Point[], track.rotationDeg);
  const box = boundsOf(points);
  const scale = Math.min(
    (width - 2 * pad) / (box.maxX - box.minX),
    (height - 2 * pad) / (box.maxY - box.minY),
  );
  const offsetX = (width - (box.maxX - box.minX) * scale) / 2 - box.minX * scale;
  const offsetY = (height - (box.maxY - box.minY) * scale) / 2 - box.minY * scale;
  const path = points
    .map(
      ([x, y], i) =>
        `${i === 0 ? 'M' : 'L'}${(x * scale + offsetX).toFixed(1)},${(y * scale + offsetY).toFixed(1)}`,
    )
    .join('');
  return `${path}Z`;
}

export interface HourDot {
  x: number;
  y: number;
  cluster: number;
  band: number;
}

function quantile(values: number[], q: number): number {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.floor(q * (sorted.length - 1))]!;
}

/** A sample of real hours: wind and solar share (x) against DK2 inertia (y), grouped in vertical bands. */
export function hourDots(count: number, width: number, height: number, bands: number): HourDot[] {
  const xs = hours.re_share_dk1 as number[];
  const ys = hours.inertia_dk2 as number[];
  const clusters = hours.c as number[];
  const [x0, x1] = [quantile(xs, 0.002), quantile(xs, 0.998)] as [number, number];
  const [y0, y1] = [quantile(ys, 0.002), quantile(ys, 0.998)] as [number, number];
  const random = seeded(5);
  const dots: HourDot[] = [];
  for (let n = 0; n < count; n++) {
    const i = Math.floor(random() * xs.length);
    const fx = (xs[i]! - x0) / (x1 - x0);
    const fy = (ys[i]! - y0) / (y1 - y0);
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) continue;
    dots.push({
      x: 24 + fx * (width - 48),
      y: 24 + (1 - fy) * (height - 48),
      cluster: clusters[i]!,
      band: Math.min(bands - 1, Math.floor(fx * bands)),
    });
  }
  return dots;
}

export interface EmgShape {
  traces: string[];
  cells: { x: number; y: number; w: number; h: number; level: number; column: number }[];
}

/** Synthetic muscle-signal traces and a spectrogram (shapes only, no data from the paper). */
export function emgShape(width: number, height: number): EmgShape {
  const random = seeded(7);
  const trace = (y: number, at: number, amplitude: number): string => {
    const points: string[] = [];
    for (let x = 0; x <= width; x += 4) {
      const burst = Math.exp(-(((x - at) / (width * 0.14)) ** 2));
      points.push(`${x},${(y + (random() - 0.5) * (4 + amplitude * burst)).toFixed(1)}`);
    }
    return `M${points.join('L')}`;
  };
  const traces = [
    trace(height * 0.14, width * 0.55, 26),
    trace(height * 0.3, width * 0.62, 34),
    trace(height * 0.46, width * 0.5, 22),
  ];
  const columns = 20;
  const cellWidth = width / columns;
  const cells = Array.from({ length: columns * 4 }, (_, i) => {
    const column = i % columns;
    const row = Math.floor(i / columns);
    const burst = Math.exp(-(((column - columns * 0.55) / 3.5) ** 2)) * (1 - row * 0.18);
    return {
      x: column * cellWidth + 1,
      y: height * 0.62 + row * height * 0.09,
      w: cellWidth - 2,
      h: height * 0.075,
      level: Math.min(1, 0.14 + burst + random() * 0.18),
      column,
    };
  });
  return { traces, cells };
}
