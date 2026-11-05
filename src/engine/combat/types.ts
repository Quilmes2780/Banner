// Datenmodell des Kampfes. Der Kampf ist unabhängig vom Spielzustand lauffähig (Testmodus, Simulation).
import type { Ability, PlayerId, Stack, Tier } from '../types';

export type Side = 'attacker' | 'defender';
export type Line = 'back' | 'front';
export type StackOrigin = 'hero' | 'garrison' | 'guardian';

export interface ArmyEntry extends Stack { origin?: StackOrigin }

export interface SideSetup {
  kind: 'hero' | 'guardian' | 'garrison';
  label: string;
  playerId: PlayerId | null;
  heroId?: string;
  realmId?: string;
  attack: number;
  defense: number;
  magic: number;
  spells: string[];
  spellSlots: number;
  rangedNoPenalty: boolean;
  tierDice: Partial<Record<Tier, number>>;
  army: ArmyEntry[];
}

export interface CombatSetup {
  attacker: SideSetup;
  defender: SideSetup;
  siege: { wall: boolean } | null;
  tempoBonus?: Partial<Record<Tier, number>>;
  seed: number;
}

export interface CStack {
  id: number;
  side: Side;
  origin: StackOrigin;
  creatureId: string;
  tier: Tier;
  count: number;
  initialCount: number;
  damage: number;
  row: number; // 0..2, -1 = noch nicht aufgestellt
  line: Line;
  dice: number;
  dmg: number;
  hp: number;
  speed: number;
  abilities: Ability[];
  retaliatedRound: number;
  blessed: boolean;
  stoneskin: boolean;
}

export interface DiceRoll {
  actor: string;
  target: string;
  rolls: number[];
  threshold: number;
  hits: number;
  damage: number;
  kills: number;
  kind: 'attack' | 'retaliation' | 'tower';
}

export interface CombatResult {
  winner: Side | null; // null = Rundenlimit, Rückzug des Angreifers
  reason: 'elimination' | 'flee' | 'roundLimit';
  fled: Side | null;
}

export interface CombatState {
  rng: number;
  round: number;
  step: 'placement' | 'decision' | 'activation' | 'done';
  pendingSide: Side | null;
  sides: Record<Side, SideSetup>;
  siege: { wall: boolean } | null;
  stacks: CStack[];
  queue: number[];
  activeId: number | null;
  spellsCast: Record<Side, number>;
  killed: Record<Side, number>; // von dieser Seite verlorene Einheiten
  lastRolls: DiceRoll[];
  log: string[];
  result: CombatResult | null;
}

export interface Placement { stackId: number; row: number; line: Line }

export type CombatAction =
  | { type: 'place'; placements: Placement[] }
  | { type: 'flee' }
  | { type: 'cast'; spellId: string; targetId?: number; row?: number }
  | { type: 'passDecision' }
  | { type: 'attack'; targetId: number }
  | { type: 'heal'; targetId: number }
  | { type: 'moveStack'; row: number; line: Line }
  | { type: 'pass' };
