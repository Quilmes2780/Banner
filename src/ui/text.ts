// Gemeinsame Anzeigetexte.
import { artifactById, creatureById, skillById, spellById } from '../engine/content';
import type { FameSource, Reward, ResourceCost, Stack, TileContent, VisibleTerrain } from '../engine/types';

export const ROMAN = ['', 'I', 'II', 'III', 'IV'];
export const ABILITY_NAMES: Record<string, string> = { ranged: 'Fernkampf', flying: 'Fliegen', heal: 'Heilen', fast: 'Schnell' };
export const TERRAIN_NAMES: Record<VisibleTerrain, string> = {
  plain: 'Ebene', forest: 'Wald', swamp: 'Sumpf', mountain: 'Gebirge', unknown: 'Verdeckt',
};
export const FAME_NAMES: Record<FameSource, string> = {
  guardian: 'Wächter', heroWin: 'Heldensiege', heartstone: 'Herzstein', heart: 'Herz', city: 'Stadt',
  capturedCapital: 'Eroberte Hauptstadt', capitol: 'Kapitol', mine: 'Minen', heroLevel: 'Heldenstufen',
  artifact: 'Artefakte', armyLevels: 'Einheiten',
};
export const FAME_ORDER: FameSource[] = ['guardian', 'heroWin', 'heartstone', 'heart', 'city', 'capturedCapital', 'capitol', 'mine', 'heroLevel', 'artifact', 'armyLevels'];

export const costText = (c: ResourceCost): string => {
  const parts: string[] = [];
  if (c.gold) parts.push(`${c.gold} G`);
  if (c.material) parts.push(`${c.material} B`);
  if (c.crystal) parts.push(`${c.crystal} K`);
  return parts.join(', ') || 'kostenlos';
};

export const armyText = (army: Stack[]): string =>
  army.length === 0 ? 'keine Armee' : army.map(s => `${s.count}× ${creatureById[s.creatureId].name}`).join(', ');

const rewardText = (r: Reward): string => {
  if (r.type === 'gold') return `${r.value} Gold`;
  if (r.type === 'xp') return `${r.value} Erfahrung`;
  return `Artefakt: ${artifactById[r.artifactId].name}`;
};

export function contentText(c: TileContent | null, owners: (id: number) => string): string {
  if (!c) return '';
  switch (c.kind) {
    case 'mine': return `${c.resource === 'gold' ? 'Goldmine' : c.resource === 'material' ? 'Baustoffmine' : 'Kristallmine'}${c.owner !== null ? ` von ${owners(c.owner)}` : ', frei'}`;
    case 'treasure': return `Schatz (${rewardText(c.reward)})`;
    case 'guardian': return `Wächter Stufe ${ROMAN[c.tier]}: ${c.name} (${armyText(c.army)})`;
    case 'dwelling': return `Umland-Behausung Stufe ${ROMAN[c.tier]}, Vorrat ${c.stock}`;
    case 'obelisk': return 'Obelisk: Hinweis auf den Herzstein';
    case 'shrine': return `Schrein: ${spellById[c.spellId].name}`;
    case 'heart': return c.army ? `Herz, bewacht von ${c.name} (${armyText(c.army)})` : 'Herz, unbewacht';
  }
}

export const skillName = (id: string) => skillById[id].name;
