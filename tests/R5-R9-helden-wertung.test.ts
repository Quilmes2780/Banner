import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { combatReducer } from '../src/engine/combat/combat';
import { autoCombatAction } from '../src/engine/combat/policy';
import { currentDecider, buildCombatSetup } from '../src/engine/encounter';
import { RuleError } from '../src/engine/errors';
import { levelForXp } from '../src/engine/hero';
import { citiesOf, effectiveStat, heroesOf, terrainCost, weeklyMovement } from '../src/engine/helpers';
import { hexKey, neighbors } from '../src/engine/hex';
import { conquerorOf, fameBreakdown, fameLeaders } from '../src/engine/scoring';
import type { CombatAction } from '../src/engine/combat/types';
import type { GameState, Hero, Hex, Stack, TileContent } from '../src/engine/types';
import { act, clearBoard, heroOf, newGame, place, setTile, toHeroPhase } from './helpers';

const FIELD: Hex = { q: 0, r: 3 };
const START: Hex = { q: 0, r: 2 };
const big: Stack[] = [{ creatureId: 'hainrufer', count: 6 }, { creatureId: 'kronritter', count: 2 }];

/** Bereitet einen Angriff von START auf FIELD vor. */
function arena(content: TileContent | null, realms = ['kronland', 'wildhain'], seed = 7): { s: GameState; hero: Hero } {
  let s = newGame(2, realms, seed);
  clearBoard(s);
  const hero = heroOf(s, 0);
  hero.defId = realms[0] === 'knochenfeste' ? 'gerulf' : hero.defId;
  place(hero, START, { army: big.map(a => ({ ...a })) });
  setTile(s, FIELD, { content, revealedBy: [0] });
  s = toHeroPhase(s);
  return { s, hero: heroOf(s, 0) };
}
/** Spielt den Kampf automatisch aus; optional mit erzwungener erster Aktion. */
function fight(s: GameState, first?: CombatAction): GameState {
  let n = act(s, { type: 'startEncounter' });
  if (first) n = act(n, { type: 'combat', action: first });
  let guard = 0;
  while (n.combat && n.combat.state.step !== 'done' && guard++ < 300) {
    n = act(n, { type: 'combat', action: autoCombatAction(n.combat.state) });
  }
  return n.combat ? act(n, { type: 'finishCombat' }) : n;
}
const engage = (s: GameState, hero: Hero) => act(s, { type: 'move', heroId: hero.id, path: [FIELD] });
const guard = (tier: 1 | 2 | 3): TileContent => ({ kind: 'guardian', tier, name: 'W', army: [{ creatureId: 'raeuber', count: 1 }] });

describe('R6 Erfahrung und Aufstieg', () => {
  it('Schwellen 4/9/15/22', () => {
    expect([0, 3, 4, 8, 9, 14, 15, 21, 22, 99].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  it.each([[1, 2], [2, 4], [3, 6]] as const)('Wächterstufe %i gibt %i Erfahrung', (tier, xp) => {
    const { s, hero } = arena(guard(tier));
    hero.defId = 'alda';
    const end = fight(engage(s, hero));
    expect(heroOf(end, 0).xp).toBe(xp);
  });
  it('Sieg gegen Helden: 3 + deren Stufe', () => {
    const { s, hero } = arena(null);
    hero.defId = 'alda';
    const foe = heroOf(s, 1);
    place(foe, FIELD, { army: [{ creatureId: 'raeuber', count: 1 }] });
    foe.level = 3;
    const end = fight(engage(s, hero));
    expect(heroOf(end, 0).xp).toBe(6);
  });
  it('Aufstieg: +1 Wert und 1 von 2 Fertigkeitskarten; blockiert andere Aktionen', () => {
    const { s, hero } = arena({ kind: 'treasure', reward: { type: 'xp', value: 4 } });
    hero.defId = 'alda';
    const n = engage(s, hero);
    const h = heroOf(n, 0);
    expect(h.level).toBe(2);
    expect(h.levelUp).toHaveLength(2);
    expect(() => act(n, { type: 'endHeroPhase' })).toThrow(RuleError);
    expect(currentDecider(n)).toBe(0);
    const pick = h.levelUp?.[0] as string;
    expect(() => act(n, { type: 'chooseLevelUp', heroId: h.id, stat: 'attack', skillId: 'gibtsnicht' })).toThrow(RuleError);
    const after = act(n, { type: 'chooseLevelUp', heroId: h.id, stat: 'attack', skillId: pick });
    expect(heroOf(after, 0).attack).toBe(h.attack + 1);
    expect(heroOf(after, 0).skills).toEqual([pick]);
    expect(heroOf(after, 0).levelUp).toBeNull();
  });
  it('Mehrere Aufstiege nacheinander', () => {
    const { s, hero } = arena({ kind: 'treasure', reward: { type: 'xp', value: 9 } });
    hero.defId = 'alda';
    const n = engage(s, hero);
    const h = heroOf(n, 0);
    const n2 = act(n, { type: 'chooseLevelUp', heroId: h.id, stat: 'magic', skillId: (h.levelUp as string[])[0] });
    expect(heroOf(n2, 0).level).toBe(3);
    expect(heroOf(n2, 0).levelUp).toHaveLength(2);
  });
});

describe('R6 Helden', () => {
  it('Zweiter Held für 10 Gold, höchstens zwei', () => {
    let s = newGame(2);
    s.players[0].resources.gold = 25;
    const other = heroesOf(s, 0)[0].defId === 'alda' ? 'bertram' : 'alda';
    s = act(s, { type: 'hireHero', cityId: 'c0', defId: other });
    expect(s.players[0].resources.gold).toBe(15);
    expect(heroesOf(s, 0)).toHaveLength(2);
    expect(heroesOf(s, 0)[1].army).toEqual([]);
    expect(() => act(s, { type: 'hireHero', cityId: 'c0', defId: other })).toThrow(RuleError);
  });
  it('Fremde Helden sind nicht anwerbbar, Gold nötig', () => {
    const s = newGame(2);
    expect(() => act(s, { type: 'hireHero', cityId: 'c0', defId: 'liora' })).toThrow(RuleError);
    s.players[0].resources.gold = 9;
    const other = heroesOf(s, 0)[0].defId === 'alda' ? 'bertram' : 'alda';
    expect(() => act(s, { type: 'hireHero', cityId: 'c0', defId: other })).toThrow(RuleError);
  });
  it('Max. 3 Artefakte; danach Ersatzgold', () => {
    const { s, hero } = arena({ kind: 'treasure', reward: { type: 'artifact', artifactId: 'glutstab' } });
    hero.artifacts = ['kampfbeil', 'turmschild', 'wanderstiefel'];
    const before = s.players[0].resources.gold;
    const n = engage(s, hero);
    expect(heroOf(n, 0).artifacts).toHaveLength(BALANCE.maxArtifacts);
    expect(n.players[0].resources.gold).toBe(before + BALANCE.map.treasure.artifactFallbackGold);
  });
  it('Artefakte und Fertigkeiten wirken auf Werte und Bewegung', () => {
    const s = newGame(2);
    const h = heroOf(s, 0);
    h.defId = 'alda';
    const a = effectiveStat(s, h, 'attack');
    h.artifacts = ['kampfbeil', 'wanderstiefel'];
    h.skills = ['bergfuehrer'];
    expect(effectiveStat(s, h, 'attack')).toBe(a + 1);
    expect(weeklyMovement(s, h)).toBe(5);
    expect(terrainCost(s, h, 'mountain')).toBe(1);
  });
  it('Spezialität fließt in den Kampf ein', () => {
    const { s, hero } = arena(guard(1));
    hero.defId = 'alda';
    const setup = buildCombatSetup(s, { heroId: hero.id, target: { kind: 'guardian', hex: FIELD }, from: START, moveCost: 1 }, 1);
    expect(setup.attacker.tierDice[1]).toBe(1);
  });
});

describe('R5 Reiche', () => {
  it('Kronland: Mauer +1 Verteidigung zusätzlich, andere nur +1', () => {
    for (const [realm, bonus] of [['kronland', 2], ['wildhain', 1]] as const) {
      const s = newGame(2, ['aschenturm', realm]);
      s.cities.c1.buildings.push('wall');
      const hero = heroOf(s, 0);
      const setup = buildCombatSetup(s, { heroId: hero.id, target: { kind: 'city', hex: s.cities.c1.pos, cityId: 'c1' }, from: START, moveCost: 1 }, 1);
      expect(setup.defender.defense).toBe(heroOf(s, 1).defense + bonus);
    }
  });
  it('Aschenturm: 2 Zauber pro Kampf, andere 1', () => {
    const s = newGame(2, ['aschenturm', 'kronland']);
    const enc = (p: number, target: Hex) => ({ heroId: heroOf(s, p).id, target: { kind: 'hero' as const, hex: target, heroId: heroOf(s, 1 - p).id }, from: START, moveCost: 1 });
    expect(buildCombatSetup(s, enc(0, heroOf(s, 1).pos), 1).attacker.spellSlots).toBe(2);
    expect(buildCombatSetup(s, enc(1, heroOf(s, 0).pos), 1).attacker.spellSlots).toBe(1);
  });
  it('Knochenfeste: 1 Skelett je 3 besiegte Einheiten', () => {
    const { s, hero } = arena({ kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 6 }] }, ['knochenfeste', 'wildhain']);
    hero.army = [{ creatureId: 'kronritter', count: 2 }, { creatureId: 'hainrufer', count: 6 }];
    const end = fight(engage(s, hero));
    expect(heroOf(end, 0).army.find(a => a.creatureId === 'skelett')?.count).toBe(2);
  });
  it('Knochenfeste: ohne Platz keine Skelette', () => {
    const { s, hero } = arena({ kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 6 }] }, ['knochenfeste', 'wildhain']);
    hero.army = [{ creatureId: 'kronritter', count: 2 }, { creatureId: 'hainrufer', count: 6 }, { creatureId: 'falkenreiter', count: 6 }];
    const end = fight(engage(s, hero));
    expect(heroOf(end, 0).army.some(a => a.creatureId === 'skelett')).toBe(false);
  });
});

describe('R7 Kampfende auf der Karte', () => {
  it('Sieg: Wächter weg, Held auf dem Feld, Bewegung bezahlt', () => {
    const { s, hero } = arena(guard(1));
    const n = engage(s, hero);
    const end = fight(n);
    expect(end.tiles[hexKey(FIELD)].content).toBeNull();
    expect(heroOf(end, 0).pos).toEqual(FIELD);
    expect(heroOf(end, 0).movement).toBe(hero.movement - 1);
  });
  it('Niederlage: Armee weg, Held zur Hauptstadt, Wächter behält seine Überlebenden', () => {
    const { s, hero } = arena({ kind: 'guardian', tier: 3, name: 'W', army: [{ creatureId: 'uraltwache', count: 2 }] });
    hero.army = [{ creatureId: 'landwehr', count: 1 }];
    const end = fight(engage(s, hero));
    expect(heroOf(end, 0).army).toEqual([]);
    expect(heroOf(end, 0).pos).toEqual(end.cities.c0.pos);
    const c = end.tiles[hexKey(FIELD)].content;
    expect(c?.kind === 'guardian' && c.army.length).toBe(1);
    expect(end.players[0].fame.guardian).toBe(0);
  });
  it('Flucht: Armee verloren, Held zur Hauptstadt, kein Heldensieg für den Gegner', () => {
    const { s, hero } = arena(null);
    place(heroOf(s, 1), FIELD, { army: [{ creatureId: 'raeuber', count: 1 }] });
    let n = act(engage(s, hero), { type: 'startEncounter' });
    n = act(n, { type: 'combat', action: { type: 'place', placements: [{ stackId: n.combat!.state.stacks.find(x => x.side === 'defender')!.id, row: 0, line: 'front' }] } });
    const atk = n.combat!.state.stacks.filter(x => x.side === 'attacker');
    n = act(n, { type: 'combat', action: { type: 'place', placements: atk.map((x, i) => ({ stackId: x.id, row: i, line: 'front' as const })) } });
    n = act(n, { type: 'combat', action: { type: 'flee' } }, { type: 'finishCombat' });
    expect(heroOf(n, 0).army).toEqual([]);
    expect(heroOf(n, 0).pos).toEqual(n.cities.c0.pos);
    expect(n.players[1].fame.heroWin).toBe(0);
    expect(heroOf(n, 1).army).toHaveLength(1);
  });
  it('Rückzug nach 3 Runden: Held bleibt auf dem Ausgangsfeld, Bewegung verfällt, keine Belohnung', () => {
    const { s, hero } = arena(guard(1));
    hero.army = [{ creatureId: 'landwehr', count: 1 }];
    let n = act(engage(s, hero), { type: 'startEncounter' });
    const attackerId = n.combat!.state.stacks.find(x => x.side === 'attacker')!.id;
    // Der Angreifer steht hinten und setzt aus; der Wächter steht vorn und kommt nicht heran.
    n = act(n, { type: 'combat', action: { type: 'place', placements: [{ stackId: attackerId, row: 0, line: 'back' }] } });
    const st = structuredClone(n);
    let c = st.combat!.state;
    while (c.step !== 'done') {
      if (c.step === 'decision') c = combatReducer(c, { type: 'passDecision' });
      else c = combatReducer(c, { type: 'pass' });
    }
    st.combat!.state = c;
    const end = act(st, { type: 'finishCombat' });
    expect(heroOf(end, 0).pos).toEqual(START);
    expect(heroOf(end, 0).movement).toBe(0);
    expect(heroOf(end, 0).army).toHaveLength(1);
    expect(end.tiles[hexKey(FIELD)].content?.kind).toBe('guardian');
    expect(end.players[0].fame.guardian).toBe(0);
  });
  it('Ohne Armee ist kein Angriff möglich', () => {
    const { s, hero } = arena(guard(1));
    hero.army = [];
    expect(() => act(engage(s, hero), { type: 'startEncounter' })).toThrow(RuleError);
  });
  it('Belagerung: Sieg übernimmt die Stadt und wirft den Verteidiger hinaus', () => {
    let s = newGame(3);
    clearBoard(s);
    const c1 = s.cities.c1;
    const hero = heroOf(s, 0);
    const foe = heroOf(s, 1);
    place(foe, c1.pos, { army: [{ creatureId: 'raeuber', count: 1 }] });
    c1.garrison = [{ creatureId: 'raeuber', count: 1 }];
    const from = neighbors(c1.pos).find(n => s.tiles[hexKey(n)])!;
    place(hero, from, { army: big.map(a => ({ ...a })) });
    setTile(s, c1.pos, { revealedBy: [0, 1] });
    s = toHeroPhase(s);
    const end = fight(act(s, { type: 'move', heroId: hero.id, path: [c1.pos] }));
    expect(end.cities.c1.owner).toBe(0);
    expect(end.cities.c1.garrison).toEqual([]);
    expect(heroOf(end, 0).pos).toEqual(c1.pos);
    // ANNAHME: Ohne weitere Stadt ist der Verteidiger verloren und der Spieler scheidet aus.
    expect(heroesOf(end, 1)).toEqual([]);
    expect(end.players[1].eliminated).toBe(true);
  });
  it('Verteidigender Held mit zweiter Stadt zieht dorthin zurück', () => {
    let s = newGame(3);
    clearBoard(s);
    const c1 = s.cities.c1;
    s.cities.c2.owner = 1;
    const hero = heroOf(s, 0);
    place(heroOf(s, 1), c1.pos, { army: [{ creatureId: 'raeuber', count: 1 }] });
    place(hero, neighbors(c1.pos).find(n => s.tiles[hexKey(n)])!, { army: big.map(a => ({ ...a })) });
    setTile(s, c1.pos, { revealedBy: [0, 1] });
    s = toHeroPhase(s);
    const end = fight(act(s, { type: 'move', heroId: hero.id, path: [c1.pos] }));
    expect(heroOf(end, 1).pos).toEqual(end.cities.c2.pos);
    expect(heroOf(end, 1).army).toEqual([]);
    expect(end.players[1].eliminated).toBe(false);
  });
  it('Leere Stadt ohne Mauer fällt kampflos, Verlierer ohne Helden und Städte scheidet aus', () => {
    let s = newGame(3);
    clearBoard(s);
    const c1 = s.cities.c1;
    delete s.heroes[heroOf(s, 1).id];
    const hero = heroOf(s, 0);
    const from = neighbors(c1.pos).find(n => s.tiles[hexKey(n)])!;
    place(hero, from, { army: big.map(a => ({ ...a })) });
    setTile(s, c1.pos, { revealedBy: [0, 1] });
    s = toHeroPhase(s);
    const end = act(s, { type: 'move', heroId: hero.id, path: [c1.pos] }, { type: 'startEncounter' });
    expect(end.combat).toBeNull();
    expect(end.cities.c1.owner).toBe(0);
    expect(end.players[1].eliminated).toBe(true);
  });
  it('Ausgeschiedene Spieler werden übersprungen', () => {
    let s = newGame(3);
    s.players[1].eliminated = true;
    s = act(s, { type: 'endCityPhase' }, { type: 'endHeroPhase' });
    expect(s.order[s.activeIndex]).toBe(2);
  });
  it('Hotseat: Beim Aufstellen entscheidet der Verteidiger', () => {
    const { s, hero } = arena(null);
    place(heroOf(s, 1), FIELD, { army: [{ creatureId: 'raeuber', count: 1 }] });
    const n = act(engage(s, hero), { type: 'startEncounter' });
    expect(currentDecider(n)).toBe(1);
  });
});

describe('R8 Gilde und Portal', () => {
  const withGuild = (p = 0) => {
    const s = newGame(2);
    s.cities[`c${p}`].buildings.push('guild');
    return s;
  };
  it('2 ziehen, 1 behalten, einmal pro Woche', () => {
    let s = withGuild();
    const h = heroOf(s, 0);
    h.spells = [];
    s = act(s, { type: 'guildDraw', cityId: 'c0', heroId: h.id });
    const opts = s.guildOffer?.options as string[];
    expect(opts).toHaveLength(2);
    expect(() => act(s, { type: 'endCityPhase' })).toThrow(RuleError);
    s = act(s, { type: 'guildKeep', spellId: opts[0] });
    expect(heroOf(s, 0).spells).toEqual([opts[0]]);
    expect(() => act(s, { type: 'guildDraw', cityId: 'c0', heroId: h.id })).toThrow(RuleError);
  });
  it('Ohne Ausbau nur Stufe 1, mit Ausbau auch Stufe 2', () => {
    const levelTwo = new Set(['fireball', 'portal']);
    let sawTwo = false;
    for (let seed = 0; seed < 40; seed++) {
      const base = newGame(2, undefined, seed);
      base.cities.c0.buildings.push('guild');
      heroOf(base, 0).spells = [];
      const s = act(base, { type: 'guildDraw', cityId: 'c0', heroId: heroOf(base, 0).id });
      expect((s.guildOffer as { options: string[] }).options.some(o => levelTwo.has(o))).toBe(false);
      base.cities.c0.buildings.push('guildUpgrade');
      const u = act(base, { type: 'guildDraw', cityId: 'c0', heroId: heroOf(base, 0).id });
      if ((u.guildOffer as { options: string[] }).options.some(o => levelTwo.has(o))) sawTwo = true;
    }
    expect(sawTwo).toBe(true);
  });
  it('Gilde braucht Gebäude und Held in der Stadt', () => {
    const none = newGame(2);
    expect(() => act(none, { type: 'guildDraw', cityId: 'c0', heroId: heroOf(none, 0).id })).toThrow(RuleError);
    const s = withGuild();
    heroOf(s, 0).pos = { q: 0, r: 0 };
    expect(() => act(s, { type: 'guildDraw', cityId: 'c0', heroId: heroOf(s, 0).id })).toThrow(RuleError);
  });
  it('Stadtportal: einmal pro Woche in eine eigene Stadt, verbraucht die Bewegung', () => {
    let s = newGame(2);
    const h = heroOf(s, 0);
    h.spells = ['portal'];
    place(h, { q: 0, r: 0 });
    s = toHeroPhase(s);
    expect(() => act(s, { type: 'portal', heroId: h.id, cityId: 'c1' })).toThrow(RuleError);
    s = act(s, { type: 'portal', heroId: h.id, cityId: 'c0' });
    expect(heroOf(s, 0).pos).toEqual(s.cities.c0.pos);
    expect(heroOf(s, 0).movement).toBe(0);
    heroOf(s, 0).movement = 4;
    expect(() => act(s, { type: 'portal', heroId: h.id, cityId: 'c0' })).toThrow(RuleError);
  });
  it('Ohne Zauber kein Portal', () => {
    const s = toHeroPhase(newGame(2));
    heroOf(s, 0).spells = [];
    expect(() => act(s, { type: 'portal', heroId: heroOf(s, 0).id, cityId: 'c0' })).toThrow(RuleError);
  });
});

describe('R9 Spielende und Ruhm', () => {
  it('Ende nach Woche 10, Sieger hat den meisten Ruhm', () => {
    let s = newGame(2);
    clearBoard(s);
    s.players[1].fame.guardian = 9;
    for (let i = 0; i < 20; i++) s = act(s, { type: 'endCityPhase' }, { type: 'endHeroPhase' });
    expect(s.phase).toBe('ended');
    expect(s.week).toBe(BALANCE.weeks);
    expect(s.endReason).toBe('weeks');
    expect(s.winners).toEqual([1]);
    expect(() => act(s, { type: 'endCityPhase' })).toThrow(RuleError);
  });
  it('Sofortsieg, wenn ein Spieler alle gegnerischen Hauptstädte hält', () => {
    let s = newGame(2);
    clearBoard(s);
    const c1 = s.cities.c1;
    const hero = heroOf(s, 0);
    delete s.heroes[heroOf(s, 1).id];
    place(hero, neighbors(c1.pos).find(n => s.tiles[hexKey(n)])!, { army: big.map(a => ({ ...a })) });
    setTile(s, c1.pos, { revealedBy: [0] });
    s.players[1].fame.guardian = 99;
    s = toHeroPhase(s);
    s = act(s, { type: 'move', heroId: hero.id, path: [c1.pos] }, { type: 'startEncounter' });
    expect(s.phase).toBe('ended');
    expect(s.endReason).toBe('conquest');
    expect(s.winners).toEqual([0]); // ANNAHME: unabhängig vom Ruhm
  });
  it('Bei 3 Spielern reicht eine Eroberung nicht', () => {
    const s = newGame(3);
    s.cities.c1.owner = 0;
    expect(conquerorOf(s)).toBeNull();
    s.cities.c2.owner = 0;
    expect(conquerorOf(s)).toBe(0);
  });
  it.each([[1, 1], [2, 2], [3, 3]] as const)('Wächter Stufe %i: %i Ruhm', (tier, fame) => {
    const { s, hero } = arena(guard(tier));
    expect(fight(engage(s, hero)).players[0].fame.guardian).toBe(fame);
  });
  it('Heldensieg 3 Ruhm', () => {
    const { s, hero } = arena(null);
    place(heroOf(s, 1), FIELD, { army: [{ creatureId: 'raeuber', count: 1 }] });
    expect(fight(engage(s, hero)).players[0].fame.heroWin).toBe(3);
  });
  it('Verteidiger erhält den Heldensieg ebenfalls', () => {
    const { s, hero } = arena(null);
    hero.army = [{ creatureId: 'raeuber', count: 1 }];
    place(heroOf(s, 1), FIELD, { army: [{ creatureId: 'uraltwache', count: 2 }] });
    expect(fight(engage(s, hero)).players[1].fame.heroWin).toBe(3);
  });
  it('Herz: Wächterruhm + 2 Ruhm + 2 Hinweise', () => {
    const { s, hero } = arena({ kind: 'heart', name: 'H', army: [{ creatureId: 'raeuber', count: 1 }] });
    const end = fight(engage(s, hero));
    expect(end.players[0].fame.heart).toBe(2);
    expect(end.players[0].fame.guardian).toBe(3);
    expect(end.players[0].hints).toHaveLength(2);
    const c = end.tiles[hexKey(FIELD)].content;
    expect(c?.kind === 'heart' && c.army).toBeNull();
  });
  it('Endwertung: Stadt 3, eroberte Hauptstadt 5, Kapitol 3, Mine 1', () => {
    const s = newGame(2);
    clearBoard(s);
    s.cities.c1.owner = 0;
    s.cities.c1.buildings.push('capitol');
    setTile(s, { q: 0, r: 1 }, { content: { kind: 'mine', resource: 'gold', owner: 0 } });
    const b = fameBreakdown(s, 0);
    expect(b.city).toBe(3);
    expect(b.capturedCapital).toBe(5);
    expect(b.capitol).toBe(3);
    expect(b.mine).toBe(1);
    expect(fameBreakdown(s, 1).city).toBe(0);
  });
  it('Endwertung: Heldenstufe über 1, Artefakt, 1 je 10 Einheiten-Stufen', () => {
    const s = newGame(2);
    const h = heroOf(s, 0);
    h.level = 3;
    h.artifacts = ['kampfbeil', 'glutstab'];
    h.army = [{ creatureId: 'hainrufer', count: 6 }, { creatureId: 'kronritter', count: 1 }]; // 18 + 4
    citiesOf(s, 0)[0].garrison = [{ creatureId: 'landwehr', count: 6 }]; // + 6 = 28
    const b = fameBreakdown(s, 0);
    expect(b.heroLevel).toBe(2);
    expect(b.artifact).toBe(2);
    expect(b.armyLevels).toBe(2);
  });
  it('Summe entspricht den Quellen; Gleichstand hat mehrere Sieger', () => {
    const s = newGame(2);
    clearBoard(s);
    const b = fameBreakdown(s, 0);
    const { total, ...rest } = b;
    expect(total).toBe(Object.values(rest).reduce((x, y) => x + y, 0));
    expect(fameLeaders(s).sort()).toEqual([0, 1]);
  });
});
