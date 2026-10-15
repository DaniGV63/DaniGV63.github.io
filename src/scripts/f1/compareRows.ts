import { select } from 'd3';

const TOP = 24;
const GUTTER = 34;
const SATURATION = 0.08; // seconds of margin at which a part is fully opaque

export interface PartResult {
  /** Index in `codes` of the fastest driver, or -1 when level. */
  winner: number;
  /** Seconds between the fastest and the second fastest driver. */
  margin: number;
  /** Seconds per driver in `codes` order (null when there is no data). */
  times: (number | null)[];
}

export interface LapResult {
  parts: PartResult[];
  /** Flag shown next to the lap: "P" pit stop, "SC" safety car, or "". */
  flag: string;
  /** Index in `codes` of the fastest lap time among the selected drivers. */
  leader: number;
  leaderGap: number;
}

export interface RowsOptions {
  container: HTMLElement;
  tooltip: HTMLElement;
  totalLaps: number;
  segments: number;
  laps: Map<number, LapResult | null>;
  selectedLap: number | null;
  codes: string[];
  colors: string[];
  cornerOf: string[];
  /** Lap-distance fractions where sector 1 and sector 2 end. */
  sectors: number[];
  onPick: (lap: number) => void;
}

export const opacityFor = (margin: number): number =>
  0.5 + 0.5 * Math.min(1, margin / SATURATION);

/** One horizontal line per lap; each part is coloured by its fastest driver. */
export function renderRows(options: RowsOptions): void {
  const { container, tooltip, totalLaps, segments, laps, selectedLap } = options;
  const { codes, colors, cornerOf, sectors, onPick } = options;
  const width = Math.max(container.clientWidth, 260);
  const wide = width >= 440;
  const rightGutter = wide ? 60 : 6;
  const rowHeight = wide ? 11 : 9;
  const height = TOP + totalLaps * rowHeight + 6;
  const cell = (width - GUTTER - rightGutter) / segments;

  container.replaceChildren();
  const svg = select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('height', height)
    .attr('role', 'img')
    .attr(
      'aria-label',
      `One line per lap, split into ${segments} parts from the start line. ` +
        `Each part is coloured by the fastest of ${codes.join(', ')}.`,
    );

  const trackWidth = width - GUTTER - rightGutter;
  const edges = [0, ...sectors, 1];
  ['S1', 'S2', 'S3'].forEach((name, i) => {
    svg
      .append('text')
      .attr('class', 'f1-axis-label')
      .attr('x', GUTTER + ((edges[i]! + edges[i + 1]!) / 2) * trackWidth)
      .attr('y', 12)
      .attr('text-anchor', 'middle')
      .text(name);
  });

  for (let lap = 1; lap <= totalLaps; lap++) {
    const y = TOP + (lap - 1) * rowHeight;
    const row = svg.append('g').attr('class', 'cmp-row');
    const result = laps.get(lap) ?? null;
    const selected = lap === selectedLap;

    if (lap === 1 || lap % 5 === 0 || selected) {
      row
        .append('text')
        .attr('class', selected ? 'cmp-lap cmp-lap--on' : 'cmp-lap')
        .attr('x', GUTTER - 6)
        .attr('y', y + rowHeight - 2)
        .attr('text-anchor', 'end')
        .text(lap);
    }

    if (result) {
      const dim = result.flag ? 0.55 : 1;
      result.parts.forEach((part, k) => {
        row
          .append('rect')
          .attr('x', GUTTER + k * cell)
          .attr('y', y)
          .attr('width', cell + 0.4)
          .attr('height', rowHeight - 1.5)
          .attr('fill', part.winner < 0 ? 'var(--f1-muted)' : colors[part.winner]!)
          .attr('opacity', part.winner < 0 ? 0.55 * dim : opacityFor(part.margin) * dim);
      });
      // Lap summary: who was fastest and by how much (wide panels only).
      if (wide) row
        .append('text')
        .attr('class', 'cmp-delta')
        .attr('x', width - rightGutter + 6)
        .attr('y', y + rowHeight - 2)
        .attr('fill', colors[result.leader]!)
        .text(
          `${codes[result.leader]} ${result.leaderGap.toFixed(2)}${result.flag ? ' ' + result.flag : ''}`,
        );
    } else {
      row
        .append('line')
        .attr('class', 'cmp-missing')
        .attr('x1', GUTTER)
        .attr('x2', width - rightGutter)
        .attr('y1', y + rowHeight / 2)
        .attr('y2', y + rowHeight / 2);
    }

    if (selected) {
      row
        .append('rect')
        .attr('class', 'cmp-selected')
        .attr('x', GUTTER - 1)
        .attr('y', y - 1)
        .attr('width', width - GUTTER - rightGutter + 2)
        .attr('height', rowHeight + 0.5);
    }

    row
      .append('rect')
      .attr('class', 'cmp-hit')
      .attr('x', 0)
      .attr('y', y)
      .attr('width', width)
      .attr('height', rowHeight)
      .on('click', () => onPick(lap))
      .on('pointerleave', () => {
        tooltip.hidden = true;
      })
      .on('pointermove', (event: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const k = Math.floor((event.clientX - rect.left - GUTTER) / cell);
        tooltip.textContent = describe(lap, k, result, codes, cornerOf, segments);
        tooltip.hidden = false;
        const left = Math.min(event.clientX - rect.left + 12, rect.width - tooltip.offsetWidth);
        tooltip.style.left = `${Math.max(left, 0)}px`;
        tooltip.style.top = `${event.clientY - rect.top + 14}px`;
      });
  }

  sectors.forEach((fraction) => {
    const x = GUTTER + fraction * trackWidth;
    svg
      .append('line')
      .attr('class', 'cmp-sector')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', TOP - 6)
      .attr('y2', TOP + totalLaps * rowHeight);
  });
}

function describe(
  lap: number,
  k: number,
  result: LapResult | null,
  codes: string[],
  cornerOf: string[],
  segments: number,
): string {
  if (!result) return `Lap ${lap}\nNo comparable data`;
  const note = result.flag === 'P' ? '\n(pit stop on this lap)' : result.flag === 'SC' ? '\n(safety car)' : '';
  const part = result.parts[k];
  if (!part || k < 0 || k >= segments) return `Lap ${lap}${note}`;
  const ranked = part.times
    .map((time, i) => ({ code: codes[i]!, time }))
    .filter((entry): entry is { code: string; time: number } => entry.time !== null)
    .sort((a, b) => a.time - b.time);
  const best = ranked[0]?.time ?? 0;
  const lines = ranked
    .slice(0, 6)
    .map((e, i) => `${e.code}  ${e.time.toFixed(3)} s${i === 0 ? '' : `  +${(e.time - best).toFixed(3)}`}`);
  return `Lap ${lap} · part ${k + 1}/${segments} · near ${cornerOf[k] ?? '—'}\n${lines.join('\n')}${note}`;
}
