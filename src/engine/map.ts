// Kartenerzeugung (Regeln 2 und 3).
import { BALANCE } from '../config/balance';
import { ARTIFACTS, GUARDIANS, SPELLS } from './content';
import { corner, hexDistance, hexKey, hexesInRadius, neighbors } from './hex';
import { RngHolder, pickWeighted, randInt, shuffle } from './rng';
import type { GuardianTier, Hex, Terrain, Tile, TileContent, Reward } from './types';

const M = BALANCE.map;
// ANNAHME: Heimatfelder auf den Ecken des Hex-Bretts, je Spieler gleich viele Nachbarn in Abstand R und 2R.
const HOME_CORNERS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] };

export function homePositions(players: number, radius: number): Hex[] {
  return HOME_CORNERS[players].map(i => corner(radius, i));
}

function pickGuardian(h: RngHolder, tier: GuardianTier) {
  const list = GUARDIANS.filter(g => g.tier === tier);
  return list[randInt(h, list.length)];
}

function makeReward(h: RngHolder, tier: GuardianTier, artifacts: string[]): Reward {
  const kind = pickWeighted(h, M.treasure.weights[tier]);
  if (kind === 'artifact' && artifacts.length > 0) return { type: 'artifact', artifactId: artifacts.pop() as string };
  if (kind === 'xp') return { type: 'xp', value: M.treasure.xp[tier] };
  return { type: 'gold', value: M.treasure.gold[tier] };
}

export interface GeneratedMap { tiles: Record<string, Tile>; homes: Hex[]; heartstone: string }

export function generateMap(h: RngHolder, players: number): GeneratedMap {
  const radius = M.radiusByPlayers[players];
  const center: Hex = { q: 0, r: 0 };
  const homes = homePositions(players, radius);
  const homeKeys = new Set(homes.map(hexKey));
  const tiles: Record<string, Tile> = {};
  const lv1Spells = SPELLS.filter(s => s.level === 1);
  const artifacts = shuffle(h, ARTIFACTS.map(a => a.id));

  for (const hex of hexesInRadius(radius)) {
    const dist = hexDistance(hex, center);
    const isSpecial = dist === 0 || homeKeys.has(hexKey(hex));
    tiles[hexKey(hex)] = {
      hex,
      terrain: isSpecial ? 'plain' : pickWeighted<Terrain>(h, M.terrainWeights),
      ringTier: dist === 0 ? 0 : M.ringTierByRadius[radius][dist],
      content: null,
      revealedBy: [],
      dugBy: [],
    };
  }

  const makeContent = (kind: string, tier: GuardianTier): TileContent => {
    switch (kind) {
      case 'mine': return { kind: 'mine', resource: pickWeighted(h, M.mineResourceWeights[tier]), owner: null };
      case 'treasure': return { kind: 'treasure', reward: makeReward(h, tier, artifacts) };
      case 'guardian': {
        const g = pickGuardian(h, tier);
        return { kind: 'guardian', tier, name: g.name, army: g.army.map(s => ({ ...s })) };
      }
      case 'dwelling': {
        const t = M.outlandDwellingTier[tier];
        return { kind: 'dwelling', tier: t, stock: BALANCE.growth[t], owner: null };
      }
      case 'obelisk': return { kind: 'obelisk', usedBy: [] };
      default: return { kind: 'shrine', spellId: lv1Spells[randInt(h, lv1Spells.length)].id, usedBy: [] };
    }
  };

  // Herz in der Mitte mit Stufe-III-Wächter
  const heartGuard = pickGuardian(h, 3);
  tiles[hexKey(center)].content = { kind: 'heart', name: heartGuard.name, army: heartGuard.army.map(s => ({ ...s })) };

  // Jede Heimat hat die festen Startminen auf Nachbarfeldern.
  const reserved = new Set<string>();
  for (const home of homes) {
    const options = shuffle(h, neighbors(home).filter(n => tiles[hexKey(n)] && !homeKeys.has(hexKey(n))));
    M.homeMines.forEach((resource, i) => {
      const key = hexKey(options[i]);
      tiles[key].content = { kind: 'mine', resource, owner: null };
      reserved.add(key);
    });
  }

  // Inhalte ringweise zuteilen, damit jede Karte ähnlich dicht ist.
  for (const tier of [1, 2, 3] as GuardianTier[]) {
    const pool = shuffle(h, Object.values(tiles).filter(t =>
      t.ringTier === tier && !homeKeys.has(hexKey(t.hex)) && !reserved.has(hexKey(t.hex))));
    for (const [kind, share] of Object.entries(M.contentShare[tier])) {
      const count = Math.round(pool.length * share);
      for (let i = 0; i < count; i++) {
        const tile = pool.find(t => !t.content);
        if (tile) tile.content = makeContent(kind, tier);
      }
    }
  }

  // Mindestzahlen für Obelisken und Schreine sichern.
  const ensure = (kind: 'obelisk' | 'shrine', min: number) => {
    let have = Object.values(tiles).filter(t => t.content?.kind === kind).length;
    const empties = shuffle(h, Object.values(tiles).filter(t => !t.content && t.ringTier !== 0 && !homeKeys.has(hexKey(t.hex))));
    while (have < min && empties.length > 0) {
      const tile = empties.pop() as Tile;
      tile.content = makeContent(kind, tile.ringTier as GuardianTier);
      have += 1;
    }
  };
  ensure('obelisk', M.minObelisks);
  ensure('shrine', M.minShrines);

  const candidates = neighbors(center);
  return { tiles, homes, heartstone: hexKey(candidates[randInt(h, candidates.length)]) };
}
