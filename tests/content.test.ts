import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ARTIFACTS, BUILDINGS, CREATURES, GUARDIANS, HEROES, REALMS, SKILLS, SPELLS, WEEK_CARDS, validateContent } from '../src/engine/content';
import { d6, deriveSeed, rand, shuffle } from '../src/engine/rng';
import { DIRECTIONS, hexDistance, hexKey, hexesInRadius, neighbors, parseKey } from '../src/engine/hex';

describe('Content', () => {
  it('ist konsistent', () => {
    expect(validateContent()).toEqual([]);
  });
  it('R5: enthält die vier Reiche', () => {
    expect(REALMS.map(r => r.name)).toEqual(['Kronland', 'Wildhain', 'Aschenturm', 'Knochenfeste']);
  });
  it('R5: Sonderfähigkeiten kommen im Content vor', () => {
    const all = new Set(CREATURES.flatMap(c => c.abilities));
    expect([...all].sort()).toEqual(['fast', 'flying', 'heal', 'ranged']);
  });
  it('R8: enthält genau die Zauber der Regel', () => {
    expect(SPELLS.filter(s => s.level === 1).map(s => s.name).sort()).toEqual(['Blitz', 'Hast', 'Segen', 'Steinhaut']);
    expect(SPELLS.filter(s => s.level === 2).map(s => s.name).sort()).toEqual(['Feuerball', 'Stadtportal']);
  });
  it('hat alle Inhaltsarten', () => {
    for (const list of [ARTIFACTS, BUILDINGS, GUARDIANS, HEROES, SKILLS, WEEK_CARDS]) expect(list.length).toBeGreaterThan(0);
    for (const tier of [1, 2, 3]) expect(GUARDIANS.some(g => g.tier === tier)).toBe(true);
  });
});

describe('Balance', () => {
  it('R5: Stufenwerte entsprechen der Regel', () => {
    const t = BALANCE.tiers;
    expect([t[1].dice, t[1].damage, t[1].hp, t[1].speed, t[1].cost.gold]).toEqual([1, 1, 1, 3, 2]);
    expect([t[2].dice, t[2].damage, t[2].hp, t[2].speed, t[2].cost.gold]).toEqual([1, 1, 2, 4, 4]);
    expect([t[3].dice, t[3].damage, t[3].hp, t[3].speed, t[3].cost.gold]).toEqual([1, 2, 3, 5, 7]);
    expect([t[4].dice, t[4].damage, t[4].hp, t[4].speed, t[4].cost.gold, t[4].cost.crystal]).toEqual([2, 3, 6, 4, 12, 1]);
  });
  it('R4: Gebäudekosten entsprechen der Regel', () => {
    const b = BALANCE.buildings;
    expect(b.dwelling3).toEqual({ gold: 8, material: 4 });
    expect(b.dwelling4).toEqual({ gold: 15, material: 6, crystal: 2 });
    expect(b.market).toEqual({ gold: 6, material: 2 });
    expect(b.guild).toEqual({ gold: 6, material: 3, crystal: 1 });
    expect(b.guildUpgrade).toEqual({ crystal: 2 });
    expect(b.wall).toEqual({ gold: 8, material: 6 });
    expect(b.capitol).toEqual({ gold: 20, material: 4 });
  });
});

describe('PRNG', () => {
  it('ist bei gleichem Seed reproduzierbar', () => {
    const a = { rng: 42 }, b = { rng: 42 };
    expect(Array.from({ length: 50 }, () => rand(a))).toEqual(Array.from({ length: 50 }, () => rand(b)));
  });
  it('liefert andere Folgen bei anderem Seed', () => {
    expect(rand({ rng: 1 })).not.toEqual(rand({ rng: 2 }));
  });
  it('würfelt nur 1 bis 6 und alle Seiten', () => {
    const h = { rng: 7 };
    const seen = new Set(Array.from({ length: 500 }, () => d6(h)));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('shuffle behält alle Elemente', () => {
    expect(shuffle({ rng: 3 }, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it('deriveSeed ist deterministisch und unterscheidet Eingaben', () => {
    expect(deriveSeed(1, 2)).toBe(deriveSeed(1, 2));
    expect(deriveSeed(1, 2)).not.toBe(deriveSeed(2, 1));
  });
});

describe('Hex', () => {
  it('Abstand und Nachbarn', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(neighbors({ q: 0, r: 0 })).toHaveLength(6);
    for (const d of DIRECTIONS) expect(hexDistance({ q: 0, r: 0 }, d)).toBe(1);
  });
  it('Radius enthält 3R(R+1)+1 Felder', () => {
    expect(hexesInRadius(4)).toHaveLength(61);
    expect(hexesInRadius(5)).toHaveLength(91);
  });
  it('Schlüssel lassen sich zurückwandeln', () => {
    expect(parseKey(hexKey({ q: -3, r: 2 }))).toEqual({ q: -3, r: 2 });
  });
});
