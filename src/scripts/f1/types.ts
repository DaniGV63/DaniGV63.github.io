export interface DriverMeta {
  code: string;
  name: string;
  team: string;
  teamColor: string | null;
  finish: number | null;
  status: string;
}

export interface RaceMeta {
  year: number;
  event: string;
  session: string;
  circuit: string;
  totalLaps: number;
  drivers: DriverMeta[];
}

export interface LapRow {
  driver: string;
  lap: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  lapTime: number | null;
  compound: string | null;
  tyreLife: number | null;
  pitIn: boolean;
  pitOut: boolean;
  isAccurate: boolean;
  position: number | null;
  trackStatus: string | null;
}

export interface TrackData {
  outline: [number, number][];
  sectorBoundaries: [number, number][];
  rotationDeg: number;
  corners: { number: string; x: number; y: number }[];
}

/** One driver lap: flat [x0, y0, x1, y1, ...] and the first index of S2 and S3. */
export interface PosLap {
  p: number[];
  s: [number, number];
}

export interface PosFile {
  driver: string;
  laps: Record<string, PosLap>;
}

/** Seconds spent in each equal-distance part of a lap, per lap number. */
export interface SegFile {
  driver: string;
  segments: number;
  laps: Record<string, number[]>;
}

export interface RaceData {
  folder: string;
  meta: RaceMeta;
  laps: LapRow[];
  track: TrackData;
}

export type YMode = 'delta' | 'raw';

export interface Selection {
  drivers: string[];
  driver: string;
  lap: number;
  yMode: YMode;
}

export const SECTOR_COLORS = ['#e10600', '#f5c518', '#3b82f6'] as const;
export const FALLBACK_COLOR = '#9aa0a6';

/** Team name in meta.json -> file in public/f1/ (see docs/F1_LOGOS.md). */
export const TEAM_LOGOS: Record<string, string> = {
  'Red Bull Racing': 'red-bull-racing',
  Mercedes: 'mercedes',
  Ferrari: 'ferrari',
  AlphaTauri: 'alphatauri',
  McLaren: 'mclaren',
  Alpine: 'alpine',
  'Aston Martin': 'aston-martin',
  Williams: 'williams',
  'Alfa Romeo Racing': 'alfa-romeo',
  'Haas F1 Team': 'haas',
};

export function formatLapTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(3).padStart(6, '0');
  return minutes > 0 ? `${minutes}:${rest}` : rest;
}

export function sectorValue(row: LapRow, index: number): number | null {
  return [row.s1, row.s2, row.s3][index] ?? null;
}
