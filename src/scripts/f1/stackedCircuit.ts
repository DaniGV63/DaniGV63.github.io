import { carFill, CAR_PARTS, CAR_SCALE } from './carIcon';
import { circuitView, finishLine, type Point } from './circuit';
import { opacityFor, type LapResult } from './compareRows';
import type { TrackData } from './types';

const SUB = 6; // points per part
const BASE_YAW = -0.55;
const BASE_PITCH = 1.0;
const carPaths = CAR_PARTS.map((part) => ({ path: new Path2D(part.d), fill: part.fill }));

export interface StackedView {
  setData(laps: Map<number, LapResult | null>, colors: string[]): void;
  setSelected(lap: number | null): void;
  setCarColor(color: string): void;
  /** Fan the laps out into a 3D stack, then sweep colour with a car on lap 1. */
  enter(durationMs: number, sweepMs: number): void;
  exit(durationMs: number, done: () => void): void;
  /** Sweep colour over every lap ("all") or over one lap only. */
  play(sweepMs: number, target: number | 'all'): void;
  resetCamera(): void;
  readonly active: boolean;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Resolve a CSS value such as `var(--f1-line)` (with light-dark) to rgb(). */
function cssColor(host: HTMLElement, value: string): string {
  const probe = document.createElement('i');
  probe.style.color = value;
  host.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

/**
 * All laps of a race drawn as a stack of circuit loops (lap 1 on top), seen
 * with an orbiting camera that always frames the whole stack. At progress 0 it
 * is the flat top-down map of the selected lap, so switching from the SVG map
 * is seamless.
 */
export function createStacked(
  container: HTMLElement,
  track: TrackData,
  segments: number,
  totalLaps: number,
): StackedView {
  const view = circuitView(track);
  const { outline, corners, sample, stroke } = view;
  const reach = Math.max(view.width, view.height);
  const cx = view.minX + view.width / 2;
  const cy = view.minY + view.height / 2;
  const flag = finishLine(view);

  const canvas = document.createElement('canvas');
  canvas.className = 'cmp-canvas';
  container.append(canvas);
  const ctx = canvas.getContext('2d')!;

  let laps = new Map<number, LapResult | null>();
  let colors: string[] = [];
  let selected: number | null = null;
  let carColor = '#dc0000';
  let active = false;
  let m = 0; // 0 = flat 2D, 1 = full 3D stack
  let sweep = 1; // colour reveal progress, 0..1
  let sweepTarget: number | 'all' | null = null; // which lap(s) are sweeping
  const camera = { yaw: BASE_YAW, pitch: BASE_PITCH, zoom: 1, panX: 0, panY: 0 };
  let raf = 0;

  /** Camera transform before fitting: world point -> unscaled screen units. */
  function raw(x: number, y: number, z: number): [number, number, number] {
    const yaw = camera.yaw * m;
    const pitch = camera.pitch * m;
    const dx = x - cx;
    const dy = y - cy;
    const x1 = dx * Math.cos(yaw) - dy * Math.sin(yaw);
    const y1 = dx * Math.sin(yaw) + dy * Math.cos(yaw);
    const sy = y1 * Math.cos(pitch) - z * Math.sin(pitch);
    const depth = y1 * Math.sin(pitch) + z * Math.cos(pitch);
    const focal = reach * 2.4;
    const persp = focal / (focal - depth);
    return [x1 * persp, sy * persp, persp];
  }

  function size(): [number, number, number] {
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    return [w, h, bw / Math.max(w, 1)];
  }

  function draw(): void {
    raf = 0;
    if (!active && m === 0) return;
    const [w, h, dpr] = size();
    const bottomPlane = m === 0 ? 0 : (reach * 0.62 * m) / 2;
    const stack = (reach * 0.62 * m) / Math.max(totalLaps - 1, 1);
    const zOf = (lap: number): number => (totalLaps - lap) * stack - ((totalLaps - 1) * stack) / 2;

    // Fit: blend from the SVG framing (m = 0) to "whole stack in view" (m = 1).
    const flatScale = Math.min(w / view.width, h / view.height);
    const ext = [view.minX, view.minX + view.width]
      .flatMap((x) => [view.minY, view.minY + view.height].map((y) => [x, y] as Point))
      .flatMap(([x, y]) => [raw(x, y, bottomPlane), raw(x, y, -bottomPlane)]);
    const xs = ext.map((p) => p[0]);
    const ys = ext.map((p) => p[1]);
    const ex0 = Math.min(...xs);
    const ex1 = Math.max(...xs);
    const ey0 = Math.min(...ys);
    const ey1 = Math.max(...ys);
    const autoScale = Math.min((w * 0.9) / (ex1 - ex0), (h * 0.86) / (ey1 - ey0));
    const scale = (flatScale + (autoScale - flatScale) * m) * camera.zoom;
    const midX = ((ex0 + ex1) / 2) * m;
    const midY = ((ey0 + ey1) / 2) * m;
    const project = (x: number, y: number, z: number): [number, number, number] => {
      const [px, py, persp] = raw(x, y, z);
      return [
        w / 2 + camera.panX * m + (px - midX) * scale,
        h / 2 + camera.panY * m + (py - midY) * scale,
        persp * scale,
      ];
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0.5, 0.5, w - 1, h - 1);
    ctx.clip();

    const line = cssColor(container, 'var(--f1-line)');
    const muted = cssColor(container, 'var(--f1-muted)');
    const ink = cssColor(container, 'var(--f1-ink)');

    // top lap plane: base ring, like the flat map
    const topZ = zOf(1);
    const [, , baseScale] = project(cx, cy, topZ);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    outline.forEach(([x, y], i) => {
      const [px, py] = project(x, y, topZ);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = stroke * 2.4 * baseScale * (1 - 0.6 * m);
    ctx.stroke();

    const thin = 1 - 0.72 * m;
    ctx.lineCap = 'butt';
    for (let lap = totalLaps; lap >= 1; lap--) {
      const result = laps.get(lap);
      if (!result) continue;
      const isSelected = lap === selected;
      const sweeping = sweepTarget === 'all' || sweepTarget === lap;
      const reveal = sweeping ? sweep : 1;
      const planeAlpha = isSelected ? 1 : m * (selected === null ? 0.9 : 0.55);
      if (planeAlpha <= 0) continue;
      const z = zOf(lap);
      const glow = isSelected && m > 0.05;
      ctx.lineWidth = stroke * thin * (isSelected ? 1 + 1.6 * m : 1) * baseScale;
      if (glow) {
        // soft halo under the selected lap so it stands out from the stack
        ctx.save();
        ctx.lineWidth = stroke * thin * 5.2 * baseScale;
        ctx.strokeStyle = ink;
        ctx.globalAlpha = 0.16 * m * reveal;
        ctx.beginPath();
        const upTo = Math.max(1, Math.round(segments * SUB * reveal));
        for (let j = 0; j <= upTo; j++) {
          const [px, py] = project(...sample(j / (segments * SUB)), z);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }
      result.parts.forEach((part, k) => {
        const portion = clamp(reveal * segments - k, 0, 1);
        if (portion <= 0) return;
        const steps = Math.max(1, Math.ceil(SUB * portion));
        ctx.beginPath();
        for (let j = 0; j <= steps; j++) {
          const f = (k + (portion * j) / steps) / segments;
          const [px, py] = project(...sample(f), z);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = part.winner < 0 ? muted : (colors[part.winner] ?? muted);
        ctx.globalAlpha = planeAlpha * (part.winner < 0 ? 0.65 : opacityFor(part.margin));
        if (glow) {
          ctx.shadowColor = ctx.strokeStyle as string;
          ctx.shadowBlur = 14 * m;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    }

    // chequered start line (thin white border so it stands out) on the top lap
    ctx.globalAlpha = 1;
    for (const check of flag.checks) {
      ctx.beginPath();
      check.corners.forEach(([x, y], index) => {
        const [px, py] = project(x, y, topZ);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = check.dark ? '#111111' : '#f5f5f5';
      ctx.fill();
    }
    ctx.beginPath();
    flag.border.forEach(([x, y], index) => {
      const [px, py] = project(x, y, topZ);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // corner numbers belong to the flat map; they fade out as the stack opens
    if (m < 1) {
      ctx.globalAlpha = 1 - m;
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.max(9, stroke * 3.2 * baseScale)}px ui-monospace, Consolas, monospace`;
      track.corners.forEach((c, i) => {
        const [px, py] = project(corners[i]![0], corners[i]![1], topZ);
        ctx.fillText(c.number, px, py);
      });
      ctx.globalAlpha = 1;
    }

    // only the selected lap is labelled in the stack
    if (m > 0.6 && selected !== null) {
      ctx.globalAlpha = (m - 0.6) / 0.4;
      ctx.fillStyle = ink;
      ctx.font = '700 12px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const left = outline.reduce((p, q) => (q[0] < p[0] ? q : p));
      const [tx, ty] = project(left[0], left[1], zOf(selected));
      ctx.fillText(`Lap ${selected}`, tx - 14, ty);
      ctx.globalAlpha = 1;
    }

    if (sweepTarget !== null && sweep < 1) {
      // the car runs the lap that is being coloured (the top lap for "all")
      const carLap = sweepTarget === 'all' ? 1 : sweepTarget;
      const f = clamp(sweep, 0, 1);
      const here = sample(f);
      const z = zOf(carLap);
      const [px, py, sc] = project(here[0], here[1], z);
      const ahead = sample(Math.min(f + 0.004, 1));
      const behind = sample(Math.max(f - 0.004, 0));
      const [ax, ay] = project(ahead[0], ahead[1], z);
      const [bx, by] = project(behind[0], behind[1], z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(ay - by, ax - bx));
      const unit = stroke * CAR_SCALE * sc * (1 - 0.2 * m);
      ctx.scale(unit, unit);
      ctx.globalAlpha = 1;
      for (const part of carPaths) {
        ctx.fillStyle = carFill(part.fill, carColor);
        ctx.fill(part.path);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function request(): void {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function tween(set: (t: number) => void, durationMs: number, done?: () => void): void {
    if (durationMs <= 0) {
      set(1);
      request();
      done?.();
      return;
    }
    const startedAt = performance.now();
    const step = (now: number): void => {
      const t = clamp((now - startedAt) / durationMs, 0, 1);
      set(t);
      draw();
      if (t < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  // Orbit (drag), pan (right-drag / shift-drag), zoom (wheel, pinch).
  const pointers = new Map<number, [number, number]>();
  let pinch = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (!active || m < 0.5) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a![0] - b![0], a![1] - b![1]);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last[0];
    const dy = e.clientY - last[1];
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const now = Math.hypot(a![0] - b![0], a![1] - b![1]);
      if (pinch > 0) camera.zoom = clamp(camera.zoom * (now / pinch), 0.5, 4);
      pinch = now;
    } else if (e.buttons === 2 || e.shiftKey) {
      camera.panX += dx;
      camera.panY += dy;
    } else {
      camera.yaw += dx * 0.008;
      camera.pitch = clamp(camera.pitch + dy * 0.006, 0.12, 1.5);
    }
    request();
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!active || m < 0.5) return;
      e.preventDefault();
      camera.zoom = clamp(camera.zoom * Math.exp(-e.deltaY * 0.0012), 0.5, 4);
      request();
    },
    { passive: false },
  );
  canvas.addEventListener('dblclick', () => handle.resetCamera());
  new ResizeObserver(request).observe(container);

  const handle: StackedView = {
    get active() {
      return active;
    },
    setData(next, palette) {
      laps = next;
      colors = palette;
      request();
    },
    setSelected(lap) {
      selected = lap;
      request();
    },
    setCarColor(color) {
      carColor = color;
      request();
    },
    enter(durationMs, sweepMs) {
      active = true;
      sweepTarget = null;
      sweep = 1;
      tween(
        (t) => {
          m = ease(t);
        },
        durationMs,
        () => {
          m = 1;
          if (sweepMs > 0) handle.play(sweepMs, 'all');
        },
      );
    },
    exit(durationMs, done) {
      sweepTarget = null;
      sweep = 1;
      const from = m;
      tween(
        (t) => {
          m = from * (1 - ease(t));
        },
        durationMs,
        () => {
          m = 0;
          active = false;
          done();
          request();
        },
      );
    },
    play(sweepMs, target) {
      sweepTarget = target;
      sweep = 0;
      tween(
        (t) => {
          sweep = 0.5 - Math.cos(Math.PI * t) / 2;
        },
        sweepMs,
        () => {
          sweep = 1;
          sweepTarget = null;
          request();
        },
      );
    },
    resetCamera() {
      const from = { ...camera };
      tween((t) => {
        const e = ease(t);
        camera.yaw = from.yaw + (BASE_YAW - from.yaw) * e;
        camera.pitch = from.pitch + (BASE_PITCH - from.pitch) * e;
        camera.zoom = from.zoom + (1 - from.zoom) * e;
        camera.panX = from.panX * (1 - e);
        camera.panY = from.panY * (1 - e);
      }, 450);
    },
  };
  return handle;
}
