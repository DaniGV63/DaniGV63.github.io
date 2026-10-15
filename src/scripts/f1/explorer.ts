import { renderLapsChart } from './lapsChart';
import { renderTrackMap } from './trackMap';
import {
  FALLBACK_COLOR,
  TEAM_LOGOS,
  formatLapTime,
  sectorValue,
  type LapRow,
  type PosFile,
  type RaceData,
  type Selection,
  type YMode,
} from './types';

// Position files are emitted as separate assets and fetched on demand.
const posUrls = import.meta.glob('../../data/f1/*/pos/*.json', {
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
const codes = new Set(data.laps.map((row) => row.driver));
const classified = data.meta.drivers.filter((d) => codes.has(d.code));
const colors = new Map(classified.map((d) => [d.code, d.teamColor ?? FALLBACK_COLOR]));

function fastestLapOf(driver: string): number {
  const rows = data.laps.filter((r) => r.driver === driver && r.isAccurate && r.lapTime);
  const best = rows.sort((a, b) => a.lapTime! - b.lapTime!)[0];
  return best?.lap ?? 1;
}

const top = classified.slice(0, 3).map((d) => d.code);
const selection: Selection = {
  drivers: top,
  driver: top[0]!,
  lap: fastestLapOf(top[0]!),
  yMode: 'delta',
};

const posCache = new Map<string, Promise<PosFile>>();
function loadPositions(code: string): Promise<PosFile> {
  const key = `../../data/f1/${data.folder}/pos/${code}.json`;
  let request = posCache.get(code);
  if (!request) {
    const url = posUrls[key];
    if (!url) return Promise.reject(new Error(`No position file for ${code}`));
    request = fetch(url).then((response) => response.json() as Promise<PosFile>);
    posCache.set(code, request);
  }
  return request;
}

const chartBox = byId('f1-laps-chart');
const mapBox = byId('f1-track-map');
const tooltip = byId('f1-tooltip');
const slider = byId<HTMLInputElement>('f1-lap');
const readout = byId('f1-lap-out');
const chips = byId('f1-chips');
const tableBody = byId('f1-table-body');
const mapTitle = byId('f1-map-title');

function pick(driver: string, lap: number): void {
  if (!selection.drivers.includes(driver)) selection.drivers.push(driver);
  selection.driver = driver;
  selection.lap = lap;
  render();
}

function renderChips(): void {
  chips.replaceChildren();
  for (const driver of classified) {
    const on = selection.drivers.includes(driver.code);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f1-chip';
    button.setAttribute('aria-pressed', String(on));
    button.title = `${driver.name} (${driver.team})`;
    const swatch = document.createElement('span');
    swatch.className = 'f1-chip__swatch';
    swatch.style.background = colors.get(driver.code) ?? FALLBACK_COLOR;
    button.append(swatch);
    const logo = TEAM_LOGOS[driver.team];
    if (logo) {
      const image = document.createElement('img');
      image.src = `/f1/${logo}.png`;
      image.alt = '';
      image.width = 20;
      image.height = 20;
      image.className = 'f1-chip__logo';
      button.append(image);
    }
    button.append(driver.code);
    button.addEventListener('click', () => {
      const index = selection.drivers.indexOf(driver.code);
      if (index >= 0 && selection.drivers.length > 1) selection.drivers.splice(index, 1);
      else if (index < 0) selection.drivers.push(driver.code);
      if (!selection.drivers.includes(selection.driver)) selection.driver = selection.drivers[0]!;
      render();
    });
    chips.append(button);
  }
}

function renderTable(): void {
  const rows = selection.drivers
    .map((code) => data.laps.find((r) => r.driver === code && r.lap === selection.lap))
    .filter((row): row is LapRow => row !== undefined);
  const bests = [0, 1, 2].map((i) =>
    Math.min(...rows.map((r) => sectorValue(r, i)).filter((v): v is number => v !== null)),
  );
  tableBody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.driver === selection.driver) tr.className = 'is-primary';
    const cells = [
      row.driver,
      ...[0, 1, 2].map((i) => sectorValue(row, i)?.toFixed(3) ?? '—'),
      formatLapTime(row.lapTime),
      row.compound ? `${row.compound[0]}${row.tyreLife ? ` · ${row.tyreLife}` : ''}` : '—',
    ];
    cells.forEach((text, index) => {
      const td = document.createElement('td');
      td.textContent = text;
      const sector = index - 1;
      if (sector >= 0 && sector <= 2 && sectorValue(row, sector) === bests[sector]) {
        td.className = 'is-best';
      }
      tr.append(td);
    });
    tableBody.append(tr);
  }
}

async function renderMap(): Promise<void> {
  const { driver, lap } = selection;
  mapTitle.textContent = `${driver} · lap ${lap}`;
  renderTrackMap({ container: mapBox, track: data.track, lap: null, loading: true });
  try {
    const file = await loadPositions(driver);
    if (selection.driver !== driver || selection.lap !== lap) return;
    renderTrackMap({
      container: mapBox,
      track: data.track,
      lap: file.laps[String(lap)] ?? null,
      loading: false,
    });
  } catch {
    renderTrackMap({ container: mapBox, track: data.track, lap: null, loading: false });
  }
}

function render(): void {
  slider.value = String(selection.lap);
  readout.textContent = `Lap ${selection.lap} / ${data.meta.totalLaps}`;
  renderChips();
  renderLapsChart({
    container: chartBox,
    tooltip,
    laps: data.laps,
    selection,
    colors,
    onPick: pick,
  });
  renderTable();
  void renderMap();
}

function stepLap(delta: number): void {
  const next = Math.min(Math.max(selection.lap + delta, 1), data.meta.totalLaps);
  if (next !== selection.lap) pick(selection.driver, next);
}

slider.max = String(data.meta.totalLaps);
slider.addEventListener('input', () => pick(selection.driver, Number(slider.value)));
byId('f1-prev').addEventListener('click', () => stepLap(-1));
byId('f1-next').addEventListener('click', () => stepLap(1));
byId<HTMLSelectElement>('f1-ymode').addEventListener('change', (event) => {
  selection.yMode = (event.target as HTMLSelectElement).value as YMode;
  render();
});
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  if (event.key === 'ArrowLeft') stepLap(-1);
  if (event.key === 'ArrowRight') stepLap(1);
});
new ResizeObserver(() => render()).observe(chartBox);

render();
