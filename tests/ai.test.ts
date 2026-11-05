import { describe, expect, it } from 'vitest';
import { aiAction, playAiGame } from '../src/ai';
import { encounterOdds } from '../src/ai/simulate';
import { chooseTarget } from '../src/ai/evaluate';
import { pickSpell } from '../src/ai/cityPlanner';
import { BALANCE } from '../src/config/balance';
import { aiTarget } from '../src/engine/combat/policy';
import { combatReducer, initCombat } from '../src/engine/combat/combat';
import { neighbors } from '../src/engine/hex';
import { playerView } from '../src/engine/view';
import { totalFame } from '../src/engine/scoring';
import type { Control, GameState, PlayerSetup } from '../src/engine/types';
import { clearBoard, heroOf, newGame, place, setTile, toHeroPhase } from './helpers';

const REALMS = ['kronland', 'wildhain', 'aschenturm', 'knochenfeste'];
const ai = (n: number, control: Control = 'ai-normal'): PlayerSetup[] =>
  Array.from({ length: n }, (_, i) => ({ name: `KI ${i + 1}`, realmId: REALMS[i], control }));

function table(s: GameState, control: Control = 'ai-normal'): GameState {
  for (const p of s.players) p.control = control;
  return s;
}

describe('KI spielt regelkonform', () => {
  it.each([2, 3, 4])('%i KI-Spieler beenden eine Partie ohne Regelverstoß', n => {
    const { final } = playAiGame(11 + n, ai(n));
    expect(final.phase).toBe('ended');
    expect(final.winners?.length).toBeGreaterThan(0);
  }, 60000);
  it.each(['ai-easy', 'ai-normal', 'ai-hard'] as Control[])('Stufe %s beendet eine Partie', c => {
    expect(playAiGame(5, ai(2, c)).final.phase).toBe('ended');
  }, 60000);
  it('ist bei gleichem Seed reproduzierbar', () => {
    const a = playAiGame(21, ai(2)).final;
    const b = playAiGame(21, ai(2)).final;
    expect(a.players.map(p => totalFame(a, p.id))).toEqual(b.players.map(p => totalFame(b, p.id)));
    expect(a.actionCount).toBe(b.actionCount);
  }, 60000);
  it('macht tatsächlich etwas: Minen, Wächter, Gebäude, Ruhm', () => {
    let mines = 0, guardians = 0, built = 0;
    for (let seed = 0; seed < 4; seed++) {
      const { final } = playAiGame(seed, ai(2));
      mines += Object.values(final.tiles).filter(t => t.content?.kind === 'mine' && t.content.owner !== null).length;
      guardians += final.players.reduce((n, p) => n + p.fame.guardian, 0);
      built += Object.values(final.cities).reduce((n, c) => n + c.buildings.length - 3, 0);
    }
    expect(mines).toBeGreaterThan(0);
    expect(guardians).toBeGreaterThan(0);
    expect(built).toBeGreaterThan(0);
  }, 60000);
});

describe('Schwierigkeitsstufen', () => {
  const duel = (a: Control, b: Control, games: number): number => {
    let wins = 0;
    for (let g = 0; g < games; g++) {
      const swap = g % 2 === 1;
      const setups: PlayerSetup[] = [
        { name: 'X', realmId: REALMS[g % 4], control: swap ? b : a },
        { name: 'Y', realmId: REALMS[(g + 1) % 4], control: swap ? a : b },
      ];
      const w = playAiGame(90000 + g, setups).final.winners ?? [];
      if (w.includes(swap ? 1 : 0)) wins += 1 / w.length;
    }
    return wins / games;
  };
  it('normal schlägt leicht deutlich', () => {
    expect(duel('ai-normal', 'ai-easy', 60)).toBeGreaterThan(0.6);
  }, 120000);
  it('schwer schlägt normal', () => {
    expect(duel('ai-hard', 'ai-normal', 100)).toBeGreaterThan(0.53);
  }, 120000);
});

describe('KI-Entscheidungen', () => {
  it('kennt keine verdeckten Felder: Die Aktion hängt nicht vom Herzstein ab', () => {
    const s = table(newGame(2));
    const other = structuredClone(s);
    other.heartstone = other.heartstone === '1,0' ? '0,1' : '1,0';
    expect(aiAction(s)).toEqual(aiAction(other));
  });
  it('die Aktion hängt nicht vom Inhalt verdeckter Felder ab', () => {
    const s = toHeroPhase(table(newGame(2)));
    const other = structuredClone(s);
    for (const t of Object.values(other.tiles)) {
      if (!t.revealedBy.includes(0)) {
        t.content = { kind: 'treasure', reward: { type: 'gold', value: 99 } };
        t.terrain = 'mountain';
      }
    }
    expect(aiAction(s)).toEqual(aiAction(other));
  });
  it('meidet aussichtslose Kämpfe', () => {
    const s = toHeroPhase(table(newGame(2)));
    clearBoard(s);
    const h = heroOf(s, 0);
    place(h, { q: 0, r: 2 }, { army: [{ creatureId: 'landwehr', count: 1 }] });
    setTile(s, { q: 0, r: 3 }, { revealedBy: [0], content: { kind: 'guardian', tier: 3, name: 'W', army: [{ creatureId: 'uraltwache', count: 2 }] } });
    const view = playerView(s, 0);
    const choice = chooseTarget(view, view.heroes[h.id], BALANCE.ai.normal, () => 0);
    expect(choice?.candidate.encounter).toBeFalsy();
  });
  it('nimmt lohnende Kämpfe an', () => {
    const s = toHeroPhase(table(newGame(2)));
    clearBoard(s);
    s.players[0].resources.gold = 0;
    s.heartstoneFound = true;
    const h = heroOf(s, 0);
    // Abseits der Grabfelder ums Zentrum, damit nur der Wächter lockt.
    place(h, { q: 0, r: 3 }, { army: [{ creatureId: 'hainrufer', count: 6 }] });
    setTile(s, { q: 0, r: 3 }, { revealedBy: [0] });
    for (const n of neighbors({ q: 0, r: 3 })) setTile(s, n, { revealedBy: [0] });
    setTile(s, { q: 0, r: 4 }, { content: { kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 1 }] } });
    const view = playerView(s, 0);
    expect(chooseTarget(view, view.heroes[h.id], BALANCE.ai.normal, () => 0)?.candidate.encounter?.target.kind).toBe('guardian');
  });
  it('Monte-Carlo verändert den Spielzustand nicht', () => {
    const s = toHeroPhase(table(newGame(2)));
    const h = heroOf(s, 0);
    setTile(s, { q: 3, r: 0 }, { revealedBy: [0], content: { kind: 'guardian', tier: 1, name: 'W', army: [{ creatureId: 'raeuber', count: 1 }] } });
    const copy = structuredClone(s);
    const odds = encounterOdds(s, { heroId: h.id, target: { kind: 'guardian', hex: { q: 3, r: 0 } }, from: h.pos, moveCost: 1 }, 200);
    expect(odds.runs).toBe(200);
    expect(s).toEqual(copy);
  });
  it('Kampf-KI: Fernkämpfer werden bevorzugt', () => {
    const side = (army: { creatureId: string; count: number }[]) => ({
      kind: 'hero' as const, label: 'X', playerId: 0, attack: 0, defense: 0, magic: 0, spells: [], spellSlots: 1, rangedNoPenalty: false, tierDice: {}, army,
    });
    let c = initCombat({ attacker: side([{ creatureId: 'nachtschwinge', count: 6 }]), defender: side([{ creatureId: 'armbruster', count: 2 }, { creatureId: 'landwehr', count: 2 }]), siege: null, seed: 1 });
    c = combatReducer(c, { type: 'place', placements: [{ stackId: 2, row: 0, line: 'back' }, { stackId: 3, row: 0, line: 'front' }] });
    c = combatReducer(c, { type: 'place', placements: [{ stackId: 1, row: 0, line: 'front' }] });
    expect(aiTarget(c, c.stacks[0])?.creatureId).toBe('armbruster');
  });
  it('Gildenwahl bevorzugt Kampfzauber', () => {
    expect(pickSpell(['portal', 'lightning'])).toBe('lightning');
  });
});
