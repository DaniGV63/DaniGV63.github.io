import { color } from 'd3';

/**
 * Top-down open-wheel car in a Ferrari-style livery, pointing along +x,
 * about 40 units long. Drawn as coloured parts so it works as SVG paths and as
 * canvas Path2D objects.
 */
export interface CarPart {
  d: string;
  fill: string;
}

const RED = 'livery';
const DARK_RED = 'liveryDark';
const BLACK = '#161616';

export const CAR_PARTS: CarPart[] = [
  { d: 'M-15,-10 H-8 V-5.5 H-15 Z M-15,5.5 H-8 V10 H-15 Z', fill: BLACK }, // rear tyres
  { d: 'M4,-9.5 H11 V-5 H4 Z M4,5 H11 V9.5 H4 Z', fill: BLACK }, // front tyres
  { d: 'M-22,-7.5 H-17 V7.5 H-22 Z', fill: RED }, // rear wing
  { d: 'M-22,-7.5 H-17 V-6.4 H-22 Z M-22,6.4 H-17 V7.5 H-22 Z', fill: BLACK }, // end plates
  { d: 'M13.5,-8.5 H19.5 V8.5 H13.5 Z', fill: RED }, // front wing
  { d: 'M13.5,-8.5 H19.5 V-7.4 H13.5 Z M13.5,7.4 H19.5 V8.5 H13.5 Z', fill: BLACK },
  { d: 'M-17,-3 L-6,-4.4 L2,-3.6 L13,-1.2 L19,-0.9 L19,0.9 L13,1.2 L2,3.6 L-6,4.4 L-17,3 Z', fill: RED }, // body
  { d: 'M-13,-5.6 L-1,-4.6 L-1,4.6 L-13,5.6 Z', fill: DARK_RED }, // side pods
  { d: 'M-3.5,-1.7 L2,-1.7 L3,0 L2,1.7 L-3.5,1.7 Z', fill: BLACK }, // cockpit and halo
  { d: 'M-0.2,0 m-1.1,0 a1.1,1.1 0 1,0 2.2,0 a1.1,1.1 0 1,0 -2.2,0', fill: '#f2f2f2' }, // helmet
  { d: 'M9,-0.7 H19 V0.7 H9 Z', fill: '#f2f2f2' }, // nose stripe
];

/** Car length in world units relative to the circuit line width. */
export const CAR_SCALE = 0.17;

/** Resolve a part fill; livery parts take the given team colour. */
export function carFill(fill: string, livery: string): string {
  if (fill === 'livery') return livery;
  if (fill === 'liveryDark') return color(livery)?.darker(0.9).formatHex() ?? livery;
  return fill;
}
