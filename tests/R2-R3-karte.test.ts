import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { RuleError } from '../src/engine/errors';
import { hexDistance, hexKey, neighbors } from '../src/engine/hex';
import { findPath } from '../src/engine/movement';
import { homePositions } from '../src/engine/map';
import { createGame } from '../src/engine/setup';
import { playerView } from '../src/engine/view';
import { act, clearBoard, heroOf, newGame, place, setTile, setups, toHeroPhase } from './helpers';

describe('R2 Karte', () => {
  it.each([[2, 61], [3, 61], [4, 91]])('%i Spieler: %i Felder', (n, count) => {
    expect(Object.keys(newGame(n).tiles)).toHaveLength(count);
  });
  it('Heimat liegt am Rand', () => {
    for (const n of [2, 3, 4]) {
      const r = BALANCE.map.radiusByPlayers[n];
      for (const h of homePositions(n, r)) expect(hexDistance(h, { q: 0, r: 0 })).toBe(r);
    }
  });
  it('Ringe werden zur Mitte hin stärker, Herz in der Mitte', () => {
    const s = newGame(2);
    expect(s.tiles['0,0'].content?.kind).toBe('heart');
    for (const n of neighbors({ q: 0, r: 0 })) expect(s.tiles[hexKey(n)].ringTier).toBe(3);
    expect(s.tiles['4,0'].ringTier).toBe(1);
  });
  it('Felder starten verdeckt, nur die Heimat ist bekannt', () => {
    const s = newGame(2);
    const known = Object.values(s.tiles).filter(t => t.revealedBy.length > 0);
    expect(known.map(t => hexKey(t.hex)).sort()).toEqual(['-4,0', '4,0']);
  });
  it('Karte ist bei gleichem Seed identisch und bei anderem verschieden', () => {
    expect(createGame(5, setups(3)).tiles).toEqual(createGame(5, setups(3)).tiles);
    expect(createGame(5, setups(3)).tiles).not.toEqual(createGame(6, setups(3)).tiles);
  });
  it('R3: Herzstein liegt unter einem der 6 Felder ums Zentrum', () => {
    for (let seed = 0; seed < 30; seed++) {
      const key = createGame(seed, setups(2)).heartstone as string;
      expect(neighbors({ q: 0, r: 0 }).map(hexKey)).toContain(key);
    }
  });
  it('R3: Karte enthält alle Inhaltsarten', () => {
    for (let seed = 0; seed < 10; seed++) {
      const kinds = new Set(Object.values(createGame(seed, setups(4)).tiles).map(t => t.content?.kind));
      for (const k of ['mine', 'treasure', 'guardian', 'obelisk', 'shrine', 'heart']) expect(kinds).toContain(k);
    }
  });
  it('ANNAHME: Jede Heimat hat eine Gold- und Baustoffmine als Nachbarn', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = createGame(seed, setups(3));
      for (const c of Object.values(s.cities)) {
        const mines = neighbors(c.pos).map(n => s.tiles[hexKey(n)]?.content).filter(x => x?.kind === 'mine');
        const resources = mines.map(m => (m?.kind === 'mine' ? m.resource : ''));
        expect(resources).toContain('gold');
        expect(resources).toContain('material');
      }
    }
  });
});

describe('R2 Bewegung', () => {
  const setup = (realm = 'kronland') => {
    const s = newGame(2, [realm, 'wildhain']);
    clearBoard(s);
    return s;
  };
  it('Helden haben 4 Bewegungspunkte pro Woche', () => {
    expect(heroOf(newGame(2), 0).movement).toBe(BALANCE.movementPerWeek);
    expect(BALANCE.movementPerWeek).toBe(4);
  });
  it('Ebene kostet 1, Wald/Sumpf/Gebirge kosten 2', () => {
    for (const [terrain, cost] of [['plain', 1], ['forest', 2], ['swamp', 2], ['mountain', 2]] as const) {
      let s = setup();
      const h = heroOf(s, 0);
      place(h, { q: 0, r: 2 });
      setTile(s, { q: 0, r: 3 }, { terrain, revealedBy: [0] });
      s = toHeroPhase(s);
      s = act(s, { type: 'move', heroId: h.id, path: [{ q: 0, r: 3 }] });
      expect(heroOf(s, 0).movement).toBe(4 - cost);
    }
  });
  it('R5: Wildhain zahlt im Wald nur 1, andere 2', () => {
    let s = setup('wildhain');
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 2 });
    setTile(s, { q: 0, r: 3 }, { terrain: 'forest', revealedBy: [0] });
    s = toHeroPhase(s);
    s = act(s, { type: 'move', heroId: h.id, path: [{ q: 0, r: 3 }] });
    expect(heroOf(s, 0).movement).toBe(3);
  });
  it('Zu teure aufgedeckte Felder sind nicht betretbar', () => {
    let s = setup();
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 2 }, { movement: 1 });
    setTile(s, { q: 0, r: 3 }, { terrain: 'forest', revealedBy: [0] });
    s = toHeroPhase(s);
    expect(() => act(s, { type: 'move', heroId: h.id, path: [{ q: 0, r: 3 }] })).toThrow(RuleError);
  });
  it('Pfad muss aus Nachbarfeldern bestehen', () => {
    const s = toHeroPhase(setup());
    expect(() => act(s, { type: 'move', heroId: heroOf(s, 0).id, path: [{ q: 0, r: 0 }] })).toThrow(RuleError);
  });
  it('Helden ziehen nur in der Heldenphase und nur die des aktiven Spielers', () => {
    const s = setup();
    const h = heroOf(s, 0);
    expect(() => act(s, { type: 'move', heroId: h.id, path: [neighbors(h.pos)[3]] })).toThrow(RuleError);
    const hero1 = heroOf(s, 1);
    expect(() => act(toHeroPhase(s), { type: 'move', heroId: hero1.id, path: [neighbors(hero1.pos)[0]] })).toThrow(RuleError);
  });
  it('Felder werden beim Betreten aufgedeckt, und zwar nur für den Spieler', () => {
    let s = setup();
    const h = heroOf(s, 0);
    const target = { q: 3, r: 0 };
    s = toHeroPhase(s);
    s = act(s, { type: 'move', heroId: h.id, path: [target] });
    expect(s.tiles[hexKey(target)].revealedBy).toEqual([0]);
  });
  it('ANNAHME: Verdecktes Feld braucht nur 1 Bewegung, der Rest verfällt', () => {
    let s = setup();
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 2 }, { movement: 1 });
    setTile(s, { q: 0, r: 3 }, { terrain: 'mountain', revealedBy: [] });
    s = toHeroPhase(s);
    s = act(s, { type: 'move', heroId: h.id, path: [{ q: 0, r: 3 }] });
    expect(heroOf(s, 0).pos).toEqual({ q: 0, r: 3 });
    expect(heroOf(s, 0).movement).toBe(0);
  });
  it('Pfadvorschau: billigster Weg über Bekanntes, verdeckt nur als Ende', () => {
    const s = toHeroPhase(setup());
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 0 }, { movement: 4 });
    setTile(s, { q: 1, r: 0 }, { terrain: 'mountain', revealedBy: [0] });
    setTile(s, { q: 0, r: 1 }, { terrain: 'plain', revealedBy: [0] });
    setTile(s, { q: 1, r: 1 }, { terrain: 'plain', revealedBy: [0] });
    const toKnown = findPath(s, h.id, { q: 1, r: 1 });
    expect(toKnown?.path).toEqual([{ q: 0, r: 1 }, { q: 1, r: 1 }]);
    expect(toKnown?.knownCost).toBe(2);
    expect(toKnown?.endsHidden).toBe(false);
    const hidden = findPath(s, h.id, { q: 2, r: 1 });
    expect(hidden?.endsHidden).toBe(true);
    expect(hidden?.costs.at(-1)).toBeNull();
    expect(findPath(s, h.id, { q: 3, r: 1 })).toBeNull(); // liegt hinter Verdecktem
  });
  it('Pfad durch Wächter ist nicht möglich, als Ziel schon', () => {
    const s = toHeroPhase(setup());
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 0 }, { movement: 4 });
    for (const n of neighbors({ q: 0, r: 0 })) setTile(s, n, { revealedBy: [0], content: { kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 1 }] } });
    setTile(s, { q: 2, r: 0 }, { revealedBy: [0] });
    expect(findPath(s, h.id, { q: 2, r: 0 })).toBeNull();
    expect(findPath(s, h.id, { q: 1, r: 0 })?.endsInEncounter).toBe(true);
  });
  it('ANNAHME: Kein Feld mit zwei eigenen Helden außerhalb von Städten', () => {
    let s = setup();
    s.heroes['p0_x'] = { ...structuredClone(heroOf(s, 0)), id: 'p0_x', pos: { q: 3, r: 0 } };
    setTile(s, { q: 3, r: 0 }, { revealedBy: [0] });
    s = toHeroPhase(s);
    expect(() => act(s, { type: 'move', heroId: Object.values(s.heroes).find(h => h.owner === 0 && h.id !== 'p0_x')!.id, path: [{ q: 3, r: 0 }] })).toThrow(RuleError);
  });
});

describe('R3 Feldinhalte', () => {
  const enter = (content: Parameters<typeof setTile>[2]['content']) => {
    let s = newGame(2);
    clearBoard(s);
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 2 });
    setTile(s, { q: 0, r: 3 }, { content, revealedBy: [0] });
    s = toHeroPhase(s);
    return { s: act(s, { type: 'move', heroId: h.id, path: [{ q: 0, r: 3 }] }), before: s };
  };
  it('Mine wird beflaggt und kann übernommen werden', () => {
    const { s } = enter({ kind: 'mine', resource: 'gold', owner: 1 });
    const c = s.tiles['0,3'].content;
    expect(c?.kind === 'mine' && c.owner).toBe(0);
  });
  it('Schatz: Gold', () => {
    const { s, before } = enter({ kind: 'treasure', reward: { type: 'gold', value: 5 } });
    expect(s.players[0].resources.gold).toBe(before.players[0].resources.gold + 5);
    expect(s.tiles['0,3'].content).toBeNull();
  });
  it('Schatz: Erfahrung', () => {
    const { s } = enter({ kind: 'treasure', reward: { type: 'xp', value: 3 } });
    expect(heroOf(s, 0).xp).toBeGreaterThanOrEqual(3);
  });
  it('Schatz: Artefakt', () => {
    const { s } = enter({ kind: 'treasure', reward: { type: 'artifact', artifactId: 'kampfbeil' } });
    expect(heroOf(s, 0).artifacts).toContain('kampfbeil');
  });
  it('Obelisk gibt einen Hinweis, aber nur einmal je Spieler', () => {
    const { s } = enter({ kind: 'obelisk', usedBy: [] });
    expect(s.players[0].hints).toHaveLength(1);
    expect(s.players[0].hints[0]).not.toBe(s.heartstone);
    const { s: again } = enter({ kind: 'obelisk', usedBy: [0] });
    expect(again.players[0].hints).toHaveLength(0);
  });
  it('Schrein lehrt einen Zauber der Stufe 1', () => {
    const { s } = enter({ kind: 'shrine', spellId: 'bless', usedBy: [] });
    expect(heroOf(s, 0).spells).toContain('bless');
  });
  it('Wächter löst eine Begegnung aus', () => {
    const { s } = enter({ kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 1 }] });
    expect(s.encounter?.target.kind).toBe('guardian');
    expect(heroOf(s, 0).pos).toEqual({ q: 0, r: 2 });
  });
  it('ANNAHME: Begegnung auf aufgedecktem Feld kostet erst beim Kampf, Ablehnen ist kostenlos', () => {
    const { s } = enter({ kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 1 }] });
    expect(heroOf(s, 0).movement).toBe(4);
    const back = act(s, { type: 'declineEncounter' });
    expect(heroOf(back, 0).movement).toBe(4);
    expect(act(s, { type: 'startEncounter' }).combat).not.toBeNull();
  });
  it('ANNAHME: Verdeckter Wächter: Bewegung ist bezahlt, Ablehnen möglich', () => {
    let s = newGame(2);
    clearBoard(s);
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 2 });
    setTile(s, { q: 0, r: 3 }, { content: { kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 1 }] } });
    s = toHeroPhase(s);
    s = act(s, { type: 'move', heroId: h.id, path: [{ q: 0, r: 3 }] }, { type: 'declineEncounter' });
    expect(heroOf(s, 0).movement).toBe(3);
    expect(s.tiles['0,3'].revealedBy).toContain(0);
  });
  it('Nach Graben ohne Treffer ist das Feld ausgeschlossen, mit Treffer gibt es 6 Ruhm', () => {
    let s = newGame(2);
    clearBoard(s);
    const h = heroOf(s, 0);
    const key = s.heartstone as string;
    const [q, r] = key.split(',').map(Number);
    place(h, { q, r });
    s = toHeroPhase(s);
    s = act(s, { type: 'dig', heroId: h.id });
    expect(s.players[0].fame.heartstone).toBe(6);
    expect(s.heartstoneFound).toBe(true);
    expect(heroOf(s, 0).movement).toBe(0);
    let m = newGame(2);
    clearBoard(m);
    const wrong = neighbors({ q: 0, r: 0 }).find(n => hexKey(n) !== m.heartstone)!;
    place(heroOf(m, 0), wrong);
    m = toHeroPhase(m);
    m = act(m, { type: 'dig', heroId: heroOf(m, 0).id });
    expect(m.players[0].fame.heartstone).toBe(0);
    expect(m.players[0].hints).toContain(hexKey(wrong));
  });
  it('Graben nur auf den 6 Feldern ums Zentrum', () => {
    const s = toHeroPhase(newGame(2));
    expect(() => act(s, { type: 'dig', heroId: heroOf(s, 0).id })).toThrow(RuleError);
  });
});

describe('Nebel des Krieges', () => {
  const secret = (s: ReturnType<typeof newGame>) => playerView(s, 0);
  it('Sicht verrät keine verdeckten Felder, keinen Herzstein und keine fremden Ressourcen', () => {
    const s = newGame(2);
    const v = secret(s);
    expect(v.heartstone).toBeNull();
    expect(v.rng).toBe(0);
    expect(v.weekDeck).toEqual([]);
    const hidden = Object.values(v.tiles).filter(t => t.revealedBy.length === 0);
    expect(hidden.length).toBeGreaterThan(50);
    for (const t of hidden) {
      expect(t.terrain).toBe('unknown');
      expect(t.content).toBeNull();
    }
    expect(v.players[1].resources).toEqual({ gold: 0, material: 0, crystal: 0 });
  });
  it('fremde Helden und Städte auf verdeckten Feldern fehlen', () => {
    const s = newGame(2);
    const v = secret(s);
    expect(Object.values(v.heroes).every(h => h.owner === 0)).toBe(true);
    expect(Object.values(v.cities).every(c => c.owner === 0)).toBe(true);
  });
  it('private Protokolleinträge bleiben privat', () => {
    const s = newGame(2);
    s.log.push({ week: 1, text: 'geheim', players: [1] });
    expect(secret(s).log.some(e => e.text === 'geheim')).toBe(false);
  });
  it('fremde Hinweise bleiben geheim', () => {
    const s = newGame(2);
    s.players[1].hints.push('1,0');
    expect(secret(s).players[1].hints).toEqual([]);
  });
  it('Spiel-Sicht verändert das Original nicht', () => {
    const s = newGame(2);
    const copy = structuredClone(s);
    secret(s);
    expect(s).toEqual(copy);
  });
});
