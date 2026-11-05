// Datenmodell der Spiel-Engine. Keine UI-Abhängigkeiten.
import type { CombatAction, CombatState } from './combat/types';

export type PlayerId = number;
export type Tier = 1 | 2 | 3 | 4;
export type GuardianTier = 1 | 2 | 3;
export type ResourceKey = 'gold' | 'material' | 'crystal';
export type Resources = Record<ResourceKey, number>;
export type ResourceCost = Partial<Resources>;
export type Terrain = 'plain' | 'forest' | 'swamp' | 'mountain';
export type VisibleTerrain = Terrain | 'unknown';
export type Ability = 'ranged' | 'flying' | 'heal' | 'fast';
export type BuildingId =
  | 'townhall' | 'dwelling1' | 'dwelling2' | 'dwelling3' | 'dwelling4'
  | 'market' | 'guild' | 'guildUpgrade' | 'wall' | 'capitol';
export type HeroStat = 'attack' | 'defense' | 'magic';
export type Control = 'human' | 'ai-easy' | 'ai-normal' | 'ai-hard';

export interface Hex { q: number; r: number }
export interface Stack { creatureId: string; count: number }

// ---- Content ----
export type Effect =
  | { type: 'stat'; stat: HeroStat; value: number }
  | { type: 'movement'; value: number }
  | { type: 'terrainCost'; terrain: Terrain; cost: number }
  | { type: 'income'; resource: ResourceKey; value: number }
  | { type: 'tierDice'; tier: Tier; value: number }
  | { type: 'rangedNoPenalty' }
  | { type: 'victoryGold'; value: number }
  | { type: 'extraSpell'; value: number }
  | { type: 'xpBonus'; value: number }
  | { type: 'wallDefense'; value: number }
  | { type: 'skeletonRaise' };

export type WeekEffect =
  | { type: 'none' }
  | { type: 'growth'; tier: Tier; value: number }
  | { type: 'income'; resource: ResourceKey; value: number }
  | { type: 'movement'; value: number }
  | { type: 'recruitDiscount'; tier: Tier; gold: number }
  | { type: 'buildDiscount'; gold: number }
  | { type: 'mineBonus'; resource: ResourceKey; value: number }
  | { type: 'terrainCost'; terrain: Terrain; cost: number }
  | { type: 'tempo'; tier: Tier; value: number };

export interface RealmDef { id: string; name: string; motto: string; ability: string; color: string; effects: Effect[]; creatures: string[] }
export interface CreatureDef { id: string; name: string; realm: string; tier: Tier; abilities: Ability[]; icon: string }
export interface BuildingDef { id: BuildingId; name: string; description: string; requires?: BuildingId; fame?: boolean }
export interface HeroDef {
  id: string; name: string; realm: string;
  attack: number; defense: number; magic: number;
  specialty: { name: string; description: string; effects: Effect[] };
  startSpell?: string;
}
export interface SpellDef {
  id: string; name: string; level: 1 | 2; description: string;
  kind: 'lightning' | 'bless' | 'haste' | 'stoneskin' | 'fireball' | 'portal';
}
export interface SkillDef { id: string; name: string; description: string; effects: Effect[] }
export interface ArtifactDef { id: string; name: string; description: string; effects: Effect[] }
export interface GuardianDef { id: string; name: string; tier: GuardianTier; army: Stack[] }
export interface WeekCardDef { id: string; name: string; description: string; effects: WeekEffect[] }

// ---- Karte ----
export type Reward =
  | { type: 'gold'; value: number }
  | { type: 'xp'; value: number }
  | { type: 'artifact'; artifactId: string };

export type TileContent =
  | { kind: 'mine'; resource: ResourceKey; owner: PlayerId | null }
  | { kind: 'treasure'; reward: Reward }
  | { kind: 'guardian'; tier: GuardianTier; name: string; army: Stack[] }
  | { kind: 'dwelling'; tier: Tier; stock: number; owner: PlayerId | null }
  | { kind: 'obelisk'; usedBy: PlayerId[] }
  | { kind: 'shrine'; spellId: string; usedBy: PlayerId[] }
  | { kind: 'heart'; name: string; army: Stack[] | null };

export interface Tile {
  hex: Hex;
  terrain: VisibleTerrain;
  ringTier: 0 | GuardianTier;
  content: TileContent | null;
  revealedBy: PlayerId[];
  dugBy: PlayerId[];
}

// ---- Spieler ----
export type FameSource =
  | 'guardian' | 'heroWin' | 'heartstone' | 'heart'
  | 'city' | 'capturedCapital' | 'capitol' | 'mine' | 'heroLevel' | 'artifact' | 'armyLevels';
export type FameLedger = Record<'guardian' | 'heroWin' | 'heartstone' | 'heart', number>;

export interface Player {
  id: PlayerId;
  name: string;
  realmId: string;
  control: Control;
  resources: Resources;
  fame: FameLedger;
  hints: string[]; // ausgeschlossene Herzstein-Felder (privat)
  eliminated: boolean;
}

export interface Hero {
  id: string;
  defId: string;
  owner: PlayerId;
  pos: Hex;
  level: number;
  xp: number;
  attack: number;
  defense: number;
  magic: number;
  movement: number;
  army: Stack[];
  artifacts: string[];
  spells: string[];
  skills: string[];
  portalUsedWeek: number;
  levelUp: string[] | null; // zur Wahl stehende Fertigkeiten
}

export interface City {
  id: string;
  owner: PlayerId;
  originalOwner: PlayerId;
  realmId: string;
  pos: Hex;
  buildings: BuildingId[];
  builtThisWeek: boolean;
  stock: Record<Tier, number>;
  garrison: Stack[];
  guildUsedWeek: number;
}

export type EncounterTarget =
  | { kind: 'guardian' | 'heart'; hex: Hex }
  | { kind: 'hero'; hex: Hex; heroId: string }
  | { kind: 'city'; hex: Hex; cityId: string };

export interface Encounter {
  heroId: string;
  target: EncounterTarget;
  from: Hex;
  moveCost: number; // wird beim Kampfbeginn fällig; 0 wenn schon bezahlt
}

export interface GameCombat {
  state: CombatState;
  encounter: Encounter;
}

export interface LogEntry { week: number; text: string; players: PlayerId[] | 'all' }

export interface GameState {
  seed: number;
  rng: number;
  actionCount: number;
  week: number;
  order: PlayerId[];
  activeIndex: number;
  phase: 'city' | 'hero' | 'ended';
  radius: number;
  weekCardId: string;
  weekDeck: string[];
  tiles: Record<string, Tile>;
  heartstone: string | null;
  heartstoneFound: boolean;
  players: Player[];
  heroes: Record<string, Hero>;
  cities: Record<string, City>;
  encounter: Encounter | null;
  combat: GameCombat | null;
  guildOffer: { cityId: string; heroId: string; options: string[] } | null;
  log: LogEntry[];
  winners: PlayerId[] | null;
  endReason: 'weeks' | 'conquest' | null;
}

export interface PlayerSetup { name: string; realmId: string; control: Control }

export type Holder = { type: 'hero'; id: string } | { type: 'city'; id: string };

export type Action =
  | { type: 'build'; cityId: string; building: BuildingId }
  | { type: 'recruit'; cityId: string; tier: Tier; count: number; to: Holder }
  | { type: 'recruitDwelling'; heroId: string; count: number }
  | { type: 'trade'; give: ResourceKey; get: ResourceKey; cityId: string }
  | { type: 'hireHero'; cityId: string; defId: string }
  | { type: 'guildDraw'; cityId: string; heroId: string }
  | { type: 'guildKeep'; spellId: string }
  | { type: 'endCityPhase' }
  | { type: 'move'; heroId: string; path: Hex[] }
  | { type: 'startEncounter' }
  | { type: 'declineEncounter' }
  | { type: 'dig'; heroId: string }
  | { type: 'transfer'; from: Holder; to: Holder; creatureId: string; count: number }
  | { type: 'chooseLevelUp'; heroId: string; stat: HeroStat; skillId: string }
  | { type: 'portal'; heroId: string; cityId: string }
  | { type: 'endHeroPhase' }
  | { type: 'combat'; action: CombatAction }
  | { type: 'finishCombat' };
