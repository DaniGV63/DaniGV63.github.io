import { color as d3color, hcl, lab } from 'd3';
import { FALLBACK_COLOR, TEAM_LOGOS, type RaceData } from './types';

/**
 * Shared driver selection and colour assignment for every chart on the page.
 * Colours start from the team colour but are swapped for a high-contrast
 * palette when two selected drivers would be hard to tell apart (for example
 * team-mates).
 */

// Okabe-Ito colour-blind-safe palette plus two extra hues.
const PALETTE = [
  '#e69f00',
  '#56b4e9',
  '#00c389',
  '#f0e442',
  '#0072b2',
  '#d55e00',
  '#cc79a7',
  '#9be15d',
  '#c9c9c9',
];
const MIN_DISTANCE = 45; // CIE76 distance below which colours look alike

export const picker = { drivers: [] as string[], primary: '' };

const listeners = new Set<() => void>();
const assigned = new Map<string, string>();
let race: RaceData | null = null;

export function onChange(listener: () => void): void {
  listeners.add(listener);
}

function emit(): void {
  renderChips();
  listeners.forEach((listener) => listener());
}

export function isDarkTheme(): boolean {
  // Dark is the site default unless the visitor chose light.
  return document.documentElement.dataset.theme !== 'light';
}

/** Keep hue and chroma, move perceived lightness into a readable range. */
export function legible(hex: string): string {
  const base = d3color(hex);
  if (!base) return hex;
  const tone = hcl(base);
  tone.l = isDarkTheme() ? Math.max(tone.l, 62) : Math.min(tone.l, 55);
  return tone.formatHex();
}

function distance(a: string, b: string): number {
  const x = lab(a);
  const y = lab(b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

function teamColor(code: string): string {
  return race?.meta.drivers.find((d) => d.code === code)?.teamColor ?? FALLBACK_COLOR;
}

function assign(code: string): void {
  const taken = [...assigned.values()].map(legible);
  const candidates = [teamColor(code), ...PALETTE];
  const score = (hex: string): number =>
    taken.length === 0 ? Infinity : Math.min(...taken.map((t) => distance(legible(hex), t)));
  const good = candidates.find((hex) => score(hex) >= MIN_DISTANCE);
  const best = good ?? candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
  assigned.set(code, best);
}

/** Colour used for a driver in the charts (assigned while selected). */
export function colorFor(code: string): string {
  return legible(assigned.get(code) ?? teamColor(code));
}

export function initPicker(data: RaceData): void {
  if (race) return;
  race = data;
  const withLaps = new Set(data.laps.map((row) => row.driver));
  const available = data.meta.drivers.filter((d) => withLaps.has(d.code));
  const wanted = ['VER', 'HAM'].filter((c) => available.some((d) => d.code === c));
  const start = wanted.length === 2 ? wanted : available.slice(0, 2).map((d) => d.code);
  picker.drivers = [];
  start.forEach((code) => {
    picker.drivers.push(code);
    assign(code);
  });
  picker.primary = picker.drivers[0]!;

  document.getElementById('theme-toggle')?.addEventListener('click', () => setTimeout(emit, 0));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', emit);
  renderChips();
}

export function toggleDriver(code: string): void {
  const index = picker.drivers.indexOf(code);
  if (index >= 0) {
    if (picker.drivers.length === 1) return;
    picker.drivers.splice(index, 1);
    assigned.delete(code);
    if (picker.primary === code) picker.primary = picker.drivers[0]!;
  } else {
    picker.drivers.push(code);
    assign(code);
    picker.primary = code;
  }
  emit();
}

export function setPrimary(code: string): void {
  if (!picker.drivers.includes(code)) {
    picker.drivers.push(code);
    assign(code);
  }
  picker.primary = code;
  emit();
}

function renderChips(): void {
  const host = document.getElementById('f1-chips');
  if (!host || !race) return;
  const withLaps = new Set(race.laps.map((row) => row.driver));
  host.replaceChildren();
  for (const driver of race.meta.drivers.filter((d) => withLaps.has(d.code))) {
    const on = picker.drivers.includes(driver.code);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f1-chip';
    button.setAttribute('aria-pressed', String(on));
    button.title = `${driver.name} (${driver.team})`;
    const swatch = document.createElement('span');
    swatch.className = 'f1-chip__swatch';
    swatch.style.background = on ? colorFor(driver.code) : legible(teamColor(driver.code));
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
    button.addEventListener('click', () => toggleDriver(driver.code));
    host.append(button);
  }
}
