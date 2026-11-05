// Kampfregeln (Regel 7 und Kampfzauber aus Regel 8). combatReducer ist rein;
// intern wird auf einer Kopie gearbeitet, damit die Simulation schnell bleibt.
import { BALANCE } from '../../config/balance';
import { creatureById, spellById } from '../content';
import { RuleError } from '../errors';
import { d6 } from '../rng';
import type {
  CStack, CombatAction, CombatSetup, CombatState, DiceRoll, Line, Placement, Side, SideSetup,
} from './types';

const C = BALANCE.combat;
export const otherSide = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');
export const aliveStacks = (c: CombatState, side?: Side): CStack[] =>
  c.stacks.filter(s => s.count > 0 && (!side || s.side === side));
export const stackOf = (c: CombatState, id: number): CStack => {
  const s = c.stacks.find(x => x.id === id);
  if (!s) throw new RuleError('Unbekannter Stapel.');
  return s;
};
const nameOf = (s: CStack): string => creatureById[s.creatureId].name;
export const hasAbility = (s: CStack, a: CStack['abilities'][number]): boolean => s.abilities.includes(a);

export function cloneCombat(c: CombatState): CombatState {
  return {
    ...c,
    queue: [...c.queue],
    spellsCast: { ...c.spellsCast },
    killed: { ...c.killed },
    stacks: c.stacks.map(s => ({ ...s })),
    lastRolls: [...c.lastRolls],
    log: [...c.log],
  };
}

export function initCombat(setup: CombatSetup): CombatState {
  let id = 1;
  const stacks: CStack[] = [];
  for (const side of ['attacker', 'defender'] as Side[]) {
    for (const entry of setup[side].army) {
      if (entry.count <= 0) continue;
      const def = creatureById[entry.creatureId];
      const t = BALANCE.tiers[def.tier];
      stacks.push({
        id: id++, side, origin: entry.origin ?? (setup[side].kind === 'guardian' ? 'guardian' : 'hero'),
        creatureId: def.id, tier: def.tier, count: entry.count, initialCount: entry.count, damage: 0,
        row: -1, line: 'front',
        dice: t.dice, dmg: t.damage, hp: t.hp, speed: t.speed + (setup.tempoBonus?.[def.tier] ?? 0),
        abilities: def.abilities, retaliatedRound: 0, blessed: false, stoneskin: false,
      });
    }
  }
  const c: CombatState = {
    rng: setup.seed, round: 0, step: 'placement', pendingSide: 'defender',
    sides: { attacker: setup.attacker, defender: setup.defender }, siege: setup.siege,
    stacks, queue: [], activeId: null, spellsCast: { attacker: 0, defender: 0 }, killed: { attacker: 0, defender: 0 },
    lastRolls: [], log: [], result: null,
  };
  preparePlacement(c);
  return c;
}

/** Standardaufstellung: Nahkämpfer vorn, Fernkämpfer/Heiler/Fliegende hinten, Mitte zuerst. */
export function defaultPlacement(c: CombatState, side: Side): Placement[] {
  const mine = c.stacks.filter(s => s.side === side && s.count > 0);
  const free: { row: number; line: Line }[] = [];
  const rows = [1, 0, 2];
  const wantsBack = (s: CStack) => hasAbility(s, 'ranged') || hasAbility(s, 'heal') || hasAbility(s, 'flying');
  const out: Placement[] = [];
  for (const line of ['front', 'back'] as Line[]) for (const row of rows) free.push({ row, line });
  const take = (line: Line) => {
    const i = free.findIndex(f => f.line === line);
    return free.splice(i >= 0 ? i : 0, 1)[0];
  };
  const order = [...mine].sort((a, b) => b.tier - a.tier || b.count - a.count || a.id - b.id);
  for (const s of order.filter(x => !wantsBack(x))) { const p = take('front'); out.push({ stackId: s.id, ...p }); }
  for (const s of order.filter(wantsBack)) { const p = take('back'); out.push({ stackId: s.id, ...p }); }
  return out;
}

function preparePlacement(c: CombatState): void {
  // Verteidiger stellt zuerst auf. Wächter stellen sich selbst auf, leere Seiten überspringen.
  while (c.step === 'placement') {
    const side = c.pendingSide as Side;
    const hasStacks = aliveStacks(c, side).length > 0;
    if (hasStacks && c.sides[side].kind !== 'guardian') return;
    if (hasStacks) applyPlacement(c, side, defaultPlacement(c, side));
    if (side === 'defender') c.pendingSide = 'attacker';
    else startRound(c);
  }
}

function applyPlacement(c: CombatState, side: Side, placements: Placement[]): void {
  const mine = aliveStacks(c, side);
  if (placements.length !== mine.length) throw new RuleError('Alle Stapel müssen aufgestellt werden.');
  const used = new Set<string>();
  for (const p of placements) {
    const s = stackOf(c, p.stackId);
    if (s.side !== side) throw new RuleError('Fremder Stapel kann nicht aufgestellt werden.');
    if (p.row < 0 || p.row >= C.rows) throw new RuleError('Reihe liegt außerhalb des Rasters.');
    const key = `${p.row}:${p.line}`;
    if (used.has(key)) throw new RuleError('Auf einem Feld darf nur ein Stapel stehen.');
    used.add(key);
    s.row = p.row;
    s.line = p.line;
  }
}

function startRound(c: CombatState): void {
  c.round += 1;
  c.step = 'decision';
  c.pendingSide = 'attacker';
  c.log.push(`Runde ${c.round} beginnt.`);
  advanceDecision(c);
}

function canDecide(c: CombatState, side: Side): boolean {
  return c.sides[side].kind === 'hero' && aliveStacks(c, side).length > 0;
}

function advanceDecision(c: CombatState): void {
  // ANNAHME: Zauber werden zu Rundenbeginn gewirkt; der Angreifer entscheidet vor dem Verteidiger.
  while (c.step === 'decision' && c.pendingSide) {
    if (canDecide(c, c.pendingSide)) return;
    c.pendingSide = c.pendingSide === 'attacker' ? 'defender' : null;
  }
  if (c.step === 'decision') beginActivations(c);
}

function beginActivations(c: CombatState): void {
  c.step = 'activation';
  c.lastRolls = [];
  if (c.siege?.wall) towerShot(c); // ANNAHME: Der Turm schießt nach den Entscheidungen, vor den Aktivierungen.
  if (checkEnd(c)) return;
  c.queue = initiativeOrder(c);
  nextActivation(c);
}

/** Regel 7: Initiative nach Tempo, bei Gleichstand der Angreifer. */
export function initiativeOrder(c: CombatState): number[] {
  return aliveStacks(c)
    .sort((a, b) => b.speed - a.speed || (a.side === b.side ? a.id - b.id : a.side === 'attacker' ? -1 : 1))
    .map(s => s.id);
}

function nextActivation(c: CombatState): void {
  while (c.queue.length > 0) {
    const id = c.queue.shift() as number;
    if (stackOf(c, id).count > 0) {
      c.activeId = id;
      return;
    }
  }
  c.activeId = null;
  if (c.round >= C.maxRounds) {
    c.log.push(`Nach ${C.maxRounds} Runden zieht sich der Angreifer zurück.`);
    finish(c, { winner: null, reason: 'roundLimit', fled: null });
  } else startRound(c);
}

function finish(c: CombatState, result: CombatState['result']): void {
  c.result = result;
  c.step = 'done';
  c.pendingSide = null;
  c.activeId = null;
  c.queue = [];
}

function checkEnd(c: CombatState): boolean {
  const a = aliveStacks(c, 'attacker').length;
  const d = aliveStacks(c, 'defender').length;
  if (a > 0 && d > 0) return false;
  const winner: Side | null = a > 0 ? 'attacker' : d > 0 ? 'defender' : 'defender'; // ANNAHME: Beidseitige Auslöschung zählt für den Verteidiger.
  c.log.push(`${c.sides[winner].label} siegt.`);
  finish(c, { winner, reason: 'elimination', fled: null });
  return true;
}

/** Regel 7: Trefferschwelle aus Heldenvorsprung und Effekten, begrenzt auf 2+ bis 6+. */
export function hitThreshold(attackValue: number, defenseValue: number, modifier = 0): number {
  const diff = attackValue - defenseValue;
  const step = Math.max(-2, Math.min(2, diff));
  return Math.max(C.minHit, Math.min(C.maxHit, C.baseHit - step + modifier));
}

/** Regel 7: Fernkampf -1, wenn selbst vorn mit einem Gegner direkt gegenüber. ANNAHME: -1 heißt Trefferschwelle +1; "gegenüber" heißt gleiche Reihe. */
export function rangedPenaltyApplies(c: CombatState, shooter: CStack): boolean {
  if (!hasAbility(shooter, 'ranged') || shooter.line !== 'front') return false;
  if (c.sides[shooter.side].rangedNoPenalty) return false;
  return aliveStacks(c, otherSide(shooter.side)).some(e => e.line === 'front' && e.row === shooter.row);
}

export function attackThreshold(c: CombatState, att: CStack, tgt: CStack, isRangedAttack: boolean): number {
  let mod = 0;
  if (att.blessed) mod -= BALANCE.spells.bless.hitBonus;
  if (tgt.stoneskin) mod += BALANCE.spells.stoneskin.hitMalus;
  if (isRangedAttack && rangedPenaltyApplies(c, att)) mod += C.rangedPenalty;
  return hitThreshold(c.sides[att.side].attack, c.sides[tgt.side].defense, mod);
}

/** Regel 7: Würfel = Einheiten x Würfel je Einheit, höchstens 8. */
export function diceCount(c: CombatState, s: CStack): number {
  const bonus = c.sides[s.side].tierDice[s.tier] ?? 0;
  return Math.min(C.maxDice, s.count * s.dice + bonus);
}

/** Regel 7: Je volle LP stirbt eine Einheit, Restschaden bleibt am Stapel. */
export function applyDamage(c: CombatState, tgt: CStack, damage: number): number {
  const total = damage + tgt.damage;
  const kills = Math.min(tgt.count, Math.floor(total / tgt.hp));
  tgt.count -= kills;
  tgt.damage = tgt.count > 0 ? total - kills * tgt.hp : 0;
  c.killed[tgt.side] += kills;
  return kills;
}

function rollDice(c: CombatState, n: number): number[] {
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = d6(c);
  return out;
}

function strike(c: CombatState, att: CStack, tgt: CStack, ranged: boolean, kind: DiceRoll['kind']): void {
  const threshold = attackThreshold(c, att, tgt, ranged);
  const rolls = rollDice(c, diceCount(c, att));
  const hits = rolls.filter(r => r >= threshold).length;
  const damage = hits * att.dmg;
  const kills = applyDamage(c, tgt, damage);
  c.lastRolls.push({ actor: nameOf(att), target: nameOf(tgt), rolls, threshold, hits, damage, kills, kind });
  c.log.push(`${nameOf(att)} ${kind === 'retaliation' ? 'schlägt zurück gegen' : ranged ? 'beschießt' : 'greift an:'} ${nameOf(tgt)} — ${rolls.length} Würfel auf ${threshold}+, ${hits} Treffer, ${damage} Schaden, ${kills} gefallen.`);
}

function towerShot(c: CombatState): void {
  const targets = aliveStacks(c, 'attacker');
  if (targets.length === 0) return;
  // ANNAHME: Der Turm zielt auf den Stapel mit den wenigsten LP je Einheit (meiste erwartete Verluste).
  const tgt = [...targets].sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
  const rolls = rollDice(c, C.towerDice);
  const hits = rolls.filter(r => r >= C.towerHit).length;
  const damage = hits * C.towerDamage;
  const kills = applyDamage(c, tgt, damage);
  c.lastRolls.push({ actor: 'Turm', target: nameOf(tgt), rolls, threshold: C.towerHit, hits, damage, kills, kind: 'tower' });
  c.log.push(`Der Turm schießt auf ${nameOf(tgt)} — ${hits} Treffer, ${kills} gefallen.`);
}

/** Regel 7: Gültige Ziele eines Stapels. */
export function legalTargets(c: CombatState, s: CStack): CStack[] {
  const enemies = aliveStacks(c, otherSide(s.side));
  if (hasAbility(s, 'ranged') || hasAbility(s, 'flying')) return enemies;
  if (s.line !== 'front') return [];
  const front = enemies.filter(e => e.line === 'front');
  // Hintere Linie erst, wenn die vordere leer ist. ANNAHME: Die Reihenbeschränkung gilt auch dann.
  const pool = front.length > 0 ? front : enemies;
  return pool.filter(e => Math.abs(e.row - s.row) <= 1);
}

/** ANNAHME (Vorschlag 3): Statt anzugreifen darf ein Stapel 1 Feld auf der eigenen Seite ziehen. */
export function legalMoves(c: CombatState, s: CStack): { row: number; line: Line }[] {
  const occupied = new Set(aliveStacks(c, s.side).map(x => `${x.row}:${x.line}`));
  const options: { row: number; line: Line }[] = [
    { row: s.row, line: s.line === 'front' ? 'back' : 'front' },
    { row: s.row - 1, line: s.line },
    { row: s.row + 1, line: s.line },
  ];
  return options.filter(o => o.row >= 0 && o.row < C.rows && !occupied.has(`${o.row}:${o.line}`));
}

export function lostHp(s: CStack): number {
  return (s.initialCount - s.count) * s.hp + s.damage;
}

export function legalHealTargets(c: CombatState, s: CStack): CStack[] {
  if (!hasAbility(s, 'heal')) return [];
  return aliveStacks(c, s.side).filter(x => lostHp(x) > 0);
}

function heal(c: CombatState, healer: CStack, tgt: CStack): void {
  // ANNAHME: Heilen entfernt zuerst Restschaden, danach kehren Gefallene zurück, höchstens bis zur Anfangsgröße.
  const amount = Math.min(lostHp(tgt), healer.count * C.healPerUnit);
  const remaining = tgt.count * tgt.hp - tgt.damage + amount;
  const newCount = Math.ceil(remaining / tgt.hp);
  c.killed[tgt.side] -= newCount - tgt.count;
  tgt.count = newCount;
  tgt.damage = newCount * tgt.hp - remaining;
  c.log.push(`${nameOf(healer)} heilt ${nameOf(tgt)} um ${amount} LP.`);
}

export function spellSlotsLeft(c: CombatState, side: Side): number {
  return c.sides[side].spellSlots - c.spellsCast[side];
}

function castSpell(c: CombatState, side: Side, a: Extract<CombatAction, { type: 'cast' }>): void {
  const sideInfo: SideSetup = c.sides[side];
  if (!sideInfo.spells.includes(a.spellId)) throw new RuleError('Dieser Zauber ist nicht bekannt.');
  if (spellSlotsLeft(c, side) <= 0) throw new RuleError('Kein Zauber mehr in diesem Kampf möglich.');
  const def = spellById[a.spellId];
  const label = sideInfo.label;
  const needsStack = (want: Side): CStack => {
    if (a.targetId === undefined) throw new RuleError('Dieser Zauber braucht ein Ziel.');
    const t = stackOf(c, a.targetId);
    if (t.side !== want || t.count <= 0) throw new RuleError('Ungültiges Zauberziel.');
    return t;
  };
  switch (def.kind) {
    case 'lightning': {
      const t = needsStack(otherSide(side));
      const dmg = BALANCE.spells.lightning.base + sideInfo.magic * BALANCE.spells.lightning.perMagic;
      const kills = applyDamage(c, t, dmg);
      c.log.push(`${label} wirkt ${def.name} auf ${nameOf(t)}: ${dmg} Schaden, ${kills} gefallen.`);
      break;
    }
    case 'bless': { const t = needsStack(side); t.blessed = true; c.log.push(`${label} segnet ${nameOf(t)}.`); break; }
    case 'haste': { const t = needsStack(side); t.speed += BALANCE.spells.haste.speed; c.log.push(`${label} beschleunigt ${nameOf(t)}.`); break; }
    case 'stoneskin': { const t = needsStack(side); t.stoneskin = true; c.log.push(`${label} härtet ${nameOf(t)} mit Steinhaut.`); break; }
    case 'fireball': {
      if (a.row === undefined || a.row < 0 || a.row >= C.rows) throw new RuleError('Feuerball braucht eine Reihe.');
      const dmg = BALANCE.spells.fireball.base + sideInfo.magic * BALANCE.spells.fireball.perMagic;
      const hit = aliveStacks(c, otherSide(side)).filter(s => s.row === a.row);
      let kills = 0;
      for (const t of hit) kills += applyDamage(c, t, dmg);
      c.log.push(`${label} wirkt ${def.name} auf Reihe ${a.row + 1}: je ${dmg} Schaden, ${kills} gefallen.`);
      break;
    }
    case 'portal':
      throw new RuleError('Stadtportal wirkt nur auf der Abenteuerkarte.');
  }
  c.spellsCast[side] += 1;
}

function afterActivation(c: CombatState): void {
  if (!checkEnd(c)) nextActivation(c);
}

/** Wendet eine Kampfaktion auf den übergebenen Zustand an (mutierend). Nur für interne Nutzung und Simulation. */
export function applyCombatMut(c: CombatState, a: CombatAction): void {
  if (c.step === 'done') throw new RuleError('Der Kampf ist beendet.');
  switch (a.type) {
    case 'place': {
      if (c.step !== 'placement') throw new RuleError('Die Aufstellung ist abgeschlossen.');
      const side = c.pendingSide as Side;
      applyPlacement(c, side, a.placements);
      c.log.push(`${c.sides[side].label} stellt auf.`);
      if (side === 'defender') c.pendingSide = 'attacker';
      else { startRound(c); return; }
      preparePlacement(c);
      return;
    }
    case 'flee': {
      if (c.step !== 'decision') throw new RuleError('Flucht ist nur zu Rundenbeginn möglich.');
      const side = c.pendingSide as Side;
      c.log.push(`${c.sides[side].label} flieht.`);
      finish(c, { winner: otherSide(side), reason: 'flee', fled: side });
      return;
    }
    case 'cast': {
      if (c.step !== 'decision') throw new RuleError('Zauber sind nur zu Rundenbeginn möglich.');
      castSpell(c, c.pendingSide as Side, a);
      checkEnd(c);
      return;
    }
    case 'passDecision': {
      if (c.step !== 'decision') throw new RuleError('Gerade ist keine Entscheidung offen.');
      c.pendingSide = c.pendingSide === 'attacker' ? 'defender' : null;
      advanceDecision(c);
      return;
    }
    case 'attack': {
      const att = requireActive(c);
      const tgt = stackOf(c, a.targetId);
      if (!legalTargets(c, att).includes(tgt)) throw new RuleError('Dieses Ziel ist nicht erreichbar.');
      c.lastRolls = [];
      const ranged = hasAbility(att, 'ranged');
      strike(c, att, tgt, ranged, 'attack');
      // Regel 7: Das Nahkampfziel schlägt einmal pro Runde zurück.
      // ANNAHME: "Schnell" bedeutet, dass der Angreifer keinen Rückschlag erhält.
      // ANNAHME: Auch Fernkämpfer schlagen im Nahkampf zurück, und Fliegende können Rückschläge erhalten.
      if (!ranged && !hasAbility(att, 'fast') && tgt.count > 0 && tgt.retaliatedRound !== c.round) {
        tgt.retaliatedRound = c.round;
        strike(c, tgt, att, false, 'retaliation');
      }
      afterActivation(c);
      return;
    }
    case 'heal': {
      const healer = requireActive(c);
      const tgt = stackOf(c, a.targetId);
      if (!legalHealTargets(c, healer).includes(tgt)) throw new RuleError('Dieser Stapel kann nicht geheilt werden.');
      c.lastRolls = [];
      heal(c, healer, tgt);
      afterActivation(c);
      return;
    }
    case 'moveStack': {
      const s = requireActive(c);
      if (!legalMoves(c, s).some(m => m.row === a.row && m.line === a.line)) throw new RuleError('Dieses Feld ist nicht erreichbar.');
      s.row = a.row;
      s.line = a.line;
      c.lastRolls = [];
      c.log.push(`${nameOf(s)} zieht auf ein neues Feld.`);
      afterActivation(c);
      return;
    }
    case 'pass': {
      requireActive(c);
      c.lastRolls = [];
      afterActivation(c);
      return;
    }
  }
}

function requireActive(c: CombatState): CStack {
  if (c.step !== 'activation' || c.activeId === null) throw new RuleError('Gerade ist kein Stapel am Zug.');
  return stackOf(c, c.activeId);
}

/** Reine Schnittstelle: (Kampfzustand, Aktion) -> neuer Kampfzustand. */
export function combatReducer(c: CombatState, a: CombatAction): CombatState {
  const next = cloneCombat(c);
  applyCombatMut(next, a);
  return next;
}

/** Wer muss gerade entscheiden? */
export function combatPendingSide(c: CombatState): Side | null {
  if (c.step === 'placement' || c.step === 'decision') return c.pendingSide;
  if (c.step === 'activation' && c.activeId !== null) return stackOf(c, c.activeId).side;
  return null;
}
