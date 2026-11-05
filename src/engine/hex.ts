// Hex-Raster in Axial-Koordinaten.
import type { Hex } from './types';

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;
export const parseKey = (k: string): Hex => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};
export const sameHex = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;
export const hexDistance = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
];
export const neighbors = (h: Hex): Hex[] => DIRECTIONS.map(d => ({ q: h.q + d.q, r: h.r + d.r }));
export const areAdjacent = (a: Hex, b: Hex): boolean => hexDistance(a, b) === 1;

export function hexesInRadius(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push({ q, r });
  }
  return out;
}

export const corner = (radius: number, index: number): Hex => {
  const d = DIRECTIONS[index];
  return { q: d.q * radius, r: d.r * radius };
};
