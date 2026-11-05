// Monte-Carlo-Kampfrisiko für die KI und die Vorschau. Verändert nie den Spielzustand.
import { simulateCombat, type SimulationResult } from '../engine/combat/policy';
import type { CombatSetup } from '../engine/combat/types';
import { buildCombatSetup } from '../engine/encounter';
import { deriveSeed } from '../engine/rng';
import type { Encounter, GameState } from '../engine/types';

const CACHE_LIMIT = 20000;
const cache = new Map<string, SimulationResult>();

function signature(setup: CombatSetup, runs: number): string {
  const side = (x: CombatSetup['attacker']) =>
    [x.kind, x.attack, x.defense, x.magic, x.spellSlots, x.spells.join('+'), x.rangedNoPenalty ? 1 : 0,
      JSON.stringify(x.tierDice), x.army.map(a => `${a.creatureId}:${a.count}`).join(',')].join('|');
  return [runs, side(setup.attacker), side(setup.defender), setup.siege?.wall ?? 'x', JSON.stringify(setup.tempoBonus ?? {})].join('#');
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(31, h) + text.charCodeAt(i) | 0;
  return deriveSeed(h);
}

/** Gleiche Aufstellung liefert stets dasselbe Ergebnis; der Zwischenspeicher dient nur der Geschwindigkeit. */
export function simulateSetup(setup: CombatSetup, runs: number): SimulationResult {
  const key = signature(setup, runs);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = simulateCombat(setup, runs, hash(key));
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, result);
  return result;
}

/** Siegchance einer Begegnung, berechnet aus dem, was der Spieler sieht. */
export function encounterOdds(view: GameState, encounter: Encounter, runs: number): SimulationResult {
  return simulateSetup(buildCombatSetup(view, encounter, 1), runs);
}
