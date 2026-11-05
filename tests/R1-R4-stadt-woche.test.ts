import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { buildCost, recruitUnitCost } from '../src/engine/city';
import { RuleError } from '../src/engine/errors';
import { citiesOf } from '../src/engine/helpers';
import { weeklyIncome } from '../src/engine/week';
import { act, clearBoard, heroOf, newGame, setTile, toHeroPhase } from './helpers';
import type { GameState } from '../src/engine/types';

const city = (s: GameState, p = 0) => citiesOf(s, p)[0];
const endTurn = (s: GameState): GameState => act(s, { type: 'endCityPhase' }, { type: 'endHeroPhase' });
const endRound = (s: GameState, n = 2): GameState => Array.from({ length: n }).reduce<GameState>(a => endTurn(a), s);
const rich = (s: GameState, p = 0) => { s.players[p].resources = { gold: 100, material: 100, crystal: 100 }; return s; };

describe('R1 Rundenablauf', () => {
  it('Jeder Spieler macht nacheinander Stadt- und Heldenphase', () => {
    let s = newGame(3);
    expect(s.order[s.activeIndex]).toBe(0);
    expect(s.phase).toBe('city');
    s = act(s, { type: 'endCityPhase' });
    expect(s.phase).toBe('hero');
    s = act(s, { type: 'endHeroPhase' });
    expect(s.order[s.activeIndex]).toBe(1);
    expect(s.phase).toBe('city');
  });
  it('Wochenwechsel nach dem letzten Spieler; Startspieler rotiert', () => {
    let s = newGame(3);
    s = endRound(s, 3);
    expect(s.week).toBe(2);
    expect(s.order).toEqual([1, 2, 0]);
    expect(s.order[s.activeIndex]).toBe(1);
  });
  it('Neue Wochenkarte beim Wechsel, Stapel wird bei Bedarf neu gemischt', () => {
    let s = newGame(2);
    s.weekDeck = [];
    s = endRound(s);
    expect(s.weekCardId).toBeTruthy();
    expect(s.weekDeck.length).toBeGreaterThan(0);
  });
  it('Bewegung wird im Wochenwechsel erneuert', () => {
    let s = newGame(2);
    heroOf(s, 0).movement = 0;
    s = endRound(s);
    expect(heroOf(s, 0).movement).toBeGreaterThanOrEqual(BALANCE.movementPerWeek);
  });
  it('Falsche Phase wird abgelehnt', () => {
    const s = newGame(2);
    expect(() => act(s, { type: 'endHeroPhase' })).toThrow(RuleError);
    expect(() => act(toHeroPhase(s), { type: 'endCityPhase' })).toThrow(RuleError);
  });
  it('Reducer verändert den Eingangszustand nicht', () => {
    const s = newGame(2);
    const copy = structuredClone(s);
    act(s, { type: 'endCityPhase' }, { type: 'endHeroPhase' });
    expect(s).toEqual(copy);
  });
});

describe('R1 Einkommen', () => {
  const plain = () => { const s = newGame(2, ['wildhain', 'kronland']); clearBoard(s); heroOf(s, 0).defId = 'liora'; return s; };
  it('Rathaus 4 Gold', () => {
    expect(weeklyIncome(plain(), 0)).toEqual({ gold: 4, material: 0, crystal: 0 });
  });
  it('Kapitol 8 Gold statt 4', () => {
    const s = plain();
    city(s).buildings.push('capitol');
    expect(weeklyIncome(s, 0).gold).toBe(8);
  });
  it('Minen: 2 Gold, 2 Baustoff, 1 Kristall', () => {
    const s = plain();
    setTile(s, { q: 0, r: 1 }, { content: { kind: 'mine', resource: 'gold', owner: 0 } });
    setTile(s, { q: 0, r: 2 }, { content: { kind: 'mine', resource: 'material', owner: 0 } });
    setTile(s, { q: 0, r: 3 }, { content: { kind: 'mine', resource: 'crystal', owner: 0 } });
    setTile(s, { q: 1, r: 1 }, { content: { kind: 'mine', resource: 'gold', owner: 1 } });
    expect(weeklyIncome(s, 0)).toEqual({ gold: 6, material: 2, crystal: 1 });
  });
  it('Einkommen wird beim Wochenwechsel gutgeschrieben', () => {
    let s = plain();
    const before = s.players[0].resources.gold;
    s = endRound(s);
    expect(s.players[0].resources.gold).toBe(before + 4 + (weeklyIncome(s, 0).gold - 4)); // Karte der neuen Woche wirkt erst beim nächsten Wechsel
  });
  it('Wochenkarte wirkt auf Einkommen', () => {
    const s = plain();
    s.weekCardId = 'erntedank';
    expect(weeklyIncome(s, 0).gold).toBe(6);
    s.weekCardId = 'goldader';
    setTile(s, { q: 0, r: 1 }, { content: { kind: 'mine', resource: 'gold', owner: 0 } });
    expect(weeklyIncome(s, 0).gold).toBe(7);
  });
});

describe('R1 Wachstum', () => {
  it('Behausungen wachsen I:4 II:3 III:2 IV:1, Vorrat maximal doppelt', () => {
    let s = newGame(2);
    clearBoard(s);
    const c = city(s);
    c.buildings.push('dwelling3', 'dwelling4');
    c.stock = { 1: 0, 2: 0, 3: 0, 4: 0 };
    s = endRound(s);
    expect(city(s).stock).toEqual({ 1: 4, 2: 3, 3: 2, 4: 1 });
    s.weekCardId = 'ruhige_woche';
    s = endRound(s);
    s.weekCardId = 'ruhige_woche';
    s = endRound(s);
    expect(city(s).stock[1]).toBe(8);
    expect(city(s).stock[2]).toBe(6);
    expect(city(s).stock[3]).toBe(4);
    expect(city(s).stock[4]).toBe(2);
  });
  it('Ohne Behausung kein Wachstum', () => {
    let s = newGame(2);
    s = endRound(s);
    expect(city(s).stock[3]).toBe(0);
  });
  it('Umland-Behausungen wachsen ebenfalls', () => {
    let s = newGame(2);
    clearBoard(s);
    setTile(s, { q: 0, r: 1 }, { content: { kind: 'dwelling', tier: 2, stock: 0, owner: null } });
    s = endRound(s);
    const d = s.tiles['0,1'].content;
    expect(d?.kind === 'dwelling' && d.stock).toBe(3);
  });
});

describe('R4 Startzustand', () => {
  it('Start mit 10/4/1, Rathaus, Behausung I und II', () => {
    const s = newGame(4);
    for (const p of s.players) expect(p.resources).toEqual({ gold: 10, material: 4, crystal: 1 });
    expect(city(s).buildings).toEqual(['townhall', 'dwelling1', 'dwelling2']);
  });
  it('ANNAHME: Startarmee und Startvorrat', () => {
    const s = newGame(2);
    expect(heroOf(s, 0).army.map(a => a.count)).toEqual([4, 2]);
    expect(city(s).stock).toEqual({ 1: 4, 2: 3, 3: 0, 4: 0 });
  });
});

describe('R4 Bauen', () => {
  it('Kosten werden abgezogen', () => {
    let s = rich(newGame(2));
    s = act(s, { type: 'build', cityId: 'c0', building: 'wall' });
    expect(s.players[0].resources).toEqual({ gold: 92, material: 94, crystal: 100 });
    expect(city(s).buildings).toContain('wall');
  });
  it('1 Gebäude pro Stadt und Woche', () => {
    let s = rich(newGame(2));
    s = act(s, { type: 'build', cityId: 'c0', building: 'market' });
    expect(() => act(s, { type: 'build', cityId: 'c0', building: 'wall' })).toThrow(RuleError);
    s = endRound(s);
    expect(() => act(s, { type: 'endCityPhase' }, { type: 'endHeroPhase' }, { type: 'build', cityId: 'c0', building: 'wall' })).not.toThrow();
  });
  it('Ohne Ressourcen kein Bau, nur in der Stadtphase, nur eigene Stadt', () => {
    const s = newGame(2);
    expect(() => act(s, { type: 'build', cityId: 'c0', building: 'capitol' })).toThrow(RuleError);
    expect(() => act(toHeroPhase(rich(s)), { type: 'build', cityId: 'c0', building: 'market' })).toThrow(RuleError);
    expect(() => act(rich(s), { type: 'build', cityId: 'c1', building: 'market' })).toThrow(RuleError);
  });
  it('Nichts doppelt bauen; Gildenausbau braucht Gilde und kostet 2 Kristall', () => {
    let s = rich(newGame(2));
    expect(() => act(s, { type: 'build', cityId: 'c0', building: 'townhall' })).toThrow(RuleError);
    expect(() => act(s, { type: 'build', cityId: 'c0', building: 'guildUpgrade' })).toThrow(RuleError);
    s = act(s, { type: 'build', cityId: 'c0', building: 'guild' });
    city(s).builtThisWeek = false;
    const before = s.players[0].resources.crystal;
    s = act(s, { type: 'build', cityId: 'c0', building: 'guildUpgrade' });
    expect(s.players[0].resources.crystal).toBe(before - 2);
  });
  it('Wochenkarte senkt Baukosten', () => {
    const s = newGame(2);
    s.weekCardId = 'bauherren';
    expect(buildCost(s, 'market').gold).toBe(4);
  });
});

describe('R4 Markt', () => {
  it('Tausch 3:1 nur mit Markt', () => {
    let s = rich(newGame(2));
    expect(() => act(s, { type: 'trade', cityId: 'c0', give: 'gold', get: 'crystal' })).toThrow(RuleError);
    s = act(s, { type: 'build', cityId: 'c0', building: 'market' });
    const before = s.players[0].resources;
    s = act(s, { type: 'trade', cityId: 'c0', give: 'gold', get: 'crystal' });
    expect(s.players[0].resources.gold).toBe(before.gold - 3);
    expect(s.players[0].resources.crystal).toBe(before.crystal + 1);
  });
  it('Zu wenig Ressourcen oder gleiche Ressource sind unzulässig', () => {
    let s = rich(newGame(2));
    s = act(s, { type: 'build', cityId: 'c0', building: 'market' });
    expect(() => act(s, { type: 'trade', cityId: 'c0', give: 'gold', get: 'gold' })).toThrow(RuleError);
    s.players[0].resources.material = 2;
    expect(() => act(s, { type: 'trade', cityId: 'c0', give: 'material', get: 'gold' })).toThrow(RuleError);
  });
});

describe('R5 Rekrutieren', () => {
  it('Kosten und Vorrat werden abgezogen; Einheiten gehen zum Helden', () => {
    let s = rich(newGame(2));
    const h = heroOf(s, 0);
    s = act(s, { type: 'recruit', cityId: 'c0', tier: 2, count: 2, to: { type: 'hero', id: h.id } });
    expect(s.players[0].resources.gold).toBe(100 - 8);
    expect(city(s).stock[2]).toBe(1);
    expect(heroOf(s, 0).army.find(a => a.creatureId === 'armbruster')?.count).toBe(4);
  });
  it('Stufe IV kostet auch Kristall', () => {
    let s = rich(newGame(2));
    city(s).buildings.push('dwelling4');
    city(s).stock[4] = 1;
    s = act(s, { type: 'recruit', cityId: 'c0', tier: 4, count: 1, to: { type: 'city', id: 'c0' } });
    expect(s.players[0].resources).toMatchObject({ gold: 88, crystal: 99 });
    expect(city(s).garrison).toEqual([{ creatureId: 'kronritter', count: 1 }]);
  });
  it('Max. 6 Einheiten je Stapel, Stufe IV: 2', () => {
    const s = rich(newGame(2));
    const h = heroOf(s, 0);
    city(s).stock[1] = 8;
    expect(() => act(s, { type: 'recruit', cityId: 'c0', tier: 1, count: 3, to: { type: 'hero', id: h.id } })).toThrow(RuleError);
    city(s).buildings.push('dwelling4');
    city(s).stock[4] = 3;
    expect(() => act(s, { type: 'recruit', cityId: 'c0', tier: 4, count: 3, to: { type: 'city', id: 'c0' } })).toThrow(RuleError);
  });
  it('Max. 3 Stapel je Held', () => {
    const s = rich(newGame(2));
    const h = heroOf(s, 0);
    h.army.push({ creatureId: 'falkenreiter', count: 1 });
    city(s).buildings.push('dwelling4');
    city(s).stock[4] = 1;
    expect(() => act(s, { type: 'recruit', cityId: 'c0', tier: 4, count: 1, to: { type: 'hero', id: h.id } })).toThrow(RuleError);
  });
  it('Vorrat und Behausung sind nötig; Held muss in der Stadt sein', () => {
    const s = rich(newGame(2));
    const h = heroOf(s, 0);
    expect(() => act(s, { type: 'recruit', cityId: 'c0', tier: 1, count: 5, to: { type: 'city', id: 'c0' } })).toThrow(RuleError);
    expect(() => act(s, { type: 'recruit', cityId: 'c0', tier: 3, count: 1, to: { type: 'city', id: 'c0' } })).toThrow(RuleError);
    h.pos = { q: 0, r: 0 };
    expect(() => act(s, { type: 'recruit', cityId: 'c0', tier: 1, count: 1, to: { type: 'hero', id: h.id } })).toThrow(RuleError);
  });
  it('Regelverstoß kostet nichts', () => {
    const s = rich(newGame(2));
    const copy = structuredClone(s);
    expect(() => act(s, { type: 'recruit', cityId: 'c0', tier: 1, count: 5, to: { type: 'city', id: 'c0' } })).toThrow(RuleError);
    expect(s).toEqual(copy);
  });
  it('Eroberte Stadt rekrutiert die Kreaturen ihres Ursprungsreichs', () => {
    let s = rich(newGame(2, ['kronland', 'wildhain']));
    s.cities.c1.owner = 0;
    s = act(s, { type: 'recruit', cityId: 'c1', tier: 1, count: 1, to: { type: 'city', id: 'c1' } });
    expect(s.cities.c1.garrison).toEqual([{ creatureId: 'dornling', count: 1 }]);
  });
  it('Umland-Behausung: Rekrutieren in der Heldenphase auf dem Feld', () => {
    let s = rich(newGame(2));
    clearBoard(s);
    const h = heroOf(s, 0);
    setTile(s, { q: 3, r: 0 }, { content: { kind: 'dwelling', tier: 3, stock: 2, owner: null }, revealedBy: [0] });
    s = toHeroPhase(s);
    s = act(s, { type: 'move', heroId: h.id, path: [{ q: 3, r: 0 }] }, { type: 'recruitDwelling', heroId: h.id, count: 1 });
    expect(heroOf(s, 0).army.find(a => a.creatureId === 'falkenreiter')?.count).toBe(1);
    expect(s.players[0].resources.gold).toBe(93);
  });
  it('Wochenkarte senkt Rekrutierungskosten', () => {
    const s = newGame(2);
    s.weekCardId = 'werber';
    expect(recruitUnitCost(s, 2).gold).toBe(3);
  });
  it('Einheiten lassen sich zwischen Held und Garnison tauschen', () => {
    let s = newGame(2);
    const h = heroOf(s, 0);
    s = act(s, { type: 'transfer', from: { type: 'hero', id: h.id }, to: { type: 'city', id: 'c0' }, creatureId: 'landwehr', count: 4 });
    expect(heroOf(s, 0).army.some(a => a.creatureId === 'landwehr')).toBe(false);
    expect(city(s).garrison).toEqual([{ creatureId: 'landwehr', count: 4 }]);
  });
});
