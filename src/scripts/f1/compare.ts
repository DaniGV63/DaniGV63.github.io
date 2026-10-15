import { arcSampler, type Point } from './circuit';
import {
  opacityFor,
  renderRows,
  type LapResult,
  type PartResult,
} from './compareRows';
import { colorFor, initPicker, onChange, picker } from './picker';
import { createStacked, type StackedView } from './stackedCircuit';
import { createSweepMap, type PartStyle, type SweepMap } from './sweepMap';
import { formatLapTime, type LapRow, type RaceData, type SegFile } from './types';

const segUrls = import.meta.glob('../../data/f1/*/seg/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const data = JSON.parse(byId('f1-data').textContent ?? '{}') as RaceData;
initPicker(data);

const lapIndex = new Map<string, LapRow>(data.laps.map((r) => [`${r.driver}-${r.lap}`, r]));
const rowsBox = byId('cmp-rows');
const rowsTip = byId('cmp-tooltip');
const mapBox = byId('cmp-map');
const infoBox = byId('cmp-info');
const legend = byId('cmp-legend');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SWEEP_MS = 1500;
const FLIP_MS = 900;
const state = { lap: null as number | null, mode: '2d' as '2d' | '3d' };
const modeButtons = {
  '2d': byId<HTMLButtonElement>('cmp-mode-2d'),
  '3d': byId<HTMLButtonElement>('cmp-mode-3d'),
};
const hint3d = byId('cmp-hint3d');

const segCache = new Map<string, Promise<SegFile>>();
function loadSegments(code: string): Promise<SegFile> {
  let request = segCache.get(code);
  if (!request) {
    const url = segUrls[`../../data/f1/${data.folder}/seg/${code}.json`];
    if (!url) return Promise.reject(new Error(`No segment file for ${code}`));
    request = fetch(url).then((r) => r.json() as Promise<SegFile>);
    segCache.set(code, request);
  }
  return request;
}

let map: SweepMap | null = null;
let stacked: StackedView | null = null;
let segments = 25;
let cornerOf: string[] = [];
let laps = new Map<number, LapResult | null>();
let codes: string[] = [];
let token = 0;

function nearestCorners(count: number): string[] {
  const sample = arcSampler(data.track.outline as Point[]);
  return Array.from({ length: count }, (_, k) => {
    const [x, y] = sample((k + 0.5) / count);
    let best = '—';
    let bestDistance = Infinity;
    for (const corner of data.track.corners) {
      const d = Math.hypot(corner.x - x, corner.y - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = `T${corner.number}`;
      }
    }
    return best;
  });
}

function sectorFractions(): number[] {
  const sample = arcSampler(data.track.outline as Point[]);
  return data.track.sectorBoundaries.map(([bx, by]) => {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i <= 800; i++) {
      const [x, y] = sample(i / 800);
      const d = Math.hypot(x - bx!, y - by!);
      if (d < bestDistance) {
        bestDistance = d;
        best = i / 800;
      }
    }
    return best;
  });
}

function flagFor(lap: number): string {
  const rows = codes.map((c) => lapIndex.get(`${c}-${lap}`));
  if (rows.some((r) => r?.pitIn || r?.pitOut)) return 'P';
  if (rows.some((r) => r?.trackStatus?.includes('4'))) return 'SC';
  return '';
}

function compareLap(lap: number, files: SegFile[]): LapResult | null {
  const perDriver = files.map((file) => {
    const times = file.laps[String(lap)];
    return times && times.length === segments ? times : null;
  });
  if (perDriver.filter(Boolean).length < 2) return null;

  const parts: PartResult[] = Array.from({ length: segments }, (_, k) => {
    const times = perDriver.map((t) => (t ? t[k]! : null));
    const present = times
      .map((time, i) => ({ time, i }))
      .filter((e): e is { time: number; i: number } => e.time !== null)
      .sort((a, b) => a.time - b.time);
    const margin = present[1]!.time - present[0]!.time;
    return { winner: margin < 0.0005 ? -1 : present[0]!.i, margin, times };
  });

  const lapTimes = codes
    .map((code, i) => ({ i, time: lapIndex.get(`${code}-${lap}`)?.lapTime ?? null }))
    .filter((e): e is { i: number; time: number } => e.time !== null && perDriver[e.i] !== null)
    .sort((a, b) => a.time - b.time);
  const leader = lapTimes[0]?.i ?? 0;
  const gap = lapTimes.length > 1 ? lapTimes[1]!.time - lapTimes[0]!.time : 0;
  return { parts, flag: flagFor(lap), leader, leaderGap: gap };
}

async function refresh(): Promise<void> {
  const mine = ++token;
  codes = [...picker.drivers];
  if (codes.length < 2) {
    laps = new Map();
    draw();
    return;
  }
  const files = await Promise.all(codes.map(loadSegments));
  if (mine !== token) return;
  segments = files[0]!.segments;
  cornerOf = nearestCorners(segments);
  laps = new Map();
  for (let lap = 1; lap <= data.meta.totalLaps; lap++) {
    laps.set(lap, compareLap(lap, files));
  }
  if (!map) map = createSweepMap(mapBox, data.track, segments);
  if (!stacked) {
    stacked = createStacked(mapBox, data.track, segments, data.meta.totalLaps);
  }
  draw();
}

/** Colour of the car: lap leader of the selected lap, else fastest driver overall. */
function carColor(): string {
  const palette = colors();
  if (state.lap !== null) {
    const result = laps.get(state.lap);
    if (result) return palette[result.leader] ?? palette[0]!;
  }
  let best = Infinity;
  let index = 0;
  codes.forEach((code, i) => {
    for (let lap = 1; lap <= data.meta.totalLaps; lap++) {
      const row = lapIndex.get(`${code}-${lap}`);
      if (row?.isAccurate && row.lapTime !== null && row.lapTime < best) {
        best = row.lapTime;
        index = i;
      }
    }
  });
  return palette[index] ?? palette[0]!;
}

function colors(): string[] {
  return codes.map(colorFor);
}

function partStyles(result: LapResult): PartStyle[] {
  const palette = colors();
  return result.parts.map((part, k) => ({
    color: part.winner < 0 ? 'var(--f1-muted)' : palette[part.winner]!,
    opacity: part.winner < 0 ? 0.6 : opacityFor(part.margin),
    label:
      part.winner < 0
        ? `Part ${k + 1} · near ${cornerOf[k]} · level`
        : `Part ${k + 1} · near ${cornerOf[k]} · ${codes[part.winner]} fastest by ${part.margin.toFixed(3)} s`,
  }));
}

function updateLegend(): void {
  legend.replaceChildren();
  codes.forEach((code, i) => {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.style.background = colors()[i]!;
    item.append(swatch, code);
    legend.append(item);
  });
  const current = state.lap !== null ? laps.get(state.lap) : null;
  if (current?.parts.some((part) => part.winner < 0)) {
    const equal = document.createElement('li');
    const equalSwatch = document.createElement('span');
    equalSwatch.style.background = 'var(--f1-muted)';
    equal.append(equalSwatch, 'same time');
    legend.append(equal);
  }
  const note = document.createElement('li');
  note.className = 'cmp-legend__note';
  note.textContent = 'each part is coloured by its fastest driver · stronger = bigger margin';
  legend.append(note);
}

function draw(): void {
  updateLegend();
  if (codes.length < 2) {
    rowsBox.replaceChildren();
    const message = document.createElement('p');
    message.className = 'cmp__empty';
    message.textContent = 'Select at least two drivers above to compare them.';
    rowsBox.append(message);
    map?.clear();
    infoBox.replaceChildren();
    if (state.mode === '3d') setMode('2d');
    return;
  }
  stacked?.setData(laps, colors());
  stacked?.setSelected(state.lap);
  map?.setCarColor(carColor());
  stacked?.setCarColor(carColor());
  renderRows({
    container: rowsBox,
    tooltip: rowsTip,
    totalLaps: data.meta.totalLaps,
    segments,
    laps,
    selectedLap: state.lap,
    codes,
    colors: colors(),
    cornerOf,
    sectors: sectorFractions(),
    onPick: pickLap,
  });
  if (state.lap !== null) showLap(state.lap, false);
  else showNothing();
}

function line(parent: HTMLElement, label: string, value: string, color?: string): void {
  const row = document.createElement('div');
  row.className = 'cmp-info__row';
  const name = document.createElement('span');
  name.textContent = label;
  if (color) name.style.color = color;
  const text = document.createElement('strong');
  text.textContent = value;
  row.append(name, text);
  parent.append(row);
}

function tyre(code: string, lap: number): string {
  const row = lapIndex.get(`${code}-${lap}`);
  if (!row?.compound) return '—';
  return `${row.compound[0]}${row.tyreLife ? `·${row.tyreLife}` : ''}`;
}

function showNothing(): void {
  map?.clear();
  infoBox.replaceChildren();
  const note = document.createElement('p');
  note.textContent = 'Pick a lap on the left to colour the circuit.';
  infoBox.append(note);
}

function showLap(lap: number, animate: boolean): void {
  const result = laps.get(lap) ?? null;
  infoBox.replaceChildren();
  if (!result || !map) {
    map?.clear();
    const note = document.createElement('p');
    note.textContent = `Lap ${lap}: not enough comparable data for the selected drivers.`;
    infoBox.append(note);
    return;
  }
  map.setStyles(partStyles(result));
  if (state.mode === '3d') map.showAll(); // 3D only highlights the lap
  else if (animate) map.play(reducedMotion ? 0 : SWEEP_MS);
  else map.showAll();

  const palette = colors();
  const title = document.createElement('h4');
  title.textContent = `Lap ${lap}${result.flag === 'P' ? ' · pit stop' : result.flag === 'SC' ? ' · safety car' : ''}`;
  infoBox.append(title);

  const wins = codes.map((_, i) => result.parts.filter((p) => p.winner === i).length);
  const best = Math.min(
    ...codes.map((c) => lapIndex.get(`${c}-${lap}`)?.lapTime ?? Infinity),
  );
  const order = codes
    .map((code, i) => ({ code, i, time: lapIndex.get(`${code}-${lap}`)?.lapTime ?? null }))
    .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
  for (const entry of order) {
    const gap = entry.time !== null && Number.isFinite(best) ? entry.time - best : null;
    line(
      infoBox,
      entry.code,
      `${formatLapTime(entry.time)}${gap ? `  +${gap.toFixed(3)}` : ''} · ${wins[entry.i]} parts · ${tyre(entry.code, lap)}`,
      palette[entry.i],
    );
  }

  const swing = result.parts.reduce(
    (top, part, k) => (part.margin > result.parts[top]!.margin ? k : top),
    0,
  );
  const big = result.parts[swing]!;
  if (big.winner >= 0) {
    line(
      infoBox,
      'Biggest margin',
      `${codes[big.winner]} +${big.margin.toFixed(3)} s near ${cornerOf[swing]}`,
    );
  }
}

function pickLap(lap: number): void {
  if (state.lap === lap) {
    state.lap = null; // clicking the same lap again clears the selection
    draw();
    return;
  }
  state.lap = lap;
  draw();
  if (state.mode === '3d') stacked?.play(reducedMotion ? 0 : SWEEP_MS, lap);
  else showLap(lap, true);
}

function setMode(next: '2d' | '3d'): void {
  if (next === state.mode || !stacked) return;
  if (next === '3d' && codes.length < 2) return;
  state.mode = next;
  (Object.keys(modeButtons) as ('2d' | '3d')[]).forEach((key) =>
    modeButtons[key].setAttribute('aria-pressed', String(key === next)),
  );
  hint3d.hidden = next !== '3d';
  const flip = reducedMotion ? 0 : FLIP_MS;
  const width = mapBox.getBoundingClientRect().width;
  const svgBox = mapBox.querySelector('svg')?.getBoundingClientRect();
  const flatHeight = svgBox?.height ?? mapBox.getBoundingClientRect().height;
  if (next === '3d') {
    mapBox.style.height = `${flatHeight}px`;
    mapBox.classList.add('is-3d');
    requestAnimationFrame(() => {
      mapBox.style.height = `${Math.round(Math.max(width * 0.95, flatHeight))}px`;
    });
    stacked.enter(flip, reducedMotion ? 0 : SWEEP_MS);
  } else {
    mapBox.style.height = `${Math.round(flatHeight)}px`;
    stacked.exit(flip, () => {
      mapBox.classList.remove('is-3d');
      mapBox.style.height = '';
    });
  }
}

modeButtons['2d'].addEventListener('click', () => setMode('2d'));
modeButtons['3d'].addEventListener('click', () => setMode('3d'));
rowsBox.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const step = event.key === 'ArrowDown' ? 1 : -1;
  pickLap(Math.min(Math.max((state.lap ?? 0) + step, 1), data.meta.totalLaps));
});
new ResizeObserver(() => laps.size > 0 && codes.length > 1 && draw()).observe(rowsBox);
onChange(() => void refresh());

void refresh();
