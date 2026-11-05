// Wochenwechsel und Phasenablauf (Regel 1).
import { BALANCE } from '../config/balance';
import { WEEK_CARDS, weekCardById } from './content';
import { heroesOf, heroEffects, log, weekEffects, weeklyMovement, citiesOf } from './helpers';
import { shuffle } from './rng';
import { endGame } from './scoring';
import type { BuildingId, GameState, PlayerId, Resources, Tier } from './types';

const TIERS: Tier[] = [1, 2, 3, 4];

/** Regel 1: Wocheneinkommen eines Spielers. */
export function weeklyIncome(s: GameState, playerId: PlayerId): Resources {
  const income: Resources = { gold: 0, material: 0, crystal: 0 };
  for (const city of citiesOf(s, playerId)) {
    if (city.buildings.includes('capitol')) income.gold += BALANCE.income.capitolGold;
    else if (city.buildings.includes('townhall')) income.gold += BALANCE.income.townhallGold;
  }
  for (const tile of Object.values(s.tiles)) {
    if (tile.content?.kind === 'mine' && tile.content.owner === playerId) {
      income[tile.content.resource] += BALANCE.income.mine[tile.content.resource];
      for (const e of weekEffects(s)) {
        if (e.type === 'mineBonus' && e.resource === tile.content.resource) income[e.resource] += e.value;
      }
    }
  }
  for (const hero of heroesOf(s, playerId)) {
    for (const e of heroEffects(s, hero)) if (e.type === 'income') income[e.resource] += e.value;
  }
  for (const e of weekEffects(s)) if (e.type === 'income') income[e.resource] += e.value;
  return income;
}

function growth(s: GameState, tier: Tier): number {
  return BALANCE.growth[tier] + weekEffects(s).reduce((v, e) => (e.type === 'growth' && e.tier === tier ? v + e.value : v), 0);
}
// Regel 1: Vorrat maximal doppelt. ANNAHME: Die Grenze bezieht sich auf das Grundwachstum ohne Wochenkarte.
// ANNAHME: Eine Wochenkarte gilt die ganze Woche; Einkommen und Wachstum am Wochenende nutzen noch die laufende Karte.
const stockCap = (tier: Tier): number => BALANCE.growth[tier] * BALANCE.stockCapFactor;

export function applyWeekChange(s: GameState): void {
  // 1. Einkommen
  for (const p of s.players) {
    if (p.eliminated) continue;
    const income = weeklyIncome(s, p.id);
    p.resources.gold += income.gold;
    p.resources.material += income.material;
    p.resources.crystal += income.crystal;
  }
  // 2. Wachstum
  for (const city of Object.values(s.cities)) {
    for (const tier of TIERS) {
      if (city.buildings.includes(`dwelling${tier}` as BuildingId)) {
        city.stock[tier] = Math.min(stockCap(tier), city.stock[tier] + growth(s, tier));
      }
    }
  }
  for (const tile of Object.values(s.tiles)) {
    if (tile.content?.kind === 'dwelling') {
      tile.content.stock = Math.min(stockCap(tile.content.tier), tile.content.stock + growth(s, tile.content.tier));
    }
  }
  // 3. Neue Wochenkarte
  if (s.weekDeck.length === 0) s.weekDeck = shuffle(s, WEEK_CARDS.map(c => c.id));
  s.weekCardId = s.weekDeck.pop() as string;
  // 4. Startspieler rotiert
  s.order = [...s.order.slice(1), s.order[0]];
  s.week += 1;
  s.activeIndex = 0;
  s.phase = 'city';
  for (const city of Object.values(s.cities)) city.builtThisWeek = false;
  for (const hero of Object.values(s.heroes)) hero.movement = weeklyMovement(s, hero);
  log(s, `Woche ${s.week} beginnt: ${weekCardById[s.weekCardId].name}.`);
  skipEliminated(s);
}

function skipEliminated(s: GameState): void {
  while (s.activeIndex < s.order.length && s.players[s.order[s.activeIndex]].eliminated) s.activeIndex += 1;
  if (s.activeIndex >= s.order.length) finishWeek(s);
}

function finishWeek(s: GameState): void {
  if (s.week >= BALANCE.weeks) endGame(s, 'weeks');
  else applyWeekChange(s);
}

export function advanceTurn(s: GameState): void {
  s.activeIndex += 1;
  s.phase = 'city';
  skipEliminated(s);
}
