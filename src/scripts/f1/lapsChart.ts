import { axisBottom, axisLeft, line, scaleLinear, select } from 'd3';
import {
  FALLBACK_COLOR,
  formatLapTime,
  sectorValue,
  type LapRow,
  type Selection,
} from './types';

const SECTOR_LABELS = ['S1', 'S2', 'S3'];
const MARGIN = { top: 16, right: 20, bottom: 34, left: 48 };

export interface LapsChartOptions {
  container: HTMLElement;
  tooltip: HTMLElement;
  laps: LapRow[];
  selection: Selection;
  colors: Map<string, string>;
  onPick: (driver: string, lap: number) => void;
}

/** Best (lowest) accurate time of the whole race for each sector. */
export function bestSectorTimes(laps: LapRow[]): number[] {
  return [0, 1, 2].map((i) => {
    const values = laps
      .filter((row) => row.isAccurate)
      .map((row) => sectorValue(row, i))
      .filter((v): v is number => v !== null);
    return Math.min(...values);
  });
}

function lapValues(row: LapRow, best: number[], delta: boolean): number[] | null {
  const raw = [0, 1, 2].map((i) => sectorValue(row, i));
  if (raw.some((v) => v === null)) return null;
  return (raw as number[]).map((v, i) => (delta ? v - best[i] : v));
}

export function renderLapsChart(options: LapsChartOptions): void {
  const { container, tooltip, laps, selection, colors, onPick } = options;
  const delta = selection.yMode === 'delta';
  const best = bestSectorTimes(laps);
  const width = Math.max(container.clientWidth, 280);
  const height = Math.round(Math.min(Math.max(width * 0.82, 300), 460));

  const drawable = laps
    .filter((row) => selection.drivers.includes(row.driver))
    .filter(
      (row) =>
        row.isAccurate ||
        (row.driver === selection.driver && row.lap === selection.lap),
    )
    .map((row) => ({ row, values: lapValues(row, best, delta) }))
    .filter((entry): entry is { row: LapRow; values: number[] } => entry.values !== null);

  const all = drawable.flatMap((entry) => entry.values);
  const accurate = drawable.filter((entry) => entry.row.isAccurate).flatMap((e) => e.values);
  const domain = accurate.length > 0 ? accurate : all;
  const lo = delta ? 0 : Math.min(...domain) - 0.5;
  const hi = Math.max(...domain) + (delta ? 0.4 : 0.5);

  const x = scaleLinear()
    .domain([0, 2])
    .range([MARGIN.left + 12, width - MARGIN.right - 12]);
  const y = scaleLinear()
    .domain([lo, hi])
    .range([height - MARGIN.bottom, MARGIN.top]);
  const path = line<number>()
    .x((_, i) => x(i))
    .y((v) => y(v));

  container.replaceChildren();
  const svg = select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('height', height)
    .attr('role', 'img')
    .attr(
      'aria-label',
      'Sector times per lap: one line per lap across sectors S1, S2 and S3. ' +
        'The table below lists the same data for the selected lap.',
    );

  svg
    .append('g')
    .attr('class', 'f1-axis')
    .attr('transform', `translate(0,${height - MARGIN.bottom})`)
    .call(
      axisBottom(x)
        .tickValues([0, 1, 2])
        .tickFormat((v) => SECTOR_LABELS[Number(v)] ?? '')
        .tickSizeOuter(0),
    );
  svg
    .append('g')
    .attr('class', 'f1-axis')
    .attr('transform', `translate(${MARGIN.left},0)`)
    .call(axisLeft(y).ticks(6).tickFormat((v) => `${delta ? '+' : ''}${Number(v).toFixed(1)}`));
  svg
    .append('text')
    .attr('class', 'f1-axis-label')
    .attr('x', 4)
    .attr('y', 10)
    .text(delta ? 'seconds lost vs best sector of the race' : 'sector time (s)');

  const isActive = (row: LapRow): boolean =>
    row.driver === selection.driver && row.lap === selection.lap;
  const ordered = [...drawable].sort(
    (a, b) => Number(isActive(a.row)) - Number(isActive(b.row)),
  );

  const lines = svg.append('g');
  for (const { row, values } of ordered) {
    const color = colors.get(row.driver) ?? FALLBACK_COLOR;
    const active = isActive(row);
    const d = path(values) ?? '';
    const group = lines.append('g').attr('class', active ? 'f1-lap f1-lap--active' : 'f1-lap');
    if (active) {
      group.append('path').attr('d', d).attr('class', 'f1-lap__halo');
    }
    group
      .append('path')
      .attr('d', d)
      .attr('class', 'f1-lap__line')
      .attr('stroke', color);
    group
      .append('path')
      .attr('d', d)
      .attr('class', 'f1-lap__hit')
      .on('pointerenter pointermove', (event: PointerEvent) =>
        showTooltip(tooltip, container, event, row),
      )
      .on('pointerleave', () => {
        tooltip.hidden = true;
      })
      .on('click', () => onPick(row.driver, row.lap));
  }
}

function showTooltip(
  tooltip: HTMLElement,
  container: HTMLElement,
  event: PointerEvent,
  row: LapRow,
): void {
  const parts = [
    `${row.driver} · lap ${row.lap}`,
    `S1 ${row.s1?.toFixed(3) ?? '—'}  S2 ${row.s2?.toFixed(3) ?? '—'}  S3 ${row.s3?.toFixed(3) ?? '—'}`,
    `${formatLapTime(row.lapTime)} · ${row.compound ?? 'unknown tyre'}`,
  ];
  tooltip.textContent = parts.join('\n');
  tooltip.hidden = false;
  const box = container.getBoundingClientRect();
  const left = Math.min(event.clientX - box.left + 12, box.width - tooltip.offsetWidth);
  tooltip.style.left = `${Math.max(left, 0)}px`;
  tooltip.style.top = `${Math.max(event.clientY - box.top - tooltip.offsetHeight - 12, 0)}px`;
}
