import { describe, expect, it } from 'vitest';
import {
  applyDamage, attackThreshold, combatReducer, diceCount, hitThreshold, initCombat, initiativeOrder, legalMoves,
  legalTargets, stackOf,
} from '../src/engine/combat/combat';
import { autoCombatAction, guardianTarget, runToEnd, simulateCombat } from '../src/engine/combat/policy';
import type { CStack, CombatSetup, CombatState, Line, Placement, Side, SideSetup } from '../src/engine/combat/types';
import { RuleError } from '../src/engine/errors';

const side = (over: Partial<SideSetup> = {}): SideSetup => ({
  kind: 'hero', label: 'Held', playerId: 0, attack: 0, defense: 0, magic: 0, spells: [], spellSlots: 1,
  rangedNoPenalty: false, tierDice: {}, army: [], ...over,
});
const setup = (a: Partial<SideSetup>, d: Partial<SideSetup>, over: Partial<CombatSetup> = {}): CombatSetup => ({
  attacker: side({ label: 'A', ...a }), defender: side({ label: 'D', playerId: 1, ...d }), siege: null, seed: 1, ...over,
});

/** Stellt alles wie angegeben auf; pos: Stapel-id -> [Reihe, Linie]. */
function placed(s: CombatSetup, pos: Record<number, [number, Line]>): CombatState {
  let c = initCombat(s);
  for (const who of ['defender', 'attacker'] as Side[]) {
    if (c.step !== 'placement' || c.pendingSide !== who) continue;
    const placements: Placement[] = c.stacks.filter(x => x.side === who).map(x => ({ stackId: x.id, row: pos[x.id][0], line: pos[x.id][1] }));
    c = combatReducer(c, { type: 'place', placements });
  }
  return c;
}
const toActivation = (c: CombatState): CombatState => {
  let n = c;
  while (n.step === 'decision') n = combatReducer(n, { type: 'passDecision' });
  return n;
};
const melee = (n: number, id = 'landwehr') => [{ creatureId: id, count: n }];

describe('R7 Aufstellung und Initiative', () => {
  it('Verteidiger stellt zuerst auf', () => {
    const c = initCombat(setup({ army: melee(1) }, { army: melee(1) }));
    expect(c.step).toBe('placement');
    expect(c.pendingSide).toBe('defender');
    const n = combatReducer(c, { type: 'place', placements: [{ stackId: 2, row: 0, line: 'front' }] });
    expect(n.pendingSide).toBe('attacker');
  });
  it('Wächter stellen sich selbst auf', () => {
    const c = initCombat(setup({ army: melee(1) }, { kind: 'guardian', playerId: null, army: melee(1, 'raeuber') }));
    expect(c.pendingSide).toBe('attacker');
    expect(c.stacks[1].row).toBeGreaterThanOrEqual(0);
  });
  it('zwei Stapel dürfen nicht auf demselben Feld stehen', () => {
    const c = initCombat(setup({ army: melee(1) }, { army: [...melee(1), { creatureId: 'armbruster', count: 1 }] }));
    expect(() => combatReducer(c, { type: 'place', placements: [{ stackId: 2, row: 0, line: 'front' }, { stackId: 3, row: 0, line: 'front' }] })).toThrow(RuleError);
  });
  it('Initiative nach Tempo, Gleichstand zugunsten des Angreifers', () => {
    const c = placed(setup(
      { army: melee(1) }, // Tempo 3
      { army: [{ creatureId: 'dornling', count: 1 }, { creatureId: 'hainrufer', count: 1 }] }, // Tempo 3 und 5
    ), { 1: [0, 'front'], 2: [0, 'front'], 3: [1, 'back'] });
    expect(initiativeOrder(c)).toEqual([3, 1, 2]);
  });
});

describe('R7 Zielregeln', () => {
  const pos = { 1: [0, 'front'], 2: [0, 'front'], 3: [2, 'front'], 4: [1, 'back'] } as Record<number, [number, Line]>;
  const c = placed(setup({ army: melee(1) }, { army: [{ creatureId: 'dornling', count: 1 }, { creatureId: 'hainrufer', count: 1 }, { creatureId: 'waldschuetze', count: 1 }] }), pos);
  it('Nahkampf nur vorn gegen vorn in gleicher oder Nachbarreihe', () => {
    expect(legalTargets(c, stackOf(c, 1)).map(s => s.id)).toEqual([2]);
  });
  it('Nachbarreihe zählt, übernächste nicht', () => {
    const s1 = { ...stackOf(c, 1), row: 1 };
    expect(legalTargets(c, s1).map(s => s.id)).toEqual([2, 3]);
  });
  it('hintere Linie erst, wenn vorn leer ist', () => {
    const n: CombatState = { ...c, stacks: c.stacks.map(s => (s.id === 2 || s.id === 3 ? { ...s, count: 0 } : s)) };
    const a = { ...stackOf(n, 1), row: 1 };
    expect(legalTargets(n, a).map(s => s.id)).toEqual([4]);
  });
  it('Nahkämpfer in hinterer Linie haben kein Ziel', () => {
    expect(legalTargets(c, { ...stackOf(c, 1), line: 'back' })).toEqual([]);
  });
  it('Fliegende und Fernkämpfer erreichen alle Gegner', () => {
    const fly = { ...stackOf(c, 1), abilities: ['flying'], line: 'back' } as CStack;
    expect(legalTargets(c, fly)).toHaveLength(3);
    const shoot = { ...stackOf(c, 1), abilities: ['ranged'], line: 'back' } as CStack;
    expect(legalTargets(c, shoot)).toHaveLength(3);
  });
  it('ANNAHME: Ziehen nur auf freie Nachbarfelder der eigenen Seite', () => {
    const m = legalMoves(c, stackOf(c, 1));
    expect(m).toContainEqual({ row: 0, line: 'back' });
    expect(m).toContainEqual({ row: 1, line: 'front' });
    expect(m).toHaveLength(2);
  });
});

describe('R7 Trefferwurf', () => {
  it('Basis 4+', () => expect(hitThreshold(1, 1)).toBe(4));
  it('Vorsprung 1 -> 3+, 2 oder mehr -> 2+', () => {
    expect(hitThreshold(2, 1)).toBe(3);
    expect(hitThreshold(3, 1)).toBe(2);
    expect(hitThreshold(9, 0)).toBe(2);
  });
  it('Rückstand 1 -> 5+, 2 oder mehr -> 6+', () => {
    expect(hitThreshold(1, 2)).toBe(5);
    expect(hitThreshold(0, 2)).toBe(6);
    expect(hitThreshold(0, 9)).toBe(6);
  });
  it('Grenzen gelten auch mit Effekten', () => {
    expect(hitThreshold(5, 0, -1)).toBe(2);
    expect(hitThreshold(0, 5, 1)).toBe(6);
  });
  it('Fernkampf -1, wenn selbst vorn mit Gegner gegenüber', () => {
    const s = setup({ army: melee(1, 'armbruster') }, { army: melee(1) });
    const near = placed(s, { 1: [0, 'front'], 2: [0, 'front'] });
    expect(attackThreshold(near, near.stacks[0], near.stacks[1], true)).toBe(5);
    const offset = placed(s, { 1: [0, 'front'], 2: [1, 'front'] });
    expect(attackThreshold(offset, offset.stacks[0], offset.stacks[1], true)).toBe(4);
    const back = placed(s, { 1: [0, 'back'], 2: [0, 'front'] });
    expect(attackThreshold(back, back.stacks[0], back.stacks[1], true)).toBe(4);
  });
  it('Würfelzahl = Einheiten x Würfel, höchstens 8', () => {
    const c = placed(setup({ army: melee(2, 'kronritter') }, { army: melee(1) }), { 1: [0, 'front'], 2: [0, 'front'] });
    expect(diceCount(c, c.stacks[0])).toBe(4);
    expect(diceCount(c, { ...c.stacks[0], count: 9 })).toBe(8);
  });
});

describe('R7 Schaden', () => {
  const c = placed(setup({ army: melee(1) }, { army: melee(3, 'hainrufer') }), { 1: [0, 'front'], 2: [0, 'front'] });
  it('je volle LP stirbt eine Einheit, Restschaden bleibt', () => {
    const n = structuredClone(c);
    const t = n.stacks[1];
    expect(applyDamage(n, t, 4)).toBe(1);
    expect(t.count).toBe(2);
    expect(t.damage).toBe(1);
    expect(applyDamage(n, t, 2)).toBe(1); // Rest 1 + 2 = 3 LP
    expect(t.count).toBe(1);
    expect(t.damage).toBe(0);
  });
  it('Überschaden tötet nicht mehr Einheiten als vorhanden', () => {
    const n = structuredClone(c);
    expect(applyDamage(n, n.stacks[1], 99)).toBe(3);
    expect(n.stacks[1].count).toBe(0);
  });
});

describe('R7 Rückschlag und Rundenablauf', () => {
  it('Nahkampfziel schlägt zurück, aber nur einmal pro Runde', () => {
    let c = toActivation(placed(setup({ army: [{ creatureId: 'hainrufer', count: 6 }, { creatureId: 'kronritter', count: 2 }] }, { army: melee(6, 'grabfuerst').map(s => ({ ...s, count: 2 })) }),
      { 1: [0, 'front'], 2: [1, 'front'], 3: [0, 'front'] }));
    // Hainrufer (Tempo 5) zieht zuerst, dann Kronritter (4, Angreifer) und Grabfürst (4).
    expect(c.activeId).toBe(1);
    c = combatReducer(c, { type: 'attack', targetId: 3 });
    expect(c.lastRolls.map(r => r.kind)).toEqual(['attack', 'retaliation']);
    expect(c.activeId).toBe(2);
    c = combatReducer(c, { type: 'attack', targetId: 3 });
    expect(c.lastRolls.map(r => r.kind)).toEqual(['attack']); // Kronritter ist schnell
  });
  it('zweiter Angreifer in derselben Runde erhält keinen Rückschlag mehr', () => {
    let c = toActivation(placed(setup({ army: [{ creatureId: 'hainrufer', count: 6 }, { creatureId: 'nachtschwinge', count: 6 }] }, { army: [{ creatureId: 'uraltwache', count: 2 }] }),
      { 1: [0, 'front'], 2: [1, 'front'], 3: [0, 'front'] }));
    c = combatReducer(c, { type: 'attack', targetId: 3 });
    expect(c.lastRolls.some(r => r.kind === 'retaliation')).toBe(true);
    c = combatReducer(c, { type: 'attack', targetId: 3 });
    expect(c.lastRolls.some(r => r.kind === 'retaliation')).toBe(false);
  });
  it('Fernkampf löst keinen Rückschlag aus', () => {
    let c = toActivation(placed(setup({ army: melee(2, 'armbruster') }, { army: melee(2, 'uraltwache') }), { 1: [0, 'back'], 2: [0, 'front'] }));
    c = combatReducer(c, { type: 'attack', targetId: 2 });
    expect(c.lastRolls.map(r => r.kind)).toEqual(['attack']);
  });
  it('nach 3 Runden zieht sich der Angreifer zurück', () => {
    let c = toActivation(placed(setup({ army: melee(1) }, { army: melee(1) }), { 1: [0, 'back'], 2: [0, 'back'] }));
    let guard = 0;
    while (c.step !== 'done' && guard++ < 50) {
      c = c.step === 'decision' ? combatReducer(c, { type: 'passDecision' }) : combatReducer(c, { type: 'pass' });
    }
    expect(c.round).toBe(3);
    expect(c.result).toEqual({ winner: null, reason: 'roundLimit', fled: null });
  });
  it('Flucht nur zu Rundenbeginn; Gegner gewinnt', () => {
    const c = placed(setup({ army: melee(1) }, { army: melee(1) }), { 1: [0, 'front'], 2: [0, 'front'] });
    expect(c.step).toBe('decision');
    const fled = combatReducer(c, { type: 'flee' });
    expect(fled.result).toEqual({ winner: 'defender', reason: 'flee', fled: 'attacker' });
    expect(() => combatReducer(toActivation(c), { type: 'flee' })).toThrow(RuleError);
  });
  it('Vernichtung beendet den Kampf', () => {
    let c = toActivation(placed(setup({ army: melee(2, 'kronritter') }, { army: melee(1, 'raeuber') }, { seed: 3 }), { 1: [0, 'front'], 2: [0, 'front'] }));
    let guard = 0;
    while (c.step !== 'done' && guard++ < 50) c = combatReducer(c, autoCombatAction(c));
    expect(c.result?.winner).toBe('attacker');
  });
  it('Kampf ist mit gleichem Seed reproduzierbar', () => {
    const s = setup({ army: melee(4) }, { army: melee(4) }, { seed: 99 });
    const a = runToEnd(initCombat(s));
    const b = runToEnd(initCombat(s));
    expect(a.stacks).toEqual(b.stacks);
  });
  it('combatReducer verändert den Eingangszustand nicht', () => {
    const c = toActivation(placed(setup({ army: melee(3) }, { army: melee(3) }), { 1: [0, 'front'], 2: [0, 'front'] }));
    const copy = structuredClone(c);
    combatReducer(c, { type: 'attack', targetId: 2 });
    expect(c).toEqual(copy);
  });
  it('Angriff auf unerreichbares Ziel ist regelwidrig', () => {
    const c = toActivation(placed(setup({ army: melee(1) }, { army: melee(1) }), { 1: [0, 'back'], 2: [0, 'front'] }));
    expect(() => combatReducer(c, { type: 'attack', targetId: 2 })).toThrow(RuleError);
  });
});

describe('R7 Belagerung', () => {
  it('Turm schießt 2 Würfel pro Runde auf den Angreifer', () => {
    const c = toActivation(placed(setup({ army: melee(6) }, { army: melee(1) }, { siege: { wall: true } }), { 1: [0, 'front'], 2: [0, 'front'] }));
    const tower = c.lastRolls.find(r => r.kind === 'tower');
    expect(tower?.rolls).toHaveLength(2);
  });
  it('kein Turm ohne Mauer', () => {
    const c = toActivation(placed(setup({ army: melee(6) }, { army: melee(1) }, { siege: { wall: false } }), { 1: [0, 'front'], 2: [0, 'front'] }));
    expect(c.lastRolls.some(r => r.kind === 'tower')).toBe(false);
  });
  it('leere Mauerstadt: Turm schießt einmal, dann siegt der Angreifer', () => {
    const c = toActivation(placed(setup({ army: melee(6) }, { kind: 'garrison', army: [] }, { siege: { wall: true } }), { 1: [0, 'front'] }));
    expect(c.lastRolls.some(r => r.kind === 'tower')).toBe(true);
    expect(c.result?.winner).toBe('attacker');
  });
});

describe('R7 Wächter-KI', () => {
  it('greift das Ziel an, dem sie am meisten Schaden zufügt', () => {
    // 3 Stufe-I-Einheiten (3 LP gesamt) gegen 1 Stufe-II (2 LP): erwarteter Schaden ist auf die LP gedeckelt.
    const c = placed(setup(
      { army: [{ creatureId: 'landwehr', count: 6 }, { creatureId: 'armbruster', count: 1 }] },
      { kind: 'guardian', playerId: null, army: [{ creatureId: 'raeuber', count: 6 }] },
    ), { 1: [0, 'front'], 2: [1, 'front'] });
    const guard = c.stacks.find(s => s.side === 'defender') as CStack;
    guard.row = 1; guard.line = 'front';
    expect(guardianTarget(c, guard)?.creatureId).toBe('landwehr');
  });
});

describe('R8 Kampfzauber', () => {
  const spells = (...ids: string[]) => ({ spells: ids });
  const base = (a: Partial<SideSetup>) => placed(setup({ army: melee(6, 'hainrufer'), ...a }, { army: melee(4, 'hainrufer') }), { 1: [0, 'front'], 2: [0, 'front'] });

  it('Blitz macht 2 + Magie Schaden', () => {
    const c = combatReducer(base({ ...spells('lightning'), magic: 2 }), { type: 'cast', spellId: 'lightning', targetId: 2 });
    expect(c.stacks[1].count).toBe(3); // 4 Schaden: 1 tot (3 LP), 1 Rest
    expect(c.stacks[1].damage).toBe(1);
  });
  it('Feuerball trifft alle Gegner einer Reihe', () => {
    const start = placed(setup({ army: melee(6, 'hainrufer'), spells: ['fireball'], magic: 2 }, { army: [{ creatureId: 'landwehr', count: 3 }, { creatureId: 'dornling', count: 3 }, { creatureId: 'skelett', count: 3 }] }),
      { 1: [0, 'front'], 2: [0, 'front'], 3: [0, 'back'], 4: [1, 'front'] });
    const c = combatReducer(start, { type: 'cast', spellId: 'fireball', row: 0 });
    expect(c.stacks.map(s => s.count)).toEqual([6, 0, 0, 3]);
  });
  it('Segen verbessert die Schwelle, Steinhaut verschlechtert sie für Gegner', () => {
    const a = combatReducer(base(spells('bless')), { type: 'cast', spellId: 'bless', targetId: 1 });
    expect(attackThreshold(a, a.stacks[0], a.stacks[1], false)).toBe(3);
    const b = combatReducer(base(spells('stoneskin')), { type: 'cast', spellId: 'stoneskin', targetId: 1 });
    expect(attackThreshold(b, b.stacks[1], b.stacks[0], false)).toBe(5);
  });
  it('Hast gibt +2 Tempo und ändert die Reihenfolge', () => {
    const start = placed(setup({ army: melee(1), spells: ['haste'] }, { army: melee(1, 'hainrufer') }), { 1: [0, 'front'], 2: [0, 'front'] });
    const c = combatReducer(start, { type: 'cast', spellId: 'haste', targetId: 1 });
    expect(c.stacks[0].speed).toBe(5);
    expect(toActivation(c).activeId).toBe(1);
  });
  it('R7: Ein Zauber pro Kampf, Aschenturm zwei', () => {
    const c1 = combatReducer(base(spells('bless')), { type: 'cast', spellId: 'bless', targetId: 1 });
    expect(() => combatReducer(c1, { type: 'cast', spellId: 'bless', targetId: 1 })).toThrow(RuleError);
    const c2 = combatReducer(base({ ...spells('bless'), spellSlots: 2 }), { type: 'cast', spellId: 'bless', targetId: 1 });
    expect(() => combatReducer(c2, { type: 'cast', spellId: 'bless', targetId: 1 })).not.toThrow();
  });
  it('unbekannte Zauber und Stadtportal sind im Kampf nicht möglich', () => {
    expect(() => combatReducer(base({}), { type: 'cast', spellId: 'bless', targetId: 1 })).toThrow(RuleError);
    expect(() => combatReducer(base(spells('portal')), { type: 'cast', spellId: 'portal' })).toThrow(RuleError);
  });
});

describe('R5 Sonderfähigkeiten', () => {
  it('Heilen entfernt Restschaden und holt Gefallene zurück', () => {
    let c = toActivation(placed(setup(
      { army: [{ creatureId: 'hainrufer', count: 3 }, { creatureId: 'landwehr', count: 3 }] },
      { army: melee(1, 'skelett') },
    ), { 1: [0, 'back'], 2: [0, 'front'], 3: [2, 'front'] }));
    c = structuredClone(c);
    const lw = c.stacks[1];
    lw.count = 1;
    expect(c.activeId).toBe(1);
    c = combatReducer(c, { type: 'heal', targetId: 2 });
    expect(c.stacks[1].count).toBe(3);
  });
  it('Heilen geht nicht über die Anfangsgröße hinaus', () => {
    const c = toActivation(placed(setup({ army: melee(3, 'hainrufer') }, { army: melee(1) }), { 1: [0, 'back'], 2: [0, 'front'] }));
    expect(() => combatReducer(c, { type: 'heal', targetId: 1 })).toThrow(RuleError);
  });
});

describe('Monte-Carlo', () => {
  it('überlegene Armee gewinnt fast immer, unterlegene fast nie', () => {
    const strong = simulateCombat(setup({ army: melee(6, 'hainrufer') }, { army: melee(2, 'raeuber') }), 200, 1);
    const weak = simulateCombat(setup({ army: melee(1, 'raeuber') }, { army: melee(6, 'hainrufer') }), 200, 1);
    expect(strong.winRate).toBeGreaterThan(0.95);
    expect(weak.winRate).toBeLessThan(0.05);
  });
  it('Raten summieren sich zu 1 und sind deterministisch', () => {
    const s = setup({ army: melee(4) }, { army: melee(4) });
    const a = simulateCombat(s, 100, 5);
    expect(a.winRate + a.drawRate + a.lossRate).toBeCloseTo(1);
    expect(simulateCombat(s, 100, 5)).toEqual(a);
  });
});
