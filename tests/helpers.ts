import { createGame } from '../src/engine/setup';
import { applyAction } from '../src/engine/reducer';
import { hexKey } from '../src/engine/hex';
import type { Action, GameState, Hero, Hex, PlayerSetup, Stack, Terrain, TileContent } from '../src/engine/types';

const REALMS = ['kronland', 'wildhain', 'aschenturm', 'knochenfeste'];

export const setups = (n: number, realms = REALMS): PlayerSetup[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Spieler ${i + 1}`, realmId: realms[i], control: 'human' as const }));

/** Partie mit festem Seed; Spieler 0 ist aktiv und in der Heldenphase, wenn gewünscht. */
export function newGame(n = 2, realms = REALMS, seed = 7): GameState {
  const s = createGame(seed, setups(n, realms));
  s.order = Array.from({ length: n }, (_, i) => i);
  s.weekCardId = 'ruhige_woche'; // keine Wochenkarten-Effekte in Regeltests
  return s;
}
export const act = (s: GameState, ...actions: Action[]): GameState => actions.reduce(applyAction, s);
export const heroOf = (s: GameState, p: number): Hero => Object.values(s.heroes).find(h => h.owner === p) as Hero;
export const toHeroPhase = (s: GameState): GameState => act(s, { type: 'endCityPhase' });

/** Macht ein Feld kontrolliert: Terrain, Inhalt, aufgedeckt für die genannten Spieler. */
export function setTile(s: GameState, hex: Hex, opts: { terrain?: Terrain; content?: TileContent | null; revealedBy?: number[] }): void {
  const t = s.tiles[hexKey(hex)];
  if (opts.terrain) t.terrain = opts.terrain;
  if (opts.content !== undefined) t.content = opts.content;
  if (opts.revealedBy) t.revealedBy = opts.revealedBy;
}

/** Stellt einen Helden frei auf das Feld und setzt Bewegung und Armee. */
export function place(hero: Hero, pos: Hex, opts: { movement?: number; army?: Stack[] } = {}): void {
  hero.pos = { ...pos };
  if (opts.movement !== undefined) hero.movement = opts.movement;
  if (opts.army) hero.army = opts.army;
}

/** Leert alle Felder, damit Tests ungestört bleiben. */
export function clearBoard(s: GameState): void {
  for (const t of Object.values(s.tiles)) {
    t.content = null;
    t.terrain = 'plain';
  }
}
