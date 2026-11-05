// Lesende Hilfsfunktionen auf dem Spielzustand.
import { BALANCE } from '../config/balance';
import { artifactById, creatureById, heroDefById, realmById, skillById, weekCardById } from './content';
import { RuleError } from './errors';
import { hexKey, sameHex } from './hex';
import type {
  City, Effect, GameState, Hero, HeroStat, Hex, Player, PlayerId, ResourceCost, Resources, Stack, Terrain, Tier, Tile, WeekEffect,
} from './types';

export const activePlayerId = (s: GameState): PlayerId => s.order[s.activeIndex];
export const playerOf = (s: GameState, id: PlayerId): Player => s.players[id];
export const heroesOf = (s: GameState, id: PlayerId): Hero[] => Object.values(s.heroes).filter(h => h.owner === id);
export const citiesOf = (s: GameState, id: PlayerId): City[] => Object.values(s.cities).filter(c => c.owner === id);
export const tileAt = (s: GameState, hex: Hex): Tile | undefined => s.tiles[hexKey(hex)];
export const heroAt = (s: GameState, hex: Hex): Hero[] => Object.values(s.heroes).filter(h => sameHex(h.pos, hex));
export const cityAt = (s: GameState, hex: Hex): City | undefined => Object.values(s.cities).find(c => sameHex(c.pos, hex));

export function getHero(s: GameState, id: string): Hero {
  const h = s.heroes[id];
  if (!h) throw new RuleError('Diesen Helden gibt es nicht.');
  return h;
}
export function getCity(s: GameState, id: string): City {
  const c = s.cities[id];
  if (!c) throw new RuleError('Diese Stadt gibt es nicht.');
  return c;
}

export function log(s: GameState, text: string, players: PlayerId[] | 'all' = 'all'): void {
  s.log.push({ week: s.week, text, players });
}

export function weekEffects(s: GameState): WeekEffect[] {
  return weekCardById[s.weekCardId]?.effects ?? [];
}

/** Alle dauerhaften Effekte eines Helden: Reich, Spezialität, Fertigkeiten, Artefakte. */
export function heroEffects(s: GameState, hero: Hero): Effect[] {
  const realm = realmById[s.players[hero.owner].realmId];
  return [
    ...realm.effects,
    ...heroDefById[hero.defId].specialty.effects,
    ...hero.skills.flatMap(id => skillById[id].effects),
    ...hero.artifacts.flatMap(id => artifactById[id].effects),
  ];
}

export function effectiveStat(s: GameState, hero: Hero, stat: HeroStat): number {
  return heroEffects(s, hero).reduce((v, e) => (e.type === 'stat' && e.stat === stat ? v + e.value : v), hero[stat]);
}

export function weeklyMovement(s: GameState, hero: Hero): number {
  const fromHero = heroEffects(s, hero).reduce((v, e) => (e.type === 'movement' ? v + e.value : v), 0);
  const fromWeek = weekEffects(s).reduce((v, e) => (e.type === 'movement' ? v + e.value : v), 0);
  return BALANCE.movementPerWeek + fromHero + fromWeek;
}

/** Regel 2: Terrainkosten inklusive Reich (Wildhain), Fertigkeiten und Wochenkarte. */
export function terrainCost(s: GameState, hero: Hero, terrain: Terrain): number {
  let cost = BALANCE.terrainCost[terrain];
  for (const e of [...heroEffects(s, hero), ...weekEffects(s)]) {
    if (e.type === 'terrainCost' && e.terrain === terrain) cost = Math.min(cost, e.cost);
  }
  return cost;
}

export const canAfford = (res: Resources, cost: ResourceCost): boolean =>
  (Object.entries(cost) as [keyof Resources, number][]).every(([k, v]) => res[k] >= v);

export function pay(res: Resources, cost: ResourceCost): void {
  if (!canAfford(res, cost)) throw new RuleError('Nicht genug Ressourcen.');
  for (const [k, v] of Object.entries(cost) as [keyof Resources, number][]) res[k] -= v;
}

export const tierOf = (creatureId: string): Tier => creatureById[creatureId].tier;

/** Regel 5: Max. 3 Stapel, max. 6 Einheiten je Stapel (Stufe IV: 2). ANNAHME: Je Kreaturenart ein Stapel. */
export function addToArmy(army: Stack[], creatureId: string, count: number): void {
  if (count <= 0) return;
  const cap = BALANCE.maxPerStack[tierOf(creatureId)];
  const existing = army.find(a => a.creatureId === creatureId);
  if (existing) {
    if (existing.count + count > cap) throw new RuleError(`Ein Stapel darf höchstens ${cap} Einheiten haben.`);
    existing.count += count;
    return;
  }
  if (army.length >= BALANCE.maxStacks) throw new RuleError(`Höchstens ${BALANCE.maxStacks} Stapel.`);
  if (count > cap) throw new RuleError(`Ein Stapel darf höchstens ${cap} Einheiten haben.`);
  army.push({ creatureId, count });
}

export function roomInArmy(army: Stack[], creatureId: string): number {
  const cap = BALANCE.maxPerStack[tierOf(creatureId)];
  const existing = army.find(a => a.creatureId === creatureId);
  if (existing) return cap - existing.count;
  return army.length < BALANCE.maxStacks ? cap : 0;
}

export const armyUnits = (army: Stack[]): number => army.reduce((n, s) => n + s.count, 0);
export const armyLevels = (army: Stack[]): number => army.reduce((n, s) => n + s.count * tierOf(s.creatureId), 0);
