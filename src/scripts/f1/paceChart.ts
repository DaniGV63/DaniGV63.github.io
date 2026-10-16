import { axisBottom, axisLeft, line, scaleLinear, select } from 'd3';
import { formatLapTime, type LapRow } from './types';

export type PaceView = 'lap' | 'gap';

/** Seconds as m:ss (or m:ss.s), the way lap times are read. */
export function clock(seconds: number, signed = false): string {
  const sign = seconds < 0 ? '-' : signed ? '+' : '';
  const total = Math.abs(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  const text = Number.isInteger(rest) ? String(rest).padStart(2, '0') : rest.toFixed(1).padStart(4, '0');
  return `${sign}${minutes}:${text}`;
}

function niceTicks(lo: number, hi: number): number[] {
  const step = [10, 20, 30, 60, 120].find((s) => (hi - lo) / s <= 7) ?? 120;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

const MARGIN = { top: 18, right: 16, bottom: 30, left: 52 };

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#e10600',
  MEDIUM: '#f5c518',
  HARD: '#d4d4d8',
};

export interface PaceOptions {
  container: HTMLElement;
  tooltip: HTMLElement;
  laps: LapRow[];
  totalLaps: number;
  drivers: string[];
  colors: Map<string, string>;
  view: PaceView;
  selectedLap: number | null;
  onPick: (lap: number) => void;
}

interface Point {
  lap: number;
  value: number | null;
}

const isSafetyCar = (row: LapRow): boolean => /[4567]/.test(row.trackStatus ?? '');
const isDisturbed = (row: LapRow): boolean =>
  row.lap === 1 || row.pitIn || row.pitOut || isSafetyCar(row);

function rowsOf(laps: LapRow[], driver: string): Map<number, LapRow> {
  return new Map(laps.filter((r) => r.driver === driver).map((r) => [r.lap, r]));
}

/** Lap time per lap; pit, first and safety-car laps are left out so the line breaks. */
function lapSeries(rows: Map<number, LapRow>, total: number): Point[] {
  return Array.from({ length: total }, (_, k) => {
    const row = rows.get(k + 1);
    const usable = row && row.lapTime !== null && !isDisturbed(row);
    return { lap: k + 1, value: usable ? row.lapTime : null };
  });
}

function cumulative(rows: Map<number, LapRow>, total: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let lap = 1; lap <= total; lap++) {
    const time = rows.get(lap)?.lapTime ?? null;
    if (time === null) {
      out.push(null);
      sum = NaN;
    } else {
      sum += time;
      out.push(Number.isNaN(sum) ? null : sum);
    }
  }
  return out;
}

/** Seconds behind the reference driver (negative = ahead), per lap. */
function gapSeries(laps: LapRow[], drivers: string[], total: number): Map<string, Point[]> {
  const totals = new Map(drivers.map((d) => [d, cumulative(rowsOf(laps, d), total)]));
  const reference = totals.get(drivers[0]!)!;
  return new Map(
    drivers.map((driver) => [
      driver,
      totals.get(driver)!.map((value, k) => ({
        lap: k + 1,
        value: value !== null && reference[k] !== null ? value - reference[k]! : null,
      })),
    ]),
  );
}

export function renderPace(options: PaceOptions): void {
  const { container, tooltip, laps, totalLaps, drivers, colors, view, selectedLap } = options;
  const width = Math.max(container.clientWidth, 280);
  const plotHeight = Math.round(Math.min(Math.max(width * 0.5, 240), 340));
  const height = plotHeight + MARGIN.top + MARGIN.bottom;
  const plotBottom = MARGIN.top + plotHeight;

  const rows = new Map(drivers.map((d) => [d, rowsOf(laps, d)]));
  const series =
    view === 'lap'
      ? new Map(drivers.map((d) => [d, lapSeries(rows.get(d)!, totalLaps)]))
      : gapSeries(laps, drivers, totalLaps);
  const values = [...series.values()].flat().map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length === 0) {
    container.replaceChildren();
    return;
  }
  const lo = view === 'gap' ? Math.min(...values, 0) - 1 : Math.min(...values) - 0.3;
  const hi = view === 'gap' ? Math.max(...values, 0) + 1 : Math.max(...values) + 0.3;

  const x = scaleLinear()
    .domain([1, totalLaps])
    .range([MARGIN.left, width - MARGIN.right]);
  // In the gap view "ahead" (negative) points up, like a race-trace chart.
  const y = scaleLinear()
    .domain([lo, hi])
    .range(view === 'gap' ? [MARGIN.top, plotBottom] : [plotBottom, MARGIN.top]);
  const path = line<Point>()
    .defined((p) => p.value !== null)
    .x((p) => x(p.lap))
    .y((p) => y(p.value!));

  container.replaceChildren();
  const svg = select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('height', height)
    .attr('role', 'img')
    .attr(
      'aria-label',
      view === 'lap'
        ? 'Lap time by lap for the selected drivers. Pit-stop and safety-car laps are left out; dots mark a new set of tyres.'
        : `Race gap by lap: seconds behind ${drivers[0]}, negative means ahead.`,
    );

  // Safety-car laps shaded in the background.
  const scLaps = new Set(laps.filter(isSafetyCar).map((r) => r.lap));
  const step = (width - MARGIN.left - MARGIN.right) / Math.max(totalLaps - 1, 1);
  for (const lap of scLaps) {
    svg
      .append('rect')
      .attr('class', 'pace-sc')
      .attr('x', x(lap) - step / 2)
      .attr('y', MARGIN.top)
      .attr('width', step)
      .attr('height', plotHeight);
  }
  if (scLaps.size > 0) {
    const first = Math.min(...scLaps);
    svg
      .append('text')
      .attr('class', 'f1-axis-label')
      .attr('x', x(first) - step / 2 + 3)
      .attr('y', MARGIN.top + 11)
      .text('SC');
  }

  svg
    .append('g')
    .attr('class', 'f1-axis')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(axisBottom(x).ticks(width < 500 ? 5 : 10).tickFormat((v) => String(v)).tickSizeOuter(0));
  svg
    .append('g')
    .attr('class', 'f1-axis')
    .attr('transform', `translate(${MARGIN.left},0)`)
    .call(
      axisLeft(y)
        .tickValues(view === 'gap' ? niceTicks(lo, hi) : y.ticks(6))
        .tickFormat((v) => clock(Number(v), view === 'gap' && Number(v) !== 0)),
    );
  svg
    .append('text')
    .attr('class', 'f1-axis-label')
    .attr('x', 4)
    .attr('y', 10)
    .text(
      view === 'lap'
        ? 'lap time (m:ss) · pit, lap 1 and safety-car laps left out'
        : `gap to ${drivers[0]} (m:ss) · up = ahead`,
    );

  if (view === 'gap') {
    svg
      .append('line')
      .attr('class', 'pace-zero')
      .attr('x1', MARGIN.left)
      .attr('x2', width - MARGIN.right)
      .attr('y1', y(0))
      .attr('y2', y(0));
  }

  drivers.forEach((driver, i) => {
    const colour = colors.get(driver) ?? '#9aa0a6';
    svg
      .append('path')
      .attr('class', 'pace-line')
      .attr('d', path(series.get(driver)!) ?? '')
      .attr('stroke', colour);

    // A dot where each set of tyres starts, filled with its compound colour.
    const starts = [...rows.get(driver)!.values()].filter((row) => row.pitOut || row.lap === 1);
    for (const start of starts) {
      const point = series.get(driver)!.slice(start.lap).find((p) => p.value !== null);
      const row = point ? rows.get(driver)!.get(point.lap) : undefined;
      if (!point || !row || point.lap - start.lap > 2) continue;
      svg
        .append('circle')
        .attr('class', 'pace-dot')
        .attr('cx', x(point.lap))
        .attr('cy', y(point.value!))
        .attr('r', 4.5)
        .attr('fill', COMPOUND_COLORS[row.compound ?? ''] ?? '#71717a')
        .attr('stroke', colour);
    }
  });

  if (selectedLap !== null) {
    svg
      .append('line')
      .attr('class', 'pace-selected')
      .attr('x1', x(selectedLap))
      .attr('x2', x(selectedLap))
      .attr('y1', MARGIN.top)
      .attr('y2', plotBottom);
  }

  const lapAt = (event: PointerEvent): number => {
    const box = (event.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * (width - MARGIN.left - MARGIN.right);
    const lap = Math.round(x.invert(MARGIN.left + px));
    return Math.min(Math.max(lap, 1), totalLaps);
  };
  svg
    .append('rect')
    .attr('class', 'pace-hit')
    .attr('x', MARGIN.left)
    .attr('y', MARGIN.top)
    .attr('width', width - MARGIN.left - MARGIN.right)
    .attr('height', plotHeight)
    .on('pointermove', (event: PointerEvent) => {
      const lap = lapAt(event);
      tooltip.textContent = [
        `Lap ${lap}${scLaps.has(lap) ? ' · safety car' : ''}`,
        ...drivers.map((driver) => {
          const row = rows.get(driver)!.get(lap);
          const point = series.get(driver)![lap - 1]!;
          const shown =
            view === 'gap'
              ? point.value === null
                ? '—'
                : clock(point.value, true)
              : formatLapTime(row?.lapTime ?? null);
          const note = row?.pitIn ? ' · pit in' : row?.pitOut ? ' · pit out' : '';
          return `${driver}  ${shown}  ${row?.compound?.[0] ?? '—'}${note}`;
        }),
      ].join('\n');
      tooltip.hidden = false;
      const box = container.getBoundingClientRect();
      const left = Math.min(event.clientX - box.left + 12, box.width - tooltip.offsetWidth);
      tooltip.style.left = `${Math.max(left, 0)}px`;
      tooltip.style.top = `${Math.max(event.clientY - box.top - tooltip.offsetHeight - 12, 0)}px`;
    })
    .on('pointerleave', () => {
      tooltip.hidden = true;
    })
    .on('click', (event: PointerEvent) => options.onPick(lapAt(event)));
}
