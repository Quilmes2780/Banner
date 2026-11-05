// Verbindet Kampf und Spielzustand: Aufbau aus dem Zustand und Anwenden des Ergebnisses (Regeln 5, 6, 7, 9).
import { BALANCE } from '../config/balance';
import { combatPendingSide, initCombat } from './combat/combat';
import type { ArmyEntry, CombatSetup, CombatState, Side, SideSetup } from './combat/types';
import { creatureOfRealm, heroDefById, realmById } from './content';
import { RuleError } from './errors';
import { addHint, addXp } from './hero';
import { addToArmy, armyUnits, citiesOf, effectiveStat, getCity, getHero, heroAt, heroEffects, heroesOf, log, roomInArmy, tileAt, weekEffects } from './helpers';
import { enterTile } from './movement';
import { rand } from './rng';
import { conquerorOf, endGame } from './scoring';
import type { Encounter, GameState, Hero, PlayerId, Stack, Tier, Tile } from './types';

function heroSide(s: GameState, hero: Hero, extra: ArmyEntry[] = [], bonusDefense = 0): SideSetup {
  const effects = heroEffects(s, hero);
  const tierDice: Partial<Record<Tier, number>> = {};
  for (const e of effects) if (e.type === 'tierDice') tierDice[e.tier] = (tierDice[e.tier] ?? 0) + e.value;
  return {
    kind: 'hero',
    label: `${heroDefById[hero.defId].name} (${s.players[hero.owner].name})`,
    playerId: hero.owner, heroId: hero.id, realmId: s.players[hero.owner].realmId,
    attack: effectiveStat(s, hero, 'attack'),
    defense: effectiveStat(s, hero, 'defense') + bonusDefense,
    magic: effectiveStat(s, hero, 'magic'),
    spells: hero.spells,
    spellSlots: BALANCE.combat.spellsPerCombat + effects.reduce((v, e) => (e.type === 'extraSpell' ? v + e.value : v), 0),
    rangedNoPenalty: effects.some(e => e.type === 'rangedNoPenalty'),
    tierDice,
    army: [...hero.army.map(a => ({ ...a, origin: 'hero' as const })), ...extra],
  };
}

function guardianSide(name: string, tier: 1 | 2 | 3, army: Stack[]): SideSetup {
  const v = BALANCE.combat.guardianStats[tier];
  return {
    kind: 'guardian', label: name, playerId: null, attack: v, defense: v, magic: 0,
    spells: [], spellSlots: 0, rangedNoPenalty: false, tierDice: {}, army: army.map(a => ({ ...a, origin: 'guardian' as const })),
  };
}

/** Baut den Kampf aus dem sichtbaren Zustand; funktioniert auch auf der Spieler-Sicht. */
export function buildCombatSetup(s: GameState, e: Encounter, seed: number): CombatSetup {
  const attackerHero = getHero(s, e.heroId);
  const tempoBonus: Partial<Record<Tier, number>> = {};
  for (const w of weekEffects(s)) if (w.type === 'tempo') tempoBonus[w.tier] = (tempoBonus[w.tier] ?? 0) + w.value;
  const tile = tileAt(s, e.target.hex) as Tile;
  let defender: SideSetup;
  let siege: CombatSetup['siege'] = null;
  const t = e.target;
  if (t.kind === 'guardian') {
    const c = tile.content;
    if (c?.kind !== 'guardian') throw new RuleError('Hier steht kein Wächter.');
    defender = guardianSide(c.name, c.tier, c.army);
  } else if (t.kind === 'heart') {
    const c = tile.content;
    if (c?.kind !== 'heart' || !c.army) throw new RuleError('Das Herz ist nicht bewacht.');
    defender = guardianSide(c.name, 3, c.army);
  } else if (t.kind === 'hero') {
    defender = heroSide(s, getHero(s, t.heroId));
  } else if (t.kind !== 'city') {
    throw new RuleError('Unbekannte Begegnung.');
  } else {
    const city = getCity(s, t.cityId);
    const wall = city.buildings.includes('wall');
    const realmBonus = realmById[s.players[city.owner].realmId].effects.reduce((v, x) => (x.type === 'wallDefense' ? v + x.value : v), 0);
    const bonus = wall ? BALANCE.combat.wallDefense + realmBonus : 0;
    siege = { wall }; // ANNAHME: Der Turm gehört zur Stadtmauer; ohne Mauer kein Turm.
    const garrison: ArmyEntry[] = city.garrison.map(a => ({ ...a, origin: 'garrison' }));
    const inside = heroAt(s, city.pos).find(h => h.owner === city.owner);
    defender = inside
      ? heroSide(s, inside, garrison, bonus)
      : {
          kind: 'garrison', label: `Garnison (${s.players[city.owner].name})`, playerId: city.owner, realmId: city.realmId,
          attack: 0, defense: bonus, magic: 0, spells: [], spellSlots: 0, rangedNoPenalty: false, tierDice: {}, army: garrison,
        };
  }
  return { attacker: heroSide(s, attackerHero), defender, siege, tempoBonus, seed };
}

export function declineEncounter(s: GameState): void {
  if (!s.encounter) throw new RuleError('Es steht keine Begegnung an.');
  s.encounter = null;
}

export function startEncounter(s: GameState): void {
  const e = s.encounter;
  if (!e) throw new RuleError('Es steht keine Begegnung an.');
  const hero = getHero(s, e.heroId);
  if (armyUnits(hero.army) === 0) throw new RuleError('Ohne Armee kann der Held nicht kämpfen.');
  hero.movement -= e.moveCost;
  const setup = buildCombatSetup(s, e, Math.floor(rand(s) * 2 ** 31));
  const noDefenders = setup.defender.army.length === 0;
  if (noDefenders && !setup.siege?.wall) {
    // ANNAHME: Ohne Verteidiger und ohne Mauer fällt das Feld kampflos.
    s.encounter = null;
    settleVictoryWithoutCombat(s, e, hero);
    return;
  }
  s.combat = { state: initCombat(setup), encounter: e };
  s.encounter = null;
}

function settleVictoryWithoutCombat(s: GameState, e: Encounter, hero: Hero): void {
  if (e.target.kind === 'hero') sendHome(s, getHero(s, e.target.heroId));
  if (e.target.kind === 'city') captureCity(s, e.target.cityId, hero);
  enterTile(s, hero, tileAt(s, e.target.hex) as Tile);
  finishChecks(s);
}

/**
 * Regel 7: Flucht führt den Helden zur Hauptstadt.
 * ANNAHME (im Plan freigegeben): Auch ein besiegter Held kehrt ohne Armee zurück; Stufe, Artefakte und Zauber bleiben, die Bewegung verfällt.
 */
export function sendHome(s: GameState, hero: Hero): void {
  hero.army = [];
  hero.movement = 0;
  const cities = citiesOf(s, hero.owner);
  const capital = cities.find(c => c.originalOwner === hero.owner) ?? cities[0];
  if (capital) {
    hero.pos = { ...capital.pos };
    log(s, `${heroDefById[hero.defId].name} kehrt ohne Armee nach ${capital.originalOwner === hero.owner ? 'Hause' : 'in eine eigene Stadt'} zurück.`);
  } else {
    // ANNAHME: Ohne eigene Stadt ist der Held verloren.
    delete s.heroes[hero.id];
    log(s, `${heroDefById[hero.defId].name} hat keine Zuflucht mehr und verschwindet.`);
    updateElimination(s, hero.owner);
  }
}

function captureCity(s: GameState, cityId: string, conqueror: Hero): void {
  const city = getCity(s, cityId);
  const old = city.owner;
  // Verteidigende Helden verlassen die Stadt, bevor sie den Besitzer wechselt.
  city.owner = conqueror.owner;
  city.garrison = [];
  for (const h of heroAt(s, city.pos)) if (h.owner === old) sendHome(s, h);
  log(s, `${s.players[conqueror.owner].name} erobert die Hauptstadt von ${s.players[city.originalOwner].name}.`);
  updateElimination(s, old);
}

function updateElimination(s: GameState, id: PlayerId): void {
  if (citiesOf(s, id).length === 0 && heroesOf(s, id).length === 0) {
    s.players[id].eliminated = true;
    log(s, `${s.players[id].name} ist ausgeschieden.`);
  }
}

function survivors(c: CombatState, side: Side, origin: string): Stack[] {
  return c.stacks.filter(x => x.side === side && x.origin === origin && x.count > 0).map(x => ({ creatureId: x.creatureId, count: x.count }));
}

/** Regel 5: Knochenfeste erweckt nach Siegen 1 Skelett je 3 besiegte Einheiten. */
function raiseSkeletons(s: GameState, hero: Hero, defeated: number): void {
  if (!heroEffects(s, hero).some(e => e.type === 'skeletonRaise')) return;
  const skeleton = creatureOfRealm(s.players[hero.owner].realmId, 1).id;
  const n = Math.min(Math.floor(defeated / BALANCE.skeletonEvery), roomInArmy(hero.army, skeleton));
  if (n > 0) {
    addToArmy(hero.army, skeleton, n);
    log(s, `${heroDefById[hero.defId].name} erweckt ${n} Skelett${n > 1 ? 'e' : ''}.`);
  }
}

function winnerBonus(s: GameState, hero: Hero, defeated: number): void {
  const gold = heroEffects(s, hero).reduce((v, e) => (e.type === 'victoryGold' ? v + e.value : v), 0);
  s.players[hero.owner].resources.gold += gold;
  raiseSkeletons(s, hero, defeated);
}

function finishChecks(s: GameState): void {
  const conqueror = conquerorOf(s);
  if (conqueror !== null) endGame(s, 'conquest', conqueror);
}

/** Wendet das Kampfergebnis an (Regeln 6, 7, 9). */
export function finishCombat(s: GameState): void {
  if (!s.combat) throw new RuleError('Es läuft kein Kampf.');
  const { state: c, encounter: e } = s.combat;
  if (c.step !== 'done' || !c.result) throw new RuleError('Der Kampf läuft noch.');
  s.combat = null;
  const attacker = getHero(s, e.heroId);
  const t = e.target;
  const tile = tileAt(s, t.hex) as Tile;
  const fled = c.result.fled;
  const winner = c.result.winner;

  // Überlebende zurückschreiben. ANNAHME: Restschaden verfällt nach dem Kampf.
  attacker.army = fled === 'attacker' ? [] : survivors(c, 'attacker', 'hero');
  const cityOwner = t.kind === 'city' ? getCity(s, t.cityId).owner : null;
  const defenderHero = t.kind === 'hero' ? getHero(s, t.heroId)
    : t.kind === 'city' ? heroAt(s, t.hex).find(h => h.owner === cityOwner) : undefined;
  if (defenderHero) defenderHero.army = fled === 'defender' ? [] : survivors(c, 'defender', 'hero');
  if (t.kind === 'city') getCity(s, t.cityId).garrison = fled === 'defender' ? [] : survivors(c, 'defender', 'garrison');
  if ((t.kind === 'guardian' || t.kind === 'heart') && tile.content && 'army' in tile.content) {
    tile.content.army = survivors(c, 'defender', 'guardian');
  }

  if (winner === null) {
    // Regel 7: Rückzug des Angreifers. ANNAHME: Der Held bleibt auf dem Ausgangsfeld, Bewegung verfällt.
    attacker.pos = { ...e.from };
    attacker.movement = 0;
    log(s, `${heroDefById[attacker.defId].name} zieht sich nach ${BALANCE.combat.maxRounds} Runden zurück.`);
    return;
  }

  const defenderInitial = c.stacks.filter(x => x.side === 'defender').reduce((n, x) => n + x.initialCount, 0);
  const attackerInitial = c.stacks.filter(x => x.side === 'attacker').reduce((n, x) => n + x.initialCount, 0);

  if (winner === 'attacker') {
    const player = s.players[attacker.owner];
    const defeatedUnits = c.killed.defender;
    if (t.kind === 'guardian' && tile.content?.kind === 'guardian') {
      const tier = tile.content.tier;
      player.fame.guardian += BALANCE.fame.guardian[tier];
      log(s, `${player.name} besiegt: ${tile.content.name}. +${BALANCE.fame.guardian[tier]} Ruhm.`);
      tile.content = null;
      addXp(s, attacker, tier * BALANCE.xp.guardianPerTier);
    } else if (t.kind === 'heart' && tile.content?.kind === 'heart') {
      // ANNAHME: Das Herz zählt als Stufe-III-Wächter (3 Ruhm) und gibt zusätzlich 2 Ruhm und 2 Hinweise.
      player.fame.guardian += BALANCE.fame.guardian[3];
      player.fame.heart += BALANCE.fame.heart;
      log(s, `${player.name} bezwingt den Wächter des Herzens!`);
      tile.content.army = null;
      for (let i = 0; i < BALANCE.heart.hints; i++) addHint(s, attacker.owner);
      addXp(s, attacker, 3 * BALANCE.xp.guardianPerTier);
    } else if (defenderHero || t.kind === 'hero') {
      // ANNAHME: Flucht oder ein Gegner ohne Armee geben keinen Heldensieg.
      if (fled !== 'defender' && defenderHero && defenderInitial > 0) {
        player.fame.heroWin += BALANCE.fame.heroWin;
        addXp(s, attacker, BALANCE.xp.heroBase + defenderHero.level);
      }
    }
    winnerBonus(s, attacker, defeatedUnits);
    if (t.kind === 'hero') sendHome(s, getHero(s, t.heroId));
    if (t.kind === 'city') captureCity(s, t.cityId, attacker);
    enterTile(s, attacker, tile);
  } else {
    // Verteidiger gewinnt (auch durch Flucht des Angreifers).
    const defendingPlayer = c.sides.defender.playerId;
    if (defenderHero && fled !== 'attacker' && attackerInitial > 0) {
      addXp(s, defenderHero, BALANCE.xp.heroBase + attacker.level);
    }
    if (defendingPlayer !== null) {
      if (fled !== 'attacker') s.players[defendingPlayer].fame.heroWin += BALANCE.fame.heroWin;
      if (defenderHero) winnerBonus(s, defenderHero, c.killed.attacker);
    }
    sendHome(s, attacker);
  }
  finishChecks(s);
}

/** Wer muss gerade handeln? Berücksichtigt Kampf und Aufstiege. */
export function currentDecider(s: GameState): PlayerId | null {
  if (s.phase === 'ended') return null;
  if (s.combat) {
    const c = s.combat.state;
    const side = combatPendingSide(c);
    const attackerOwner = c.sides.attacker.playerId as PlayerId;
    if (!side) return attackerOwner;
    return c.sides[side].playerId ?? attackerOwner;
  }
  const leveling = Object.values(s.heroes).find(h => h.levelUp);
  if (leveling) return leveling.owner;
  return s.order[s.activeIndex];
}
