// Spieler-Sicht: Nebel des Krieges. UI und KI lesen nur diese Sicht.
import { sameHex } from './hex';
import type { GameState, PlayerId } from './types';

export function playerView(s: GameState, viewer: PlayerId): GameState {
  const v = structuredClone(s);
  v.rng = 0;
  v.weekDeck = [];
  v.heartstone = null;
  const known = (hex: { q: number; r: number }) => {
    const t = Object.values(v.tiles).find(x => sameHex(x.hex, hex));
    return !!t && t.revealedBy.includes(viewer);
  };
  for (const tile of Object.values(v.tiles)) {
    tile.dugBy = tile.dugBy.filter(p => p === viewer);
    tile.revealedBy = tile.revealedBy.filter(p => p === viewer);
    if (!tile.revealedBy.includes(viewer)) {
      tile.terrain = 'unknown';
      tile.content = null;
    }
  }
  for (const id of Object.keys(v.heroes)) {
    const h = v.heroes[id];
    if (h.owner !== viewer && !known(h.pos)) delete v.heroes[id];
  }
  for (const id of Object.keys(v.cities)) {
    const c = v.cities[id];
    if (c.owner !== viewer && !known(c.pos)) delete v.cities[id];
  }
  for (const p of v.players) {
    if (p.id !== viewer) {
      p.resources = { gold: 0, material: 0, crystal: 0 };
      p.hints = [];
    }
  }
  v.log = v.log.filter(e => e.players === 'all' || e.players.includes(viewer));
  return v;
}
