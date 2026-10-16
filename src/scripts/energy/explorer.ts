import { quadtree, quantile, scaleLinear } from 'd3';

interface FeatureInfo {
  label: string;
  unit: string;
  scale: number;
}

interface Hours {
  start: string;
  t: number[];
  c: number[];
  local: (number | null)[];
  [feature: string]: unknown;
}

interface Meta {
  features: Record<string, FeatureInfo>;
  clusters: { id: number; name: string }[];
}

const MARGIN = { top: 14, right: 14, bottom: 40, left: 66 };
const HOUR_MS = 3_600_000;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const meta = JSON.parse(byId('grid-meta').textContent ?? '{}') as Meta;
const canvas = byId<HTMLCanvasElement>('grid-canvas');
const tooltip = byId('grid-tooltip');
const xSelect = byId<HTMLSelectElement>('grid-x');
const ySelect = byId<HTMLSelectElement>('grid-y');
const legendButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-cluster]'),
);
const context = canvas.getContext('2d')!;

const state = {
  x: xSelect.value,
  y: ySelect.value,
  active: new Set(meta.clusters.map((c) => c.id)),
};
let hours: Hours | null = null;
let tree: ReturnType<typeof quadtree<number>> | null = null;
let projected: { px: Float32Array; py: Float32Array } | null = null;

// Site colours use light-dark(), which a canvas cannot parse. Reading them back
// through a real element gives plain rgb() values for the current theme.
const probe = document.createElement('span');
probe.hidden = true;
canvas.parentElement!.append(probe);

const css = (name: string): string => {
  if (name.startsWith('--c') && /^--c\d$/.test(name)) {
    return getComputedStyle(canvas).getPropertyValue(name).trim() || '#888';
  }
  probe.style.color = `var(${name})`;
  return getComputedStyle(probe).color || '#888';
};

const column = (name: string): number[] => (hours![name] as number[]).map(Number);

/** Axis range that ignores the most extreme 0.2% at each end (price spikes). */
function trimmedExtent(values: number[]): [number, number] {
  const sorted = Float64Array.from(values).sort();
  return [quantile(sorted, 0.002)!, quantile(sorted, 0.998)!];
}

function tickText(value: number, scale: number, span: number): string {
  const shown = value * scale;
  if (scale === 100) return shown.toFixed(0);
  return shown.toLocaleString('en', { maximumFractionDigits: span * scale < 20 ? 1 : 0 });
}

function formatValue(name: string, value: number): string {
  const info = meta.features[name]!;
  const shown = value * info.scale;
  return info.scale === 100 ? `${shown.toFixed(0)}%` : `${shown.toFixed(1)} ${info.unit}`;
}

function formatTime(index: number): string {
  const when = new Date(Date.parse(hours!.start) + hours!.t[index]! * HOUR_MS);
  return when.toLocaleString('en-GB', {
    timeZone: 'Europe/Copenhagen',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function draw(): void {
  if (!hours) return;
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);

  const xs = column(state.x);
  const ys = column(state.y);
  const [x0, x1] = trimmedExtent(xs);
  const [y0, y1] = trimmedExtent(ys);
  const x = scaleLinear().domain([x0, x1]).nice().range([MARGIN.left, box.width - MARGIN.right]);
  const y = scaleLinear().domain([y0, y1]).nice().range([box.height - MARGIN.bottom, MARGIN.top]);

  const muted = css('--color-text-muted');
  const border = css('--color-border');
  context.font = `12px ${getComputedStyle(canvas).getPropertyValue('--font-mono').trim() || 'monospace'}`;
  context.fillStyle = muted;
  context.strokeStyle = border;
  context.lineWidth = 1;

  context.textAlign = 'center';
  for (const tick of x.ticks(6)) {
    context.beginPath();
    context.moveTo(x(tick), MARGIN.top);
    context.lineTo(x(tick), box.height - MARGIN.bottom);
    context.stroke();
    context.fillText(
      tickText(tick, meta.features[state.x]!.scale, x1 - x0),
      x(tick),
      box.height - MARGIN.bottom + 16,
    );
  }
  context.textAlign = 'right';
  for (const tick of y.ticks(6)) {
    context.beginPath();
    context.moveTo(MARGIN.left, y(tick));
    context.lineTo(box.width - MARGIN.right, y(tick));
    context.stroke();
    context.fillText(
      tickText(tick, meta.features[state.y]!.scale, y1 - y0),
      MARGIN.left - 8,
      y(tick) + 4,
    );
  }
  context.textAlign = 'center';
  context.fillText(
    `${meta.features[state.x]!.label} (${meta.features[state.x]!.scale === 100 ? '%' : meta.features[state.x]!.unit})`,
    (MARGIN.left + box.width - MARGIN.right) / 2,
    box.height - 6,
  );
  context.save();
  context.translate(14, (MARGIN.top + box.height - MARGIN.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(
    `${meta.features[state.y]!.label} (${meta.features[state.y]!.scale === 100 ? '%' : meta.features[state.y]!.unit})`,
    0,
    0,
  );
  context.restore();

  const domainX = x.domain() as [number, number];
  const domainY = y.domain() as [number, number];
  const hidden = xs.filter(
    (value, i) =>
      value < domainX[0] || value > domainX[1] || ys[i]! < domainY[0] || ys[i]! > domainY[1],
  ).length;
  byId('grid-note').textContent =
    hidden > 0
      ? `${hidden} extreme hours fall outside the axes and are not drawn.`
      : '';

  const clusters = hours.c;
  const px = new Float32Array(xs.length);
  const py = new Float32Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    px[i] = x(xs[i]!);
    py[i] = y(ys[i]!);
  }
  projected = { px, py };
  tree = quadtree<number>()
    .x((i) => px[i]!)
    .y((i) => py[i]!)
    .addAll(Array.from(xs.keys()));

  const allOn = state.active.size === meta.clusters.length;
  for (const pass of [false, true]) {
    for (let i = 0; i < xs.length; i++) {
      const on = state.active.has(clusters[i]!);
      if (on !== pass) continue;
      if (px[i]! < MARGIN.left - 2 || py[i]! > box.height - MARGIN.bottom + 2) continue;
      if (px[i]! > box.width - MARGIN.right + 2 || py[i]! < MARGIN.top - 2) continue;
      context.globalAlpha = allOn || on ? 0.5 : 0.06;
      context.fillStyle = css(`--c${clusters[i]}`);
      context.fillRect(px[i]! - 1.4, py[i]! - 1.4, 2.8, 2.8);
    }
  }
  context.globalAlpha = 1;
}

function showTooltip(event: PointerEvent): void {
  if (!hours || !tree || !projected) return;
  const box = canvas.getBoundingClientRect();
  const found = tree.find(event.clientX - box.left, event.clientY - box.top, 14);
  if (found === undefined || !state.active.has(hours.c[found]!)) {
    tooltip.hidden = true;
    return;
  }
  const local = hours.local[found];
  tooltip.textContent = [
    formatTime(found),
    `${meta.clusters.find((c) => c.id === hours!.c[found])?.name ?? ''}`,
    `${meta.features[state.x]!.label}: ${formatValue(state.x, column(state.x)[found]!)}`,
    `${meta.features[state.y]!.label}: ${formatValue(state.y, column(state.y)[found]!)}`,
    local === null || local === undefined
      ? 'Aarhus coverage: no data'
      : `Aarhus coverage: ${(local * 100).toFixed(0)}%`,
  ].join('\n');
  tooltip.hidden = false;
  const left = Math.min(event.clientX - box.left + 14, box.width - tooltip.offsetWidth);
  tooltip.style.left = `${Math.max(left, 0)}px`;
  tooltip.style.top = `${Math.max(event.clientY - box.top - tooltip.offsetHeight - 10, 0)}px`;
}

function toggle(id: number): void {
  if (state.active.size === meta.clusters.length) {
    state.active = new Set([id]);
  } else if (state.active.has(id)) {
    state.active.delete(id);
    if (state.active.size === 0) state.active = new Set(meta.clusters.map((c) => c.id));
  } else {
    state.active.add(id);
  }
  legendButtons.forEach((button) =>
    button.setAttribute(
      'aria-pressed',
      String(
        state.active.size === meta.clusters.length ||
          state.active.has(Number(button.dataset.cluster)),
      ),
    ),
  );
  draw();
}

const url = canvas.dataset.src!;
fetch(url)
  .then((response) => response.json() as Promise<Hours>)
  .then((loaded) => {
    hours = loaded;
    byId('grid-status').hidden = true;
    draw();
  })
  .catch(() => {
    byId('grid-status').textContent = 'The hourly data could not be loaded.';
  });

xSelect.addEventListener('change', () => {
  state.x = xSelect.value;
  draw();
});
ySelect.addEventListener('change', () => {
  state.y = ySelect.value;
  draw();
});
legendButtons.forEach((button) =>
  button.addEventListener('click', () => toggle(Number(button.dataset.cluster))),
);
canvas.addEventListener('pointermove', showTooltip);
canvas.addEventListener('pointerleave', () => {
  tooltip.hidden = true;
});
new ResizeObserver(() => draw()).observe(canvas);
document.getElementById('theme-toggle')?.addEventListener('click', () => setTimeout(draw, 0));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
