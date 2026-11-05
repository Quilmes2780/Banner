// Zielbewertung der KI: Nutzen, Distanz und Kampfrisiko. Sieht nur die Spieler-Sicht.
import { BALANCE } from '../config/balance';
import { creatureOfRealm } from '../engine/content';
import { armyUnits, canAfford, citiesOf, cityAt, tierOf } from '../engine/helpers';
import { hexDistance, hexKey, neighbors, parseKey, sameHex } from '../engine/hex';
import { hostileAt, isRevealed, pathMap, pathTo, type PathResult } from '../engine/movement';
import { recruitUnitCost } from '../engine/city';
import type { Encounter, GameState, Hero, Hex, PlayerId, Tier, Tile } from '../engine/types';
import type { DifficultyProfile } from './cityPlanner';
import { encounterOdds } from './simulate';

const V = BALANCE.ai.value;

export interface Candidate {
  hex: Hex;
  value: number; // Nutzen bei Erfolg
  encounter: Encounter | null;
  path: PathResult;
}

export interface Choice { candidate: Candidate; score: number; winRate: number }

const weeksLeft = (view: GameState): number => BALANCE.weeks - view.week + 1;

function heartstoneCandidates(view: GameState, me: PlayerId): string[] {
  const p = view.players[me];
  return neighbors({ q: 0, r: 0 }).map(hexKey).filter(k => !p.hints.includes(k));
}

function tileValue(view: GameState, hero: Hero, tile: Tile, profile: DifficultyProfile): number {
  const me = hero.owner;
  if (!isRevealed(tile, me)) {
    // Erkunden lohnt früh mehr, und mit Armee mehr als ohne.
    const base = V.explore * profile.exploreScale * (armyUnits(hero.army) > 0 ? 1 : 0.4);
    return base * (0.5 + weeksLeft(view) / BALANCE.weeks);
  }
  const c = tile.content;
  if (!c) return 0;
  switch (c.kind) {
    case 'mine': {
      if (c.owner === me) return 0;
      const income = V.mine[c.resource] * (weeksLeft(view) / BALANCE.weeks);
      return (income + BALANCE.fame.mine * 2) * profile.mineScale;
    }
    case 'treasure': return V.treasure;
    case 'guardian': return V.guardianPerTier * c.tier * profile.guardianScale;
    case 'dwelling': {
      const def = creatureOfRealm(view.players[me].realmId, c.tier);
      const canBuy = c.stock > 0 && canAfford(view.players[me].resources, recruitUnitCost(view, def.tier));
      return canBuy ? V.dwelling + def.tier : 0;
    }
    case 'obelisk': return c.usedBy.includes(me) || view.heartstoneFound ? 0 : V.obelisk;
    case 'shrine': return c.usedBy.includes(me) || hero.spells.includes(c.spellId) ? 0 : V.shrine;
    case 'heart': return c.army ? V.heart * profile.guardianScale : 0;
  }
}

function digValue(view: GameState, me: PlayerId, tile: Tile): number {
  if (view.heartstoneFound || tile.dugBy.includes(me)) return 0;
  const cands = heartstoneCandidates(view, me);
  if (!cands.includes(hexKey(tile.hex))) return 0;
  return (V.dig * BALANCE.fame.heartstone) / cands.length;
}

/** Bringt ein Heimweg etwas? Nur wenn die Stadt Einheiten und der Spieler Gold hat. */
function reinforceValue(view: GameState, hero: Hero, profile: DifficultyProfile): { hex: Hex; value: number } | null {
  const me = hero.owner;
  const player = view.players[me];
  let best: { hex: Hex; value: number } | null = null;
  for (const city of citiesOf(view, me)) {
    if (sameHex(city.pos, hero.pos)) continue;
    let units = 0;
    for (const tier of [1, 2, 3, 4] as Tier[]) {
      if (city.stock[tier] <= 0) continue;
      const cost = recruitUnitCost(view, tier);
      if (canAfford(player.resources, cost)) units += tier * Math.min(city.stock[tier], Math.floor(player.resources.gold / Math.max(1, cost.gold ?? 1)));
    }
    const garrison = city.garrison.reduce((n, s) => n + s.count * tierOf(s.creatureId), 0);
    const levels = hero.army.reduce((n, s) => n + s.count * tierOf(s.creatureId), 0);
    if (units + garrison === 0) continue;
    const need = levels <= 6 ? 2 : levels <= 14 ? 1 : 0.5;
    const value = V.reinforce * profile.reinforceScale * need * Math.min(1.5, (units + garrison) / 6);
    if (!best || value > best.value) best = { hex: city.pos, value };
  }
  return best;
}

function encounterFor(view: GameState, hero: Hero, tile: Tile): Encounter | null {
  const target = isRevealed(tile, hero.owner) ? hostileAt(view, hero, tile) : null;
  return target ? { heroId: hero.id, target, from: { ...hero.pos }, moveCost: 0 } : null;
}

/** Sammelt alle bekannten Ziele des Helden mit optimistischem Nutzen. */
export function collectCandidates(view: GameState, hero: Hero, profile: DifficultyProfile): Candidate[] {
  const out: Candidate[] = [];
  const map = pathMap(view, hero);
  const me = hero.owner;
  const hasArmy = armyUnits(hero.army) > 0;
  for (const key of map.dist.keys()) {
    const hex = parseKey(key);
    const tile = view.tiles[key];
    if (sameHex(hex, hero.pos)) continue;
    const enc = encounterFor(view, hero, tile);
    if (enc && !hasArmy) continue;
    let value: number;
    if (enc?.target.kind === 'city') value = V.enemyCity * profile.enemyScale;
    else if (enc?.target.kind === 'hero') value = V.enemyHero * profile.enemyScale;
    else value = tileValue(view, hero, tile, profile);
    if (!enc) value += digValue(view, me, tile);
    if (value <= 0) continue;
    const path = pathTo(view, hero, map, hex);
    if (path && path.path.length > 0) out.push({ hex, value, encounter: enc, path });
  }
  const home = reinforceValue(view, hero, profile);
  if (home) {
    const path = pathTo(view, hero, map, home.hex);
    if (path) out.push({ hex: home.hex, value: home.value, encounter: null, path });
  }
  return out;
}

const distanceFactor = (path: PathResult, hero: Hero): number => {
  const cost = path.knownCost + (path.endsHidden ? 1 : 0);
  // Mehrwöchige Wege werden stark abgewertet.
  const weeks = Math.ceil(cost / Math.max(BALANCE.movementPerWeek, hero.movement || BALANCE.movementPerWeek));
  return 1 / (1 + cost * 0.28 + Math.max(0, weeks - 1) * 0.6);
};

/** Wählt das beste Ziel. Simuliert Kämpfe nur, wenn sie noch gewinnen könnten (spart Rechenzeit). */
export function chooseTarget(view: GameState, hero: Hero, profile: DifficultyProfile, noise: () => number): Choice | null {
  const scored = collectCandidates(view, hero, profile)
    .filter(c => c.path.affordableSteps > 0 || c.encounter === null)
    .map(c => ({ c, optimistic: c.value * distanceFactor(c.path, hero) * (1 + profile.noise * noise()) }))
    .sort((a, b) => b.optimistic - a.optimistic);
  let best: Choice | null = null;
  for (const { c, optimistic } of scored) {
    if (best && optimistic <= best.score) break;
    let winRate = 1;
    let score = optimistic;
    if (c.encounter) {
      const odds = encounterOdds(view, c.encounter, profile.sims);
      winRate = odds.winRate;
      if (winRate < profile.minWin) continue;
      // Sieg ist gut, aber hohe Verluste kosten die Armee für den Rest der Partie.
      score = optimistic * winRate * (1 - odds.avgAttackerLossShare * profile.lossWeight);
    }
    if (!best || score > best.score) best = { candidate: c, score, winRate };
  }
  return best;
}

/** Soll die KI auf dem aktuellen Feld graben? */
export function shouldDig(view: GameState, hero: Hero): boolean {
  const tile = view.tiles[hexKey(hero.pos)];
  if (hexDistance(hero.pos, { q: 0, r: 0 }) !== 1 || hero.movement < 1) return false;
  return digValue(view, hero.owner, tile) > 0 && !cityAt(view, hero.pos);
}
