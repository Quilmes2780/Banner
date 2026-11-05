// Ruhm und Spielende (Regel 9).
import { BALANCE } from '../config/balance';
import { armyLevels, citiesOf, heroesOf, log } from './helpers';
import type { FameSource, GameState, PlayerId } from './types';

const F = BALANCE.fame;

export type FameBreakdown = Record<FameSource, number> & { total: number };

/** Ruhm nach Quelle. Sofort-Ruhm steht im Ledger, Endwertung wird aus dem aktuellen Zustand berechnet. */
export function fameBreakdown(s: GameState, playerId: PlayerId): FameBreakdown {
  const p = s.players[playerId];
  const cities = citiesOf(s, playerId);
  const heroes = heroesOf(s, playerId);
  const units = [...heroes.map(h => h.army), ...cities.map(c => c.garrison)].reduce((n, army) => n + armyLevels(army), 0);
  const mines = Object.values(s.tiles).filter(t => t.content?.kind === 'mine' && t.content.owner === playerId).length;
  const b: Omit<FameBreakdown, 'total'> = {
    ...p.fame,
    city: cities.filter(c => c.originalOwner === playerId).length * F.homeCity,
    capturedCapital: cities.filter(c => c.originalOwner !== playerId).length * F.capturedCapital,
    capitol: cities.filter(c => c.buildings.includes('capitol')).length * F.capitol,
    mine: mines * F.mine,
    heroLevel: heroes.reduce((n, h) => n + (h.level - 1), 0) * F.heroLevel,
    artifact: heroes.reduce((n, h) => n + h.artifacts.length, 0) * F.artifact,
    armyLevels: Math.floor(units / F.armyLevelsPerFame),
  };
  return { ...b, total: Object.values(b).reduce((a, v) => a + v, 0) };
}

export const totalFame = (s: GameState, id: PlayerId): number => fameBreakdown(s, id).total;

/** Regel 9: Hält ein Spieler alle gegnerischen Hauptstädte? */
export function conquerorOf(s: GameState): PlayerId | null {
  for (const p of s.players) {
    const foreign = Object.values(s.cities).filter(c => c.originalOwner !== p.id);
    if (foreign.length > 0 && foreign.every(c => c.owner === p.id)) return p.id;
  }
  return null;
}

/** ANNAHME: Bei Gleichstand gewinnen alle Spieler mit dem höchsten Ruhm gemeinsam. */
export function fameLeaders(s: GameState): PlayerId[] {
  const totals = s.players.map(p => ({ id: p.id, fame: totalFame(s, p.id) }));
  const best = Math.max(...totals.map(t => t.fame));
  return totals.filter(t => t.fame === best).map(t => t.id);
}

export function endGame(s: GameState, reason: 'weeks' | 'conquest', conqueror?: PlayerId): void {
  s.phase = 'ended';
  s.endReason = reason;
  // ANNAHME: Der Eroberer aller Hauptstädte gewinnt sofort, unabhängig vom Ruhm.
  s.winners = reason === 'conquest' ? [conqueror as PlayerId] : fameLeaders(s);
  log(s, reason === 'conquest'
    ? `${s.players[conqueror as PlayerId].name} hält alle gegnerischen Hauptstädte und siegt sofort.`
    : `Woche ${BALANCE.weeks} ist vorüber. Sieg: ${s.winners.map(id => s.players[id].name).join(', ')}.`);
}
