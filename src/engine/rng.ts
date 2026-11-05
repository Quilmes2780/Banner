// Seedbarer PRNG (mulberry32). Der Zustand liegt immer im Spiel- oder Kampfzustand.
export interface RngHolder { rng: number }

export function rand(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) | 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (h: RngHolder, n: number): number => Math.floor(rand(h) * n);
export const d6 = (h: RngHolder): number => randInt(h, 6) + 1;

export function shuffle<T>(h: RngHolder, input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(h, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickWeighted<K extends string>(h: RngHolder, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  let roll = rand(h) * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Leitet deterministisch einen neuen Seed ab, ohne den Spielzustand zu verändern. */
export function deriveSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h | 0;
}
