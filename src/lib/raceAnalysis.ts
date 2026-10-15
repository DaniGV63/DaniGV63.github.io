import { arcSampler, type Point } from '../scripts/f1/circuit';
import type { LapRow, RaceMeta, SegFile, TrackData } from '../scripts/f1/types';

export interface DriverRate {
  code: string;
  name: string;
  finish: number | null;
  won: number;
  laps: number;
  rate: number; // parts won / parts contested
}

export interface PartSpread {
  part: number; // 1-based
  corner: string;
  seconds: number; // average gap between the median driver and the best one
}

export interface RaceAnalysis {
  cells: number;
  fieldSize: number; // average number of drivers compared per lap
  chance: number; // win rate if every driver were equally fast
  rates: DriverRate[];
  cleanRates: DriverRate[];
  sameOrder: boolean; // top four unchanged without pit and safety-car laps
  parts: PartSpread[];
  topShare: number; // share of the total spread held by the five widest parts
  totalSpread: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

function isDisturbed(row: LapRow | undefined): boolean {
  if (!row) return true;
  const status = row.trackStatus ?? '';
  return row.lap === 1 || row.pitIn || row.pitOut || /[4567]/.test(status);
}

/**
 * For every lap and every part of the circuit the fastest of all drivers
 * running on that lap "wins" the part. Everything is derived from the JSON the
 * pipeline writes, so the page text always matches the data.
 */
export function analyseRace(
  meta: RaceMeta,
  laps: LapRow[],
  segments: Record<string, SegFile>,
  track: TrackData,
): RaceAnalysis {
  const rows = new Map(laps.map((r) => [`${r.driver}-${r.lap}`, r]));
  const codes = Object.keys(segments).sort();
  const parts = segments[codes[0]!]!.segments;

  const run = (clean: boolean) => {
    const won = new Map<string, number>();
    const seen = new Map<string, number>();
    const spread: number[][] = Array.from({ length: parts }, () => []);
    let cells = 0;
    let present = 0;
    for (let lap = 1; lap <= meta.totalLaps; lap++) {
      const field = codes
        .map((code) => ({ code, times: segments[code]!.laps[String(lap)] }))
        .filter(
          (entry) =>
            entry.times?.length === parts &&
            !(clean && isDisturbed(rows.get(`${entry.code}-${lap}`))),
        ) as { code: string; times: number[] }[];
      if (field.length < 3) continue;
      for (let k = 0; k < parts; k++) {
        const times = field.map((entry) => entry.times[k]!);
        const best = Math.min(...times);
        const winner = field[times.indexOf(best)]!.code;
        won.set(winner, (won.get(winner) ?? 0) + 1);
        spread[k]!.push(median(times) - best);
        cells += 1;
        present += field.length;
        field.forEach((entry) => seen.set(entry.code, (seen.get(entry.code) ?? 0) + 1));
      }
    }
    const names = new Map(meta.drivers.map((d) => [d.code, d]));
    const rates: DriverRate[] = codes
      .filter((code) => (seen.get(code) ?? 0) >= parts * 10)
      .map((code) => ({
        code,
        name: names.get(code)?.name ?? code,
        finish: names.get(code)?.finish ?? null,
        won: won.get(code) ?? 0,
        laps: Math.round((seen.get(code) ?? 0) / parts),
        rate: (won.get(code) ?? 0) / (seen.get(code) ?? 1),
      }))
      .sort((a, b) => b.rate - a.rate);
    return { rates, spread, cells, fieldSize: present / Math.max(cells, 1) };
  };

  const all = run(false);
  const clean = run(true);

  const sample = arcSampler(track.outline as Point[]);
  const cornerOf = (k: number): string => {
    const [x, y] = sample((k + 0.5) / parts);
    let best = '—';
    let bestDistance = Infinity;
    for (const corner of track.corners) {
      const d = Math.hypot(corner.x - x, corner.y - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = `T${corner.number}`;
      }
    }
    return best;
  };
  const partSpreads: PartSpread[] = all.spread
    .map((values, k) => ({
      part: k + 1,
      corner: cornerOf(k),
      seconds: values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1),
    }))
    .sort((a, b) => b.seconds - a.seconds);
  const totalSpread = partSpreads.reduce((sum, p) => sum + p.seconds, 0);
  const topShare = partSpreads.slice(0, 5).reduce((sum, p) => sum + p.seconds, 0) / totalSpread;

  const top = (list: DriverRate[]): string => list.slice(0, 4).map((r) => r.code).join();
  return {
    cells: all.cells,
    fieldSize: all.fieldSize,
    chance: 1 / all.fieldSize,
    rates: all.rates,
    cleanRates: clean.rates,
    sameOrder: top(all.rates) === top(clean.rates),
    parts: partSpreads,
    topShare,
    totalSpread,
  };
}
