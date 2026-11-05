// Bewegung, Erkundung und Feldinhalte (Regeln 2 und 3).
import { spellById, artifactById } from './content';
import { BALANCE } from '../config/balance';
import { RuleError } from './errors';
import { areAdjacent, hexDistance, hexKey, neighbors, parseKey, sameHex } from './hex';
import { addHint, addXp } from './hero';
import { cityAt, getHero, heroAt, log, terrainCost, tileAt } from './helpers';
import type { EncounterTarget, GameState, Hero, Hex, PlayerId, Terrain, Tile } from './types';

export const isRevealed = (t: Tile, p: PlayerId): boolean => t.revealedBy.includes(p);

/** Was erwartet den Helden auf dem Feld an feindlichem Widerstand? */
export function hostileAt(s: GameState, hero: Hero, tile: Tile): EncounterTarget | null {
  const city = cityAt(s, tile.hex);
  if (city && city.owner !== hero.owner) return { kind: 'city', hex: tile.hex, cityId: city.id };
  const enemy = heroAt(s, tile.hex).find(h => h.owner !== hero.owner);
  if (enemy) return { kind: 'hero', hex: tile.hex, heroId: enemy.id };
  if (tile.content?.kind === 'guardian') return { kind: 'guardian', hex: tile.hex };
  if (tile.content?.kind === 'heart' && tile.content.army) return { kind: 'heart', hex: tile.hex };
  return null;
}

/** ANNAHME: Auf einem Feld steht höchstens ein eigener Held, außer in eigenen Städten. */
export function blockedByOwnHero(s: GameState, hero: Hero, hex: Hex): boolean {
  if (cityAt(s, hex)?.owner === hero.owner) return false;
  return heroAt(s, hex).some(h => h.id !== hero.id && h.owner === hero.owner);
}

export interface PathResult {
  path: Hex[];
  costs: (number | null)[]; // null = verdeckt, Kosten unbekannt
  knownCost: number;
  affordableSteps: number;
  endsHidden: boolean;
  endsInEncounter: boolean;
}

/**
 * Regel 2: Pfadvorschau über aufgedeckte Felder; verdeckte Felder und Felder mit Widerstand
 * können nur das letzte Feld eines Pfades sein. Sieht nur, was der Spieler sieht.
 */
export function findPath(s: GameState, heroId: string, target: Hex): PathResult | null {
  const hero = getHero(s, heroId);
  if (sameHex(hero.pos, target)) return null;
  const targetKey = hexKey(target);
  if (!s.tiles[targetKey]) return null;
  return pathTo(s, hero, pathMap(s, hero), target);
}

export interface PathMap { dist: Map<string, number>; prev: Map<string, string> }

/** Kürzeste Wege vom Helden zu allen erreichbaren Feldern. Verdeckte und besetzte Felder sind Endpunkte. */
export function pathMap(s: GameState, hero: Hero): PathMap {
  const dist = new Map<string, number>([[hexKey(hero.pos), 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  const open: string[] = [hexKey(hero.pos)];
  while (open.length > 0) {
    open.sort((a, b) => (dist.get(a) as number) - (dist.get(b) as number));
    const current = open.shift() as string;
    done.add(current);
    const currentTile = s.tiles[current];
    const start = current === hexKey(hero.pos);
    if (!start && (!isRevealed(currentTile, hero.owner) || hostileAt(s, hero, currentTile))) continue;
    for (const n of neighbors(parseKey(current))) {
      const key = hexKey(n);
      const tile = s.tiles[key];
      if (!tile || done.has(key) || blockedByOwnHero(s, hero, n)) continue;
      // Verdeckte Felder zählen in der Planung mit 1.
      const step = isRevealed(tile, hero.owner) ? terrainCost(s, hero, tile.terrain as Terrain) : 1;
      const d = (dist.get(current) as number) + step;
      if (d < (dist.get(key) ?? Infinity)) {
        dist.set(key, d);
        prev.set(key, current);
        if (!open.includes(key)) open.push(key);
      }
    }
  }
  return { dist, prev };
}

export function pathTo(s: GameState, hero: Hero, map: PathMap, target: Hex): PathResult | null {
  const { dist, prev } = map;
  const targetKey = hexKey(target);
  if (!dist.has(targetKey) || sameHex(hero.pos, target)) return null;
  const keys: string[] = [];
  for (let k: string | undefined = targetKey; k && k !== hexKey(hero.pos); k = prev.get(k)) keys.unshift(k);
  const path = keys.map(parseKey);
  const costs = keys.map(k => {
    const t = s.tiles[k];
    return isRevealed(t, hero.owner) ? terrainCost(s, hero, t.terrain as Terrain) : null;
  });
  let budget = hero.movement;
  let affordableSteps = 0;
  for (const c of costs) {
    const need = c ?? 1;
    if (need > budget) break;
    budget -= need;
    affordableSteps += 1;
  }
  const lastTile = s.tiles[targetKey];
  return {
    path, costs, knownCost: costs.reduce<number>((sum, c) => sum + (c ?? 0), 0), affordableSteps,
    endsHidden: !isRevealed(lastTile, hero.owner),
    endsInEncounter: isRevealed(lastTile, hero.owner) && hostileAt(s, hero, lastTile) !== null,
  };
}

/** Wendet die Wirkung eines betretenen Feldes an. */
export function enterTile(s: GameState, hero: Hero, tile: Tile): void {
  hero.pos = { ...tile.hex };
  const c = tile.content;
  if (!c) return;
  const player = s.players[hero.owner];
  switch (c.kind) {
    case 'mine':
      if (c.owner !== hero.owner) {
        c.owner = hero.owner;
        log(s, `${player.name} beflaggt eine Mine.`);
      }
      break;
    case 'dwelling':
      c.owner = hero.owner;
      break;
    case 'treasure': {
      const r = c.reward;
      if (r.type === 'gold') {
        player.resources.gold += r.value;
        log(s, `${player.name} findet einen Schatz: ${r.value} Gold.`, [hero.owner]);
      } else if (r.type === 'xp') {
        log(s, `${player.name} findet einen Schatz: ${r.value} Erfahrung.`, [hero.owner]);
        addXp(s, hero, r.value);
      } else if (hero.artifacts.length < BALANCE.maxArtifacts) {
        hero.artifacts.push(r.artifactId);
        log(s, `${player.name} findet ein Artefakt: ${artifactById[r.artifactId].name}.`, [hero.owner]);
      } else {
        player.resources.gold += BALANCE.map.treasure.artifactFallbackGold;
        log(s, `Artefaktplätze voll: ${player.name} erhält ${BALANCE.map.treasure.artifactFallbackGold} Gold.`, [hero.owner]);
      }
      tile.content = null;
      break;
    }
    case 'obelisk':
      if (!c.usedBy.includes(hero.owner)) {
        c.usedBy.push(hero.owner);
        addHint(s, hero.owner);
      }
      break;
    case 'shrine':
      if (!c.usedBy.includes(hero.owner)) {
        c.usedBy.push(hero.owner);
        if (!hero.spells.includes(c.spellId)) {
          hero.spells.push(c.spellId);
          log(s, `${player.name} lernt am Schrein: ${spellById[c.spellId].name}.`, [hero.owner]);
        }
      }
      break;
    default:
      break;
  }
}

function checkMover(s: GameState, heroId: string): Hero {
  if (s.phase !== 'hero') throw new RuleError('Helden ziehen nur in der Heldenphase.');
  const hero = getHero(s, heroId);
  if (hero.owner !== s.order[s.activeIndex]) throw new RuleError('Dieser Held gehört nicht dem aktiven Spieler.');
  return hero;
}

/** Regeln 2/3: Bewegung Feld für Feld. Verdeckte Felder werden beim Betreten aufgedeckt. */
export function applyMove(s: GameState, heroId: string, path: Hex[]): void {
  const hero = checkMover(s, heroId);
  if (path.length === 0) throw new RuleError('Der Pfad ist leer.');
  let from = hero.pos;
  for (let i = 0; i < path.length; i++) {
    const hex = path[i];
    if (!areAdjacent(from, hex)) throw new RuleError('Der Pfad muss aus Nachbarfeldern bestehen.');
    const tile = tileAt(s, hex);
    if (!tile) throw new RuleError('Dieses Feld gibt es nicht.');
    if (blockedByOwnHero(s, hero, hex)) throw new RuleError('Dort steht bereits ein eigener Held.');
    const revealed = isRevealed(tile, hero.owner);
    const cost = terrainCost(s, hero, tile.terrain as Terrain);
    if (!revealed) {
      // ANNAHME (Vorschlag 2): Verdeckt reicht 1 Bewegung; kostet das Feld mehr, verfällt der Rest.
      if (hero.movement < 1) throw new RuleError('Keine Bewegungspunkte mehr.');
      hero.movement -= Math.min(cost, hero.movement);
      tile.revealedBy.push(hero.owner);
    } else if (hero.movement < cost) {
      if (i === 0) throw new RuleError('Nicht genug Bewegungspunkte.');
      return;
    }
    const hostile = hostileAt(s, hero, tile);
    if (hostile) {
      if (i !== path.length - 1) throw new RuleError('Der Pfad führt durch ein besetztes Feld.');
      // ANNAHME: Vor dem Kampf darf der Held ausweichen. Bekanntes Feld: Bewegung fällig erst beim Kampf. Verdecktes Feld: bereits bezahlt.
      s.encounter = { heroId, target: hostile, from: { ...hero.pos }, moveCost: revealed ? cost : 0 };
      return;
    }
    if (revealed) hero.movement -= cost;
    enterTile(s, hero, tile);
    from = hex;
    if (!revealed) return; // ANNAHME: Nach dem Aufdecken endet der Pfad; der Spieler entscheidet neu.
  }
}

/** Regel 3: Graben nach dem Herzstein. ANNAHME: Kostet alle restliche Bewegung. */
export function applyDig(s: GameState, heroId: string): void {
  const hero = checkMover(s, heroId);
  if (hexDistance(hero.pos, { q: 0, r: 0 }) !== 1) throw new RuleError('Gegraben wird nur auf den 6 Feldern ums Zentrum.');
  if (hero.movement < 1) throw new RuleError('Zum Graben braucht der Held Bewegung.');
  const tile = tileAt(s, hero.pos) as Tile;
  if (tile.dugBy.includes(hero.owner)) throw new RuleError('Hier hast du bereits gegraben.');
  tile.dugBy.push(hero.owner);
  hero.movement = 0;
  const player = s.players[hero.owner];
  if (!s.heartstoneFound && s.heartstone === hexKey(hero.pos)) {
    s.heartstoneFound = true;
    player.fame.heartstone += BALANCE.fame.heartstone;
    log(s, `${player.name} birgt den Herzstein! +${BALANCE.fame.heartstone} Ruhm.`);
  } else {
    if (!player.hints.includes(hexKey(hero.pos))) player.hints.push(hexKey(hero.pos));
    log(s, `${player.name} gräbt vergeblich.`, [hero.owner]);
  }
}
