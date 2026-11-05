// Alle Spielwerte an einer Stelle. Regelnummern beziehen sich auf die verbindlichen Regeln.
import type { BuildingId, ResourceCost, Tier } from '../engine/types';

export const BALANCE = {
  // Regel 1
  weeks: 10,
  minPlayers: 2,
  maxPlayers: 4,
  income: {
    townhallGold: 4,
    capitolGold: 8, // ANNAHME: Das Kapitol ersetzt das Rathaus-Einkommen (8 statt 4+8).
    mine: { gold: 2, material: 2, crystal: 1 },
  },
  growth: { 1: 4, 2: 3, 3: 2, 4: 1 } as Record<Tier, number>,
  stockCapFactor: 2,

  // Regel 2
  movementPerWeek: 4,
  terrainCost: { plain: 1, forest: 2, swamp: 2, mountain: 2 },
  map: {
    radiusByPlayers: { 2: 4, 3: 4, 4: 5 } as Record<number, number>, // ANNAHME
    // ANNAHME: Abstand zur Mitte -> Stufe des Rings
    ringTierByRadius: {
      4: { 1: 3, 2: 2, 3: 2, 4: 1 },
      5: { 1: 3, 2: 2, 3: 2, 4: 1, 5: 1 },
    } as Record<number, Record<number, 1 | 2 | 3>>,
    terrainWeights: { plain: 50, forest: 20, swamp: 15, mountain: 15 },
    // ANNAHME: Anteil der Feldinhalte je Ringstufe; der Rest bleibt leer.
    contentShare: {
      1: { mine: 0.2, treasure: 0.17, guardian: 0.17, dwelling: 0.06, obelisk: 0.05, shrine: 0.05 },
      2: { mine: 0.17, treasure: 0.17, guardian: 0.25, dwelling: 0.08, obelisk: 0.08, shrine: 0.07 },
      3: { mine: 0.0, treasure: 0.17, guardian: 0.66, dwelling: 0, obelisk: 0, shrine: 0.17 },
    } as Record<1 | 2 | 3, Record<'mine' | 'treasure' | 'guardian' | 'dwelling' | 'obelisk' | 'shrine', number>>,
    mineResourceWeights: {
      1: { gold: 55, material: 35, crystal: 10 },
      2: { gold: 40, material: 25, crystal: 35 },
      3: { gold: 40, material: 20, crystal: 40 },
    } as Record<1 | 2 | 3, Record<'gold' | 'material' | 'crystal', number>>,
    minObelisks: 3, // ANNAHME
    minShrines: 2, // ANNAHME
    // ANNAHME: Dwelling-Stufe im Umland je Ringstufe
    outlandDwellingTier: { 1: 1, 2: 2, 3: 3 } as Record<1 | 2 | 3, Tier>,
    // ANNAHME: Jede Heimat hat eine Gold- und eine Baustoffmine als Nachbarfeld (Fairness).
    homeMines: ['gold', 'material'] as const,
    treasure: {
      // ANNAHME: Schatzwerte je Ringstufe und Gewichtung Gold/Erfahrung/Artefakt
      gold: { 1: 4, 2: 6, 3: 10 } as Record<1 | 2 | 3, number>,
      xp: { 1: 2, 2: 3, 3: 5 } as Record<1 | 2 | 3, number>,
      weights: {
        1: { gold: 55, xp: 30, artifact: 15 },
        2: { gold: 40, xp: 30, artifact: 30 },
        3: { gold: 30, xp: 20, artifact: 50 },
      } as Record<1 | 2 | 3, { gold: number; xp: number; artifact: number }>,
      artifactFallbackGold: 3, // ANNAHME: Voller Artefaktplatz -> Gold statt Artefakt
    },
  },

  // Regel 3
  heart: { hints: 2, fame: 2 },

  // Regel 4
  startResources: { gold: 10, material: 4, crystal: 1 },
  startBuildings: ['townhall', 'dwelling1', 'dwelling2'] as BuildingId[],
  buildings: {
    townhall: {},
    dwelling1: {},
    dwelling2: {},
    dwelling3: { gold: 8, material: 4 },
    dwelling4: { gold: 15, material: 6, crystal: 2 },
    market: { gold: 6, material: 2 },
    guild: { gold: 6, material: 3, crystal: 1 },
    guildUpgrade: { crystal: 2 },
    wall: { gold: 8, material: 6 },
    capitol: { gold: 20, material: 4 },
  } as Record<BuildingId, ResourceCost>,
  marketRate: 3,

  // Regel 5
  tiers: {
    1: { dice: 1, damage: 1, hp: 1, speed: 3, cost: { gold: 2 } },
    2: { dice: 1, damage: 1, hp: 2, speed: 4, cost: { gold: 4 } },
    3: { dice: 1, damage: 2, hp: 3, speed: 5, cost: { gold: 7 } },
    4: { dice: 2, damage: 3, hp: 6, speed: 4, cost: { gold: 12, crystal: 1 } },
  } as Record<Tier, { dice: number; damage: number; hp: number; speed: number; cost: ResourceCost }>,
  maxStacks: 3,
  maxPerStack: { 1: 6, 2: 6, 3: 6, 4: 2 } as Record<Tier, number>,
  // ANNAHME: Startarmee des ersten Helden (Vorschlag 4 im Plan, freigegeben)
  startArmy: [
    { tier: 1 as Tier, count: 4 },
    { tier: 2 as Tier, count: 2 },
  ],
  startStockWeeks: 1, // ANNAHME: Behausungen starten mit einem Wochenwachstum

  // Regel 6
  maxArtifacts: 3,
  maxHeroes: 2, // ANNAHME
  secondHeroCost: 10,
  xp: { guardianPerTier: 2, heroBase: 3 },
  levelThresholds: [4, 9, 15, 22],
  skillChoices: 2,

  // Regel 7
  combat: {
    rows: 3,
    maxRounds: 3,
    maxDice: 8,
    baseHit: 4,
    minHit: 2,
    maxHit: 6,
    rangedPenalty: 1,
    spellsPerCombat: 1,
    wallDefense: 1,
    towerDice: 2,
    towerDamage: 1, // ANNAHME
    towerHit: 4, // ANNAHME: Der Turm trifft ohne Heldenbonus bei 4+
    healPerUnit: 1, // ANNAHME: Heilen stellt je Heiler 1 LP wieder her
    // ANNAHME: Wächter haben feste Werte je Stufe (Vorschlag 5 im Plan, freigegeben)
    guardianStats: { 1: 0, 2: 1, 3: 2 } as Record<1 | 2 | 3, number>,
  },

  // Regel 8
  spells: {
    lightning: { base: 2, perMagic: 1 }, // ANNAHME
    fireball: { base: 1, perMagic: 1 }, // ANNAHME: trifft alle Gegner einer Reihe
    bless: { hitBonus: 1 }, // ANNAHME: Trefferschwelle des Stapels -1
    haste: { speed: 2 }, // ANNAHME
    stoneskin: { hitMalus: 1 }, // ANNAHME: Gegner treffen den Stapel 1 schlechter
    guildDraw: 2,
  },

  // Regel 5: Knochenfeste
  skeletonEvery: 3,

  // Regel 9
  fame: {
    guardian: { 1: 1, 2: 2, 3: 3 } as Record<1 | 2 | 3, number>,
    heroWin: 3,
    heartstone: 6,
    heart: 2,
    homeCity: 3,
    capturedCapital: 5,
    capitol: 3,
    mine: 1,
    heroLevel: 1,
    artifact: 1,
    armyLevelsPerFame: 10,
  },

  // KI
  ai: {
    // idleChance: Anteil verschenkter Heldenzüge; lossWeight: Gewicht erwarteter Verluste.
    easy: {
      sims: 40, noise: 1.2, minWin: 0.5, lossWeight: 0, idleChance: 0.25, build: 0.5, saveCapitol: false, lookahead: false,
      hireUntilWeek: 0, useGuild: false, mineScale: 1, exploreScale: 1, guardianScale: 1, reinforceScale: 0.6, enemyScale: 0.5,
    },
    normal: {
      sims: 200, noise: 0.15, minWin: 0.6, lossWeight: 0.55, idleChance: 0, build: 1, saveCapitol: true, lookahead: false,
      hireUntilWeek: 5, useGuild: true, mineScale: 1, exploreScale: 1, guardianScale: 1, reinforceScale: 1, enemyScale: 1,
    },
    hard: {
      // In Duellserien ermittelt: mehr erkunden, seltener heimkehren, nicht aufs Kapitol sparen.
      sims: 200, noise: 0.03, minWin: 0.65, lossWeight: 0.55, idleChance: 0, build: 1, saveCapitol: false, lookahead: true,
      hireUntilWeek: 5, useGuild: true, mineScale: 1, exploreScale: 2, guardianScale: 1, reinforceScale: 0.6, enemyScale: 1,
    },
    previewSims: 200,
    value: {
      mine: { gold: 7, material: 4, crystal: 6 },
      treasure: 5,
      guardianPerTier: 3.5,
      dwelling: 3,
      obelisk: 4,
      shrine: 4,
      explore: 2.2,
      heart: 11,
      dig: 7,
      enemyCity: 16,
      enemyHero: 7,
      reinforce: 6,
    },
    fleeBelowPowerRatio: 0.2,
    rangedTargetBonus: 1.5,
  },
};
