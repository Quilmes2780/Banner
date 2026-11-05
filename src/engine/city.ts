// Stadtphase: Bauen, Rekrutieren, Markt, Heldenanwerbung, Magiergilde (Regeln 4, 5, 6, 8).
import { BALANCE } from '../config/balance';
import { HEROES, SPELLS, buildingById, creatureOfRealm } from './content';
import { RuleError } from './errors';
import { sameHex } from './hex';
import {
  activePlayerId, addToArmy, canAfford, getCity, getHero, heroesOf, log, pay, tileAt, weekEffects,
} from './helpers';
import { shuffle } from './rng';
import { makeHero } from './setup';
import type { BuildingId, City, GameState, Holder, ResourceCost, ResourceKey, Stack, Tier } from './types';

function ownCityInPhase(s: GameState, cityId: string): City {
  if (s.phase !== 'city') throw new RuleError('Das geht nur in der Stadtphase.');
  const city = getCity(s, cityId);
  if (city.owner !== activePlayerId(s)) throw new RuleError('Diese Stadt gehört nicht dem aktiven Spieler.');
  return city;
}

export function buildCost(s: GameState, building: BuildingId): ResourceCost {
  const cost = { ...BALANCE.buildings[building] };
  const discount = weekEffects(s).reduce((v, e) => (e.type === 'buildDiscount' ? v + e.gold : v), 0);
  if (discount > 0 && cost.gold) cost.gold = Math.max(0, cost.gold - discount);
  return cost;
}

export function recruitUnitCost(s: GameState, tier: Tier): ResourceCost {
  const cost = { ...BALANCE.tiers[tier].cost };
  const discount = weekEffects(s).reduce((v, e) => (e.type === 'recruitDiscount' && e.tier === tier ? v + e.gold : v), 0);
  if (discount > 0 && cost.gold) cost.gold = Math.max(0, cost.gold - discount);
  return cost;
}

export function buildableReason(s: GameState, city: City, building: BuildingId): string | null {
  if (city.buildings.includes(building)) return 'Bereits gebaut.';
  if (city.builtThisWeek) return 'Diese Woche wurde hier schon gebaut.';
  const req = buildingById[building].requires;
  if (req && !city.buildings.includes(req)) return `Benötigt ${buildingById[req].name}.`;
  if (!canAfford(s.players[city.owner].resources, buildCost(s, building))) return 'Nicht genug Ressourcen.';
  return null;
}

export function applyBuild(s: GameState, cityId: string, building: BuildingId): void {
  const city = ownCityInPhase(s, cityId);
  const reason = buildableReason(s, city, building);
  if (reason) throw new RuleError(reason);
  pay(s.players[city.owner].resources, buildCost(s, building));
  city.buildings.push(building);
  city.builtThisWeek = true;
  log(s, `${s.players[city.owner].name} baut ${buildingById[building].name}.`, [city.owner]);
}

function holderArmy(s: GameState, h: Holder): Stack[] {
  return h.type === 'hero' ? getHero(s, h.id).army : getCity(s, h.id).garrison;
}
function holderPos(s: GameState, h: Holder) {
  return h.type === 'hero' ? getHero(s, h.id).pos : getCity(s, h.id).pos;
}
function holderOwner(s: GameState, h: Holder) {
  return h.type === 'hero' ? getHero(s, h.id).owner : getCity(s, h.id).owner;
}

function chargeUnits(s: GameState, cost: ResourceCost, count: number): void {
  const total: ResourceCost = {};
  for (const [k, v] of Object.entries(cost) as [ResourceKey, number][]) total[k] = v * count;
  pay(s.players[activePlayerId(s)].resources, total);
}

/** Regel 5: Rekrutieren aus dem Stadtvorrat in den Helden vor Ort oder in die Garnison. */
export function applyRecruit(s: GameState, cityId: string, tier: Tier, count: number, to: Holder): void {
  const city = ownCityInPhase(s, cityId);
  if (!Number.isInteger(count) || count <= 0) throw new RuleError('Ungültige Anzahl.');
  if (!city.buildings.includes(`dwelling${tier}` as BuildingId)) throw new RuleError('Die Behausung fehlt.');
  if (city.stock[tier] < count) throw new RuleError('Nicht genug Einheiten im Vorrat.');
  if (holderOwner(s, to) !== city.owner || !sameHex(holderPos(s, to), city.pos)) {
    throw new RuleError('Einheiten gehen nur in die Garnison oder zu einem Helden in der Stadt.');
  }
  chargeUnits(s, recruitUnitCost(s, tier), count);
  addToArmy(holderArmy(s, to), creatureOfRealm(city.realmId, tier).id, count);
  city.stock[tier] -= count;
}

/** ANNAHME: Umland-Behausung rekrutiert in der Heldenphase für den Helden auf dem Feld. */
export function applyRecruitDwelling(s: GameState, heroId: string, count: number): void {
  if (s.phase !== 'hero') throw new RuleError('Das geht nur in der Heldenphase.');
  const hero = getHero(s, heroId);
  if (hero.owner !== activePlayerId(s)) throw new RuleError('Dieser Held gehört nicht dem aktiven Spieler.');
  const content = tileAt(s, hero.pos)?.content;
  if (content?.kind !== 'dwelling') throw new RuleError('Hier ist keine Behausung.');
  if (!Number.isInteger(count) || count <= 0 || content.stock < count) throw new RuleError('Nicht genug Einheiten im Vorrat.');
  chargeUnits(s, recruitUnitCost(s, content.tier), count);
  addToArmy(hero.army, creatureOfRealm(s.players[hero.owner].realmId, content.tier).id, count);
  content.stock -= count;
}

/** Regel 4: Markt 3:1. */
export function applyTrade(s: GameState, cityId: string, give: ResourceKey, get: ResourceKey): void {
  const city = ownCityInPhase(s, cityId);
  if (!city.buildings.includes('market')) throw new RuleError('Dafür braucht die Stadt einen Markt.');
  if (give === get) throw new RuleError('Tausch nur zwischen verschiedenen Ressourcen.');
  const res = s.players[city.owner].resources;
  if (res[give] < BALANCE.marketRate) throw new RuleError('Nicht genug Ressourcen.');
  res[give] -= BALANCE.marketRate;
  res[get] += 1;
}

/** Regel 6: Zweiter Held für 10 Gold. */
export function applyHire(s: GameState, cityId: string, defId: string): void {
  const city = ownCityInPhase(s, cityId);
  const owner = city.owner;
  const player = s.players[owner];
  if (heroesOf(s, owner).length >= BALANCE.maxHeroes) throw new RuleError(`Höchstens ${BALANCE.maxHeroes} Helden.`);
  const def = HEROES.find(h => h.id === defId);
  if (!def || def.realm !== player.realmId) throw new RuleError('Dieser Held steht nicht zur Verfügung.');
  if (s.heroes[`p${owner}_${defId}`]) throw new RuleError('Dieser Held dient bereits.');
  pay(player.resources, { gold: BALANCE.secondHeroCost });
  const hero = makeHero(defId, owner, city.pos);
  s.heroes[hero.id] = hero;
  log(s, `${player.name} wirbt ${def.name} an.`);
}

export function availableGuildSpells(city: City, knownSpells: string[]) {
  const maxLevel = city.buildings.includes('guildUpgrade') ? 2 : 1;
  return SPELLS.filter(sp => sp.level <= maxLevel && !knownSpells.includes(sp.id));
}

/** Regel 8: 2 ziehen, 1 behalten, einmal pro Woche. ANNAHME: Der Held muss in der Stadt sein. */
export function applyGuildDraw(s: GameState, cityId: string, heroId: string): void {
  const city = ownCityInPhase(s, cityId);
  if (!city.buildings.includes('guild')) throw new RuleError('Dafür braucht die Stadt eine Magiergilde.');
  if (city.guildUsedWeek === s.week) throw new RuleError('Die Gilde wurde diese Woche bereits genutzt.');
  const hero = getHero(s, heroId);
  if (hero.owner !== city.owner || !sameHex(hero.pos, city.pos)) throw new RuleError('Der Held muss in der Stadt sein.');
  const options = availableGuildSpells(city, hero.spells);
  if (options.length === 0) throw new RuleError('Die Gilde kann diesem Helden nichts mehr beibringen.');
  city.guildUsedWeek = s.week;
  s.guildOffer = { cityId, heroId, options: shuffle(s, options.map(o => o.id)).slice(0, BALANCE.spells.guildDraw) };
}

export function applyGuildKeep(s: GameState, spellId: string): void {
  if (!s.guildOffer) throw new RuleError('Es liegen keine Zauber zur Wahl.');
  if (!s.guildOffer.options.includes(spellId)) throw new RuleError('Dieser Zauber steht nicht zur Wahl.');
  getHero(s, s.guildOffer.heroId).spells.push(spellId);
  s.guildOffer = null;
}

/** Einheiten zwischen eigenen Helden und Garnison am selben Ort tauschen. */
export function applyTransfer(s: GameState, from: Holder, to: Holder, creatureId: string, count: number): void {
  if (holderOwner(s, from) !== activePlayerId(s) || holderOwner(s, to) !== activePlayerId(s)) {
    throw new RuleError('Das sind nicht deine Einheiten.');
  }
  if (!sameHex(holderPos(s, from), holderPos(s, to))) throw new RuleError('Beide müssen auf demselben Feld stehen.');
  if (!Number.isInteger(count) || count <= 0) throw new RuleError('Ungültige Anzahl.');
  const src = holderArmy(s, from);
  const stack = src.find(x => x.creatureId === creatureId);
  if (!stack || stack.count < count) throw new RuleError('So viele Einheiten sind nicht da.');
  addToArmy(holderArmy(s, to), creatureId, count);
  stack.count -= count;
  if (stack.count === 0) src.splice(src.indexOf(stack), 1);
}
