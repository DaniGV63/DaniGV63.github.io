import { select } from 'd3';
import { SECTOR_COLORS, type PosLap, type TrackData } from './types';

const PADDING = 24;
type Point = [number, number];

/** Rotate like fastf1.plotting examples do, then flip Y for SVG. */
function orient(points: Point[], degrees: number): Point[] {
  const angle = (degrees / 180) * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(([px, py]) => [px * cos - py * sin, -(px * sin + py * cos)]);
}

function pairs(flat: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!]);
  return out;
}

function toPath(points: Point[]): string {
  return points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(0)},${py.toFixed(0)}`).join('');
}

export interface TrackMapOptions {
  container: HTMLElement;
  track: TrackData;
  lap: PosLap | null;
  loading: boolean;
}

export function renderTrackMap({ container, track, lap, loading }: TrackMapOptions): void {
  const rotation = track.rotationDeg;
  const outline = orient(track.outline, rotation);
  const boundaries = orient(track.sectorBoundaries, rotation);
  const corners = orient(
    track.corners.map((c) => [c.x, c.y] as Point),
    rotation,
  );

  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs) - PADDING * 10;
  const minY = Math.min(...ys) - PADDING * 10;
  const w = Math.max(...xs) - minX + PADDING * 10;
  const h = Math.max(...ys) - minY + PADDING * 10;
  const stroke = Math.max(w, h) / 90;

  container.replaceChildren();
  const svg = select(container)
    .append('svg')
    .attr('viewBox', `${minX} ${minY} ${w} ${h}`)
    .attr('role', 'img')
    .attr(
      'aria-label',
      'Circuit map with the selected lap drawn in three sector colours.',
    );

  svg
    .append('path')
    .attr('d', `${toPath(outline)}Z`)
    .attr('class', 'f1-track')
    .attr('stroke-width', stroke * 2.2);

  svg
    .append('g')
    .selectAll('text')
    .data(track.corners)
    .join('text')
    .attr('class', 'f1-corner')
    .attr('x', (_, i) => corners[i]![0])
    .attr('y', (_, i) => corners[i]![1])
    .attr('font-size', stroke * 3.2)
    .text((c) => c.number);

  if (lap) {
    const points = orient(pairs(lap.p), rotation);
    const cuts = [0, lap.s[0], lap.s[1], points.length - 1];
    SECTOR_COLORS.forEach((color, i) => {
      const segment = points.slice(cuts[i], cuts[i + 1]! + 1);
      svg
        .append('path')
        .attr('d', toPath(segment))
        .attr('class', 'f1-trace')
        .attr('stroke', color)
        .attr('stroke-width', stroke);
    });
  }

  svg
    .append('g')
    .selectAll('line')
    .data(boundaries)
    .join('circle')
    .attr('class', 'f1-boundary')
    .attr('cx', (p) => p[0])
    .attr('cy', (p) => p[1])
    .attr('r', stroke * 1.6);

  const start = outline[0]!;
  svg
    .append('circle')
    .attr('class', 'f1-start')
    .attr('cx', start[0])
    .attr('cy', start[1])
    .attr('r', stroke * 1.9);

  if (!lap) {
    svg
      .append('text')
      .attr('class', 'f1-map-note')
      .attr('x', minX + w / 2)
      .attr('y', minY + h / 2)
      .attr('font-size', stroke * 4)
      .attr('text-anchor', 'middle')
      .text(loading ? 'Loading lap…' : 'No position data for this lap');
  }
}
