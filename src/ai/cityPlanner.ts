// Stadtphase der KI.
import { BALANCE } from '../config/balance';
import { availableGuildSpells, buildableReason, recruitUnitCost } from '../engine/city';
import { HEROES, creatureOfRealm, spellById } from '../engine/content';
import { armyLevels, canAfford, citiesOf, heroAt, heroesOf, roomInArmy } from '../engine/helpers';
import { hexDistance } from '../engine/hex';
import type { Action, BuildingId, City, GameState, Hero, PlayerId, Tier } from '../engine/types';

export type DifficultyProfile = (typeof BALANCE.ai)['normal'];

const THREAT_RADIUS = 5;

function threatened(view: GameState, me: PlayerId, city: City): boolean {
  return Object.values(view.heroes).some(h => h.owner !== me && hexDistance(h.pos, city.pos) <= THREAT_RADIUS && armyLevels(h.army) > 0);
}

function buildPriority(view: GameState, city: City, profile: DifficultyProfile, danger: boolean): BuildingId[] {
  const late = view.week >= 7;
  const list: BuildingId[] = [];
  if (danger && profile.lookahead) list.push('wall');
  if (!late) list.push('dwelling3');
  list.push('capitol'); // Einkommen und 3 Ruhm
  if (!late) list.push('guild', 'dwelling4');
  if (!late && city.buildings.includes('guild')) list.push('guildUpgrade');
  if (!late) list.push('market');
  if (danger) list.push('wall');
  return list;
}

function primaryHeroes(view: GameState, city: City, me: PlayerId): Hero[] {
  return heroAt(view, city.pos)
    .filter(h => h.owner === me)
    .sort((a, b) => armyLevels(b.army) - armyLevels(a.army));
}

function unitsWanted(view: GameState, me: PlayerId): number {
  return 4 + view.week * 2.5 - heroesOf(view, me).reduce((n, h) => n + armyLevels(h.army), 0);
}

/** Liefert die nächste Aktion der Stadtphase. */
export function cityAction(view: GameState, me: PlayerId, profile: DifficultyProfile, roll: () => number): Action {
  const player = view.players[me];
  const res = player.resources;
  const myHeroes = heroesOf(view, me);

  for (const city of citiesOf(view, me)) {
    const danger = threatened(view, me, city);
    const here = primaryHeroes(view, city, me);

    // Magiergilde
    if (profile.useGuild && city.buildings.includes('guild') && city.guildUsedWeek !== view.week) {
      const learner = here.find(h => availableGuildSpells(city, h.spells).length > 0);
      if (learner) return { type: 'guildDraw', cityId: city.id, heroId: learner.id };
    }

    // Zweiter Held: lohnt nur früh und wenn noch Gold für Truppen bleibt.
    if (myHeroes.length < BALANCE.maxHeroes && view.week <= profile.hireUntilWeek && res.gold >= BALANCE.secondHeroCost + 6 && !danger) {
      const def = HEROES.find(h => h.realm === player.realmId && !myHeroes.some(m => m.defId === h.id));
      if (def) return { type: 'hireHero', cityId: city.id, defId: def.id };
    }

    // Garnison zum Helden, sofern keine Gefahr droht.
    if (!danger && here.length > 0) {
      for (const stack of city.garrison) {
        const hero = here.find(h => roomInArmy(h.army, stack.creatureId) > 0);
        if (hero) {
          return {
            type: 'transfer', from: { type: 'city', id: city.id }, to: { type: 'hero', id: hero.id },
            creatureId: stack.creatureId, count: Math.min(stack.count, roomInArmy(hero.army, stack.creatureId)),
          };
        }
      }
    }

    const wanted = unitsWanted(view, me);
    const buildFirst = wanted <= 0 || view.week >= 3;

    const tryBuild = (): Action | null => {
      if (city.builtThisWeek || roll() > profile.build) return null;
      for (const b of buildPriority(view, city, profile, danger)) {
        if (buildableReason(view, city, b) === null) return { type: 'build', cityId: city.id, building: b };
      }
      return null;
    };
    if (buildFirst) {
      const b = tryBuild();
      if (b) return b;
    }

    // Rekrutieren: höchste Stufe zuerst.
    // Sobald die Armee zur Woche passt, wird auf das Kapitol gespart (leichte KI spart nie).
    const saving = profile.saveCapitol && wanted <= 0 && !city.buildings.includes('capitol') && view.week >= 2 && view.week <= 8;
    if (!saving) {
      for (const tier of [4, 3, 2, 1] as Tier[]) {
        if (!city.buildings.includes(`dwelling${tier}` as BuildingId) || city.stock[tier] <= 0) continue;
        const creature = creatureOfRealm(city.realmId, tier).id;
        const cost = recruitUnitCost(view, tier);
        if (!canAfford(res, cost)) continue;
        const goldEach = cost.gold ?? 0;
        const crystalEach = cost.crystal ?? 0;
        const canPay = Math.min(goldEach > 0 ? Math.floor(res.gold / goldEach) : 99, crystalEach > 0 ? Math.floor(res.crystal / crystalEach) : 99);
        const toHero = danger ? undefined : here.find(h => roomInArmy(h.army, creature) > 0);
        const target = toHero ? roomInArmy(toHero.army, creature) : roomInArmy(city.garrison, creature);
        const count = Math.min(canPay, city.stock[tier], target);
        if (count > 0) {
          return {
            type: 'recruit', cityId: city.id, tier, count,
            to: toHero ? { type: 'hero', id: toHero.id } : { type: 'city', id: city.id },
          };
        }
      }
    }

    if (!buildFirst) {
      const b = tryBuild();
      if (b) return b;
    }

    // Harte KI kauft Kristall für Stufe IV, wenn Gold übrig ist.
    if (profile.lookahead && city.buildings.includes('market') && city.buildings.includes('dwelling4') && res.crystal === 0 && res.gold >= BALANCE.marketRate + 12) {
      return { type: 'trade', cityId: city.id, give: 'gold', get: 'crystal' };
    }
  }
  return { type: 'endCityPhase' };
}

/** Bevorzugte Zauberwahl aus der Gilde. */
export function pickSpell(options: string[]): string {
  const order = ['fireball', 'lightning', 'bless', 'stoneskin', 'haste', 'portal'];
  return [...options].sort((a, b) => order.indexOf(spellById[a].id) - order.indexOf(spellById[b].id))[0];
}
