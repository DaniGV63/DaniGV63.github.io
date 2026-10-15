import { select } from 'd3';
import { carFill, CAR_PARTS, CAR_SCALE } from './carIcon';
import { circuitView, finishLine, headingAt, sectorMarks } from './circuit';
import type { TrackData } from './types';

const SUBPOINTS = 6; // points per part so curves stay smooth

export interface PartStyle {
  color: string;
  opacity: number;
  label: string;
}

export interface SweepMap {
  setStyles(styles: PartStyle[]): void;
  setCarColor(color: string): void;
  /** Colour the circuit from the start line, with a car driving the lap. */
  play(durationMs: number): void;
  showAll(): void;
  clear(): void;
}

const ease = (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2;

/**
 * Top-down circuit made of `segments` parts. The coloured parts are revealed
 * in driving order, starting at the start line, while a car runs ahead of them.
 */
export function createSweepMap(
  container: HTMLElement,
  track: TrackData,
  segments: number,
): SweepMap {
  const view = circuitView(track);
  const { outline, sample, stroke } = view;

  const svg = select(container)
    .append('svg')
    .attr('viewBox', `${view.minX} ${view.minY} ${view.width} ${view.height}`)
    .attr('role', 'img')
    .attr(
      'aria-label',
      'Circuit seen from above, coloured part by part by the fastest of the ' +
        'selected drivers, from the start line to the end of the lap.',
    );

  svg
    .append('path')
    .attr('class', 'cmp-base')
    .attr('stroke-width', stroke * 2.4)
    .attr('d', `M${outline.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join('L')}Z`);

  const group = svg.append('g').attr('stroke-width', stroke);
  const paths = Array.from({ length: segments }, () => {
    const path = group.append('path').attr('class', 'cmp-seg');
    path.append('title');
    return path;
  });

  // sector ends and names (no corner numbers on this map)
  const sectors = sectorMarks(view, track);
  const sectorLayer = svg.append('g').attr('class', 'cmp-sectors');
  sectors.ticks.forEach(([p, q]) => {
    sectorLayer
      .append('line')
      .attr('x1', p[0])
      .attr('y1', p[1])
      .attr('x2', q[0])
      .attr('y2', q[1])
      .attr('stroke-width', stroke * 0.32);
  });
  sectors.labels.forEach((label) => {
    sectorLayer
      .append('text')
      .attr('class', 'cmp-sector-label')
      .attr('x', label.at[0])
      .attr('y', label.at[1])
      .attr('font-size', stroke * 3.4)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .text(label.text);
  });

  const line = finishLine(view);
  const flag = svg.append('g').attr('class', 'cmp-finish');
  for (const check of line.checks) {
    flag
      .append('path')
      .attr('d', `M${check.corners.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join('L')}Z`)
      .attr('fill', check.dark ? '#111111' : '#f5f5f5');
  }
  flag
    .append('path')
    .attr('d', `M${line.border.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join('L')}Z`)
    .attr('fill', 'none')
    .attr('stroke', '#ffffff')
    .attr('stroke-width', stroke * 0.14);
  const car = svg.append('g').attr('class', 'cmp-car').attr('display', 'none');
  const carShapes = CAR_PARTS.map((part) => car.append('path').attr('d', part.d));
  const paintCar = (livery: string): void => {
    carShapes.forEach((shape, i) => shape.attr('fill', carFill(CAR_PARTS[i]!.fill, livery)));
  };
  paintCar('#dc0000');

  let progress = 0;
  let frame = 0;
  let carVisible = false;

  function placeCar(): void {
    if (!carVisible) {
      car.attr('display', 'none');
      return;
    }
    const [x, y] = sample(progress);
    const angle = (headingAt(sample, progress) * 180) / Math.PI;
    car
      .attr('display', null)
      .attr('transform', `translate(${x},${y}) rotate(${angle}) scale(${stroke * CAR_SCALE})`);
  }

  function draw(): void {
    paths.forEach((path, k) => {
      const portion = Math.min(Math.max(progress * segments - k, 0), 1);
      if (portion <= 0) {
        path.attr('d', null);
        return;
      }
      let d = '';
      const steps = Math.max(1, Math.ceil(SUBPOINTS * portion));
      for (let j = 0; j <= steps; j++) {
        const f = (k + (portion * j) / steps) / segments;
        const [x, y] = sample(f);
        d += `${j === 0 ? 'M' : 'L'}${x.toFixed(0)},${y.toFixed(0)}`;
      }
      path.attr('d', d);
    });
    placeCar();
  }

  return {
    setCarColor(livery) {
      paintCar(livery);
    },
    setStyles(styles) {
      paths.forEach((path, k) => {
        const style = styles[k];
        if (!style) return;
        path.attr('stroke', style.color).attr('opacity', style.opacity);
        path.select('title').text(style.label);
      });
    },
    play(durationMs) {
      cancelAnimationFrame(frame);
      if (durationMs <= 0) {
        progress = 1;
        carVisible = false;
        draw();
        return;
      }
      progress = 0;
      carVisible = true;
      const startedAt = performance.now();
      const step = (now: number): void => {
        const t = Math.min((now - startedAt) / durationMs, 1);
        progress = ease(t);
        if (t >= 1) carVisible = false;
        draw();
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
    showAll() {
      cancelAnimationFrame(frame);
      progress = 1;
      carVisible = false;
      draw();
    },
    clear() {
      cancelAnimationFrame(frame);
      progress = 0;
      carVisible = false;
      draw();
    },
  };
}
