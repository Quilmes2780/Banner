// Kampfentscheidungen für Wächter, KI und Monte-Carlo-Simulation.
import { BALANCE } from '../../config/balance';
import { spellById } from '../content';
import {
  aliveStacks, applyCombatMut, attackThreshold, cloneCombat, combatPendingSide, defaultPlacement, diceCount,
  hasAbility, initCombat, legalHealTargets, legalMoves, legalTargets, lostHp, otherSide, spellSlotsLeft, stackOf,
} from './combat';
import type { CStack, CombatAction, CombatSetup, CombatState, Side } from './types';

export const remainingHp = (s: CStack): number => s.count * s.hp - s.damage;

/** Erwarteter Schaden eines Angriffs, gedeckelt durch die verbleibenden LP des Ziels. */
export function expectedDamage(c: CombatState, att: CStack, tgt: CStack): number {
  const threshold = attackThreshold(c, att, tgt, hasAbility(att, 'ranged'));
  const pHit = (7 - threshold) / 6;
  return Math.min(remainingHp(tgt), diceCount(c, att) * pHit * att.dmg);
}

/** Regel 7: Wächter greifen das Ziel an, dem sie am meisten Schaden zufügen. */
export function guardianTarget(c: CombatState, att: CStack): CStack | null {
  let best: CStack | null = null;
  let bestScore = -1;
  for (const t of legalTargets(c, att)) {
    const score = expectedDamage(c, att, t);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

/** KI: größter erwarteter Schaden, Fernkämpfer werden bevorzugt ausgeschaltet. */
export function aiTarget(c: CombatState, att: CStack): CStack | null {
  let best: CStack | null = null;
  let bestScore = -1;
  for (const t of legalTargets(c, att)) {
    const score = expectedDamage(c, att, t) * (hasAbility(t, 'ranged') ? BALANCE.ai.rangedTargetBonus : 1);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

function stepTowardsEnemy(c: CombatState, s: CStack): CombatAction {
  const moves = legalMoves(c, s);
  const forward = moves.find(m => m.line === 'front' && s.line === 'back');
  if (forward) return { type: 'moveStack', ...forward };
  const enemies = aliveStacks(c, otherSide(s.side));
  const front = enemies.filter(e => e.line === 'front');
  const pool = front.length > 0 ? front : enemies;
  const dist = (row: number) => Math.min(...pool.map(e => Math.abs(e.row - row)));
  const sideways = moves.filter(m => m.line === s.line).sort((a, b) => dist(a.row) - dist(b.row))[0];
  if (sideways && dist(sideways.row) < dist(s.row)) return { type: 'moveStack', ...sideways };
  return { type: 'pass' };
}

function activationAction(c: CombatState, s: CStack, guardian: boolean): CombatAction {
  const healTargets = legalHealTargets(c, s);
  const worst = [...healTargets].sort((a, b) => lostHp(b) - lostHp(a))[0];
  const target = guardian ? guardianTarget(c, s) : aiTarget(c, s);
  if (worst && (!target || lostHp(worst) >= s.count * BALANCE.combat.healPerUnit)) {
    return { type: 'heal', targetId: worst.id };
  }
  if (target) return { type: 'attack', targetId: target.id };
  return stepTowardsEnemy(c, s);
}

function power(c: CombatState, side: Side): number {
  return aliveStacks(c, side).reduce((sum, s) => sum + diceCount(c, s) * s.dmg * remainingHp(s), 0);
}

function chooseSpell(c: CombatState, side: Side): CombatAction | null {
  if (spellSlotsLeft(c, side) <= 0) return null;
  const known = c.sides[side].spells.map(id => spellById[id]);
  const enemies = aliveStacks(c, otherSide(side));
  const mine = aliveStacks(c, side);
  if (enemies.length === 0 || mine.length === 0) return null;
  const biggest = [...mine].sort((a, b) => diceCount(c, b) * b.dmg - diceCount(c, a) * a.dmg)[0];
  const fire = known.find(s => s.kind === 'fireball');
  if (fire) {
    const rows = [0, 1, 2].map(r => ({ r, n: enemies.filter(e => e.row === r).length }));
    const best = rows.sort((a, b) => b.n - a.n)[0];
    if (best.n >= 2) return { type: 'cast', spellId: fire.id, row: best.r };
  }
  const bolt = known.find(s => s.kind === 'lightning');
  if (bolt) {
    const t = [...enemies].sort((a, b) => diceCount(c, b) * b.dmg - diceCount(c, a) * a.dmg)[0];
    return { type: 'cast', spellId: bolt.id, targetId: t.id };
  }
  if (fire) return { type: 'cast', spellId: fire.id, row: enemies[0].row };
  const bless = known.find(s => s.kind === 'bless');
  if (bless && !biggest.blessed) return { type: 'cast', spellId: bless.id, targetId: biggest.id };
  const skin = known.find(s => s.kind === 'stoneskin');
  if (skin && !biggest.stoneskin) return { type: 'cast', spellId: skin.id, targetId: biggest.id };
  const haste = known.find(s => s.kind === 'haste');
  if (haste && c.round === 1) return { type: 'cast', spellId: haste.id, targetId: biggest.id };
  return null;
}

/** Vollständige automatische Entscheidung für die Seite am Zug. */
export function autoCombatAction(c: CombatState, opts: { allowFlee?: boolean } = {}): CombatAction {
  const side = combatPendingSide(c) as Side;
  if (c.step === 'placement') return { type: 'place', placements: defaultPlacement(c, side) };
  if (c.step === 'decision') {
    // ANNAHME: Die KI flieht nur vor Helden, weil das dem Gegner den Heldensieg verwehrt.
    if (opts.allowFlee && c.sides[otherSide(side)].kind === 'hero' && c.round > 1 &&
        power(c, side) < power(c, otherSide(side)) * BALANCE.ai.fleeBelowPowerRatio) {
      return { type: 'flee' };
    }
    return chooseSpell(c, side) ?? { type: 'passDecision' };
  }
  const s = stackOf(c, c.activeId as number);
  return activationAction(c, s, c.sides[side].kind === 'guardian');
}

/** Spielt einen Kampf automatisch zu Ende. Reine Funktion nach außen. */
export function runToEnd(start: CombatState): CombatState {
  const c = cloneCombat(start);
  c.log = [];
  let guard = 0;
  while (c.step !== 'done') {
    applyCombatMut(c, autoCombatAction(c));
    c.log.length = 0;
    if (++guard > 500) throw new Error('Kampf terminiert nicht.');
  }
  return c;
}

export interface SimulationResult {
  runs: number;
  winRate: number; // Anteil Siege des Angreifers
  drawRate: number; // Rundenlimit: Angreifer zieht sich zurück
  lossRate: number;
  avgAttackerLossShare: number; // Anteil verlorener Einheiten des Angreifers
}

/** Regel: Kampfrisiko per Monte-Carlo-Simulation. Verändert keinen Spielzustand. */
export function simulateCombat(setup: CombatSetup, runs: number, seed: number): SimulationResult {
  let wins = 0, draws = 0, lossShare = 0;
  const totalAttackerUnits = setup.attacker.army.reduce((n, s) => n + s.count, 0) || 1;
  const base = initCombat({ ...setup, seed });
  let rng = seed;
  for (let i = 0; i < runs; i++) {
    const start = cloneCombat(base);
    start.rng = (rng = (rng + 0x9e3779b1) | 0);
    const end = runToEnd(start);
    const winner = end.result?.winner ?? null;
    if (winner === 'attacker') wins += 1;
    else if (winner === null) draws += 1;
    lossShare += end.killed.attacker / totalAttackerUnits;
  }
  return {
    runs,
    winRate: wins / runs,
    drawRate: draws / runs,
    lossRate: (runs - wins - draws) / runs,
    avgAttackerLossShare: lossShare / runs,
  };
}
