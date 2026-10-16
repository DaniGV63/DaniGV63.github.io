import { renderPace, type PaceView } from './paceChart';
import { colorFor, initPicker, onChange, picker } from './picker';
import { formatLapTime, sectorValue, type LapRow, type RaceData } from './types';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const data = JSON.parse(byId('f1-data').textContent ?? '{}') as RaceData;
initPicker(data);

const chartBox = byId('pace-chart');
const tooltip = byId('pace-tooltip');
const tableBody = byId('pace-table-body');
const caption = byId('pace-caption');
const legend = byId('pace-drivers');
const state = { view: 'lap' as PaceView, lap: null as number | null };

/** Best finisher first: the gap view is measured against this driver. */
function ordered(): string[] {
  const finish = (code: string): number =>
    data.meta.drivers.find((d) => d.code === code)?.finish ?? 99;
  return [...picker.drivers].sort((a, b) => finish(a) - finish(b));
}

function renderTable(drivers: string[]): void {
  tableBody.replaceChildren();
  if (state.lap === null) {
    caption.textContent = 'Click a lap in the chart to see its sector times.';
    return;
  }
  caption.textContent = `Lap ${state.lap}, selected drivers (best sector highlighted)`;
  const rows = drivers
    .map((code) => data.laps.find((r) => r.driver === code && r.lap === state.lap))
    .filter((row): row is LapRow => row !== undefined);
  const bests = [0, 1, 2].map((i) =>
    Math.min(...rows.map((r) => sectorValue(r, i)).filter((v): v is number => v !== null)),
  );
  for (const row of rows) {
    const tr = document.createElement('tr');
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

function renderLegend(drivers: string[]): void {
  legend.replaceChildren();
  for (const code of drivers) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.style.background = colorFor(code);
    item.append(swatch, code);
    legend.append(item);
  }
}

function render(): void {
  const drivers = ordered();
  renderLegend(drivers);
  renderPace({
    container: chartBox,
    tooltip,
    laps: data.laps,
    totalLaps: data.meta.totalLaps,
    drivers,
    colors: new Map(drivers.map((code) => [code, colorFor(code)])),
    view: state.view,
    selectedLap: state.lap,
    onPick: (lap) => {
      state.lap = state.lap === lap ? null : lap;
      render();
    },
  });
  renderTable(drivers);
}

byId<HTMLSelectElement>('pace-view').addEventListener('change', (event) => {
  state.view = (event.target as HTMLSelectElement).value as PaceView;
  render();
});
chartBox.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const step = event.key === 'ArrowRight' ? 1 : -1;
  state.lap = Math.min(Math.max((state.lap ?? 0) + step, 1), data.meta.totalLaps);
  render();
});
new ResizeObserver(() => render()).observe(chartBox);
onChange(render);
render();
