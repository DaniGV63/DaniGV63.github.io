import type { TrackData } from './types';

export type Point = [number, number];

/** Rotate by the circuit angle (as in fastf1.plotting examples), flip Y for SVG. */
export function orient(points: Point[], degrees: number): Point[] {
  const angle = (degrees / 180) * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(([px, py]) => [px * cos - py * sin, -(px * sin + py * cos)]);
}

/** Position at a fraction (0..1) of the length of a closed polyline. */
export function arcSampler(outline: Point[]): (fraction: number) => Point {
  const closed = [...outline, outline[0]!];
  const cumulative = [0];
  for (let i = 1; i < closed.length; i++) {
    const [x0, y0] = closed[i - 1]!;
    const [x1, y1] = closed[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cumulative[cumulative.length - 1]!;

  return (fraction: number): Point => {
    const target = Math.min(Math.max(fraction, 0), 1) * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! <= target) lo = mid;
      else hi = mid;
    }
    const span = cumulative[hi]! - cumulative[lo]!;
    const t = span === 0 ? 0 : (target - cumulative[lo]!) / span;
    const [x0, y0] = closed[lo]!;
    const [x1, y1] = closed[hi]!;
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
}

export function boundsOf(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export interface CircuitView {
  outline: Point[];
  corners: Point[];
  sample: (fraction: number) => Point;
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** Line width that suits the circuit extent, in world units. */
  stroke: number;
}

/** Oriented circuit plus the viewBox used by the 2D map and the 3D canvas. */
export function circuitView(track: TrackData, pad = 1500): CircuitView {
  const outline = orient(track.outline as Point[], track.rotationDeg);
  const corners = orient(
    track.corners.map((c) => [c.x, c.y] as Point),
    track.rotationDeg,
  );
  const box = boundsOf(outline);
  const width = box.maxX - box.minX + 2 * pad;
  const height = box.maxY - box.minY + 2 * pad;
  return {
    outline,
    corners,
    sample: arcSampler(outline),
    minX: box.minX - pad,
    minY: box.minY - pad,
    width,
    height,
    stroke: Math.max(width, height) / 70,
  };
}

/** Heading in radians of the direction of travel at a lap fraction. */
export function headingAt(sample: (f: number) => Point, fraction: number): number {
  const a = sample(Math.max(fraction - 0.004, 0));
  const b = sample(Math.min(fraction + 0.004, 1));
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

export interface Check {
  corners: [Point, Point, Point, Point];
  dark: boolean;
}

/** Chequered start/finish line across the track at the start of the lap. */
export function finishLine(view: CircuitView): { checks: Check[]; border: Point[] } {
  const [x0, y0] = view.outline[0]!;
  const heading = headingAt(view.sample, 0.002);
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;
  const columns = 8;
  const rows = 2;
  const across = view.stroke * 3.6;
  const along = view.stroke * 1.2;
  const at = (a: number, l: number): Point => [
    x0 + nx * a + ux * l,
    y0 + ny * a + uy * l,
  ];
  const checks: Check[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const a0 = -across / 2 + (c * across) / columns;
      const a1 = a0 + across / columns;
      const l0 = -along / 2 + (r * along) / rows;
      const l1 = l0 + along / rows;
      checks.push({
        corners: [at(a0, l0), at(a1, l0), at(a1, l1), at(a0, l1)],
        dark: (r + c) % 2 === 0,
      });
    }
  }
  const border: Point[] = [
    at(-across / 2, -along / 2),
    at(across / 2, -along / 2),
    at(across / 2, along / 2),
    at(-across / 2, along / 2),
  ];
  return { checks, border };
}

export interface SectorMarks {
  /** Short line across the track at the end of sector 1 and sector 2. */
  ticks: [Point, Point][];
  labels: { text: string; at: Point }[];
}

/** Where the sectors end and where to write S1, S2 and S3. */
export function sectorMarks(view: CircuitView, track: TrackData): SectorMarks {
  const boundaries = orient(track.sectorBoundaries as Point[], track.rotationDeg);
  const fractionOf = ([bx, by]: Point): number => {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i <= 1000; i++) {
      const [x, y] = view.sample(i / 1000);
      const d = Math.hypot(x - bx, y - by);
      if (d < bestDistance) {
        bestDistance = d;
        best = i / 1000;
      }
    }
    return best;
  };
  const fractions = boundaries.map(fractionOf);
  const cx = view.minX + view.width / 2;
  const cy = view.minY + view.height / 2;

  const ticks = fractions.map((f): [Point, Point] => {
    const [x, y] = view.sample(f);
    const h = headingAt(view.sample, f);
    const nx = -Math.sin(h);
    const ny = Math.cos(h);
    const r = view.stroke * 2.4;
    return [
      [x - nx * r, y - ny * r],
      [x + nx * r, y + ny * r],
    ];
  });

  const edges = [0, ...fractions, 1];
  const trackPoints = Array.from({ length: 400 }, (_, n) => view.sample(n / 400));
  const clearance = ([px, py]: Point): number =>
    Math.min(...trackPoints.map(([x, y]) => Math.hypot(x - px, y - py)));
  const distance = view.stroke * 3.2;
  const margin = view.stroke * 1.8;
  const roomNeeded = view.stroke * 2.6;
  const turning = (from: number, to: number): number => {
    let total = 0;
    let previous = headingAt(view.sample, from);
    for (let n = 1; n <= 6; n++) {
      const h = headingAt(view.sample, from + ((to - from) * n) / 6);
      let delta = Math.abs(h - previous);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      total += delta;
      previous = h;
    }
    return total;
  };

  // Each label goes over the straightest stretch of its own sector, on the
  // side that faces away from the circuit and has room for the text.
  const labels = ['S1', 'S2', 'S3'].map((text, i) => {
    const from = edges[i]!;
    const to = edges[i + 1]!;
    const span = Math.min(0.07, (to - from) * 0.5);
    const windows: { f: number; turn: number }[] = [];
    for (let start = from; start + span <= to + 1e-9; start += 0.008) {
      windows.push({ f: start + span / 2, turn: turning(start, start + span) });
    }
    windows.sort((a, b) => a.turn - b.turn);
    for (const { f } of windows) {
      const [x, y] = view.sample(f);
      const h = headingAt(view.sample, f);
      const options = [1, -1]
        .map((side): Point => [x - Math.sin(h) * distance * side, y + Math.cos(h) * distance * side])
        .sort((p, q) => {
          const away = (r: Point): number => (r[0] - cx) ** 2 + (r[1] - cy) ** 2;
          return away(q) - away(p);
        });
      for (const at of options) {
        const inside =
          at[0] > view.minX + margin &&
          at[0] < view.minX + view.width - margin &&
          at[1] > view.minY + margin &&
          at[1] < view.minY + view.height - margin;
        if (inside && clearance(at) >= roomNeeded) return { text, at };
      }
    }
    const [x, y] = view.sample((from + to) / 2);
    return { text, at: [x, y] as Point };
  });
  return { ticks, labels };
}
