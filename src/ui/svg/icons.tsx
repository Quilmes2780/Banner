// Eigene, schlichte Grafik: Kreatur-Icons, Wappen, Ressourcen. Alles geometrische SVG-Formen.
import type { ReactElement } from 'react';
import { realmById } from '../../engine/content';
import type { ResourceKey } from '../../engine/types';

const CREATURE_SHAPES: Record<string, ReactElement> = {
  shield: <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />,
  bow: <><path d="M7 3c8 2 12 8 12 16" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M7 3l12 16" stroke="currentColor" strokeWidth="1" /><path d="M5 19L16 8l1 3 3-1-1-3-3 1z" /></>,
  wing: <path d="M3 18c1-7 6-12 18-14-2 3-3 5-6 6 2 0 3 0 4-1-2 3-4 5-7 5 1 1 2 1 3 1-3 3-7 3-12 3z" />,
  lance: <path d="M20 3l1 1-11 13 2 2-3 2-1-2-3 3-2-2 3-3-2-1 2-3 2 2z" />,
  thorn: <path d="M12 2l2 7 6-3-4 6 6 3-7 1 1 6-4-5-4 5 1-6-7-1 6-3-4-6 6 3z" />,
  leaf: <path d="M4 20C3 9 11 3 21 3c0 10-6 18-14 16l-3 3zM8 16c3-4 6-7 9-9-4 1-7 4-9 9z" fillRule="evenodd" />,
  spark: <path d="M13 2L5 14h6l-1 8 9-13h-6z" />,
  eye: <path d="M2 12c4-6 7-8 10-8s6 2 10 8c-4 6-7 8-10 8s-6-2-10-8zm10 4a4 4 0 100-8 4 4 0 000 8z" fillRule="evenodd" />,
  flame: <path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-3 1-6 1-10z" />,
  skull: <path d="M12 3a8 8 0 00-8 8c0 3 1 5 3 6v3h10v-3c2-1 3-3 3-6a8 8 0 00-8-8zM9 14a2 2 0 110-4 2 2 0 010 4zm6 0a2 2 0 110-4 2 2 0 010 4z" fillRule="evenodd" />,
  crown: <path d="M3 7l5 5 4-8 4 8 5-5-2 12H5z" />,
  blade: <path d="M18 2l4 0 0 4L10 18l3 2-2 2-3-3-3 3-2-2 3-3-3-3 2-2 3 3z" />,
  fang: <path d="M3 4h18l-3 7-3-3-3 12-3-12-3 3z" />,
};

export function CreatureIcon({ icon, size = 28 }: { icon: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      {CREATURE_SHAPES[icon] ?? CREATURE_SHAPES.shield}
    </svg>
  );
}

const CREST_SYMBOLS: Record<string, ReactElement> = {
  kronland: <path d="M9 21l3.5 4 3.5-6 3.5 6 3.5-4-1.5 9h-11z" fill="#f4ecd8" />,
  wildhain: <path d="M16 12l6 8h-3l4 6h-5v4h-4v-4H9l4-6h-3z" fill="#f4ecd8" />,
  aschenturm: <path d="M16 11c1 4 6 7 6 12a6 6 0 01-12 0c0-3 2-4 2-6 2 1 3 2 3 4 1-3 1-6 1-10z" fill="#f4ecd8" />,
  knochenfeste: <path d="M16 12a6.500 6.500 0 00-6.500 6.500c0 2.300.800 4 2.500 5v3h8v-3c1.700-1 2.500-2.700 2.500-5A6.500 6.500 0 0016 12zm-2.500 8.700a1.700 1.700 0 110-3.400 1.700 1.700 0 010 3.400zm5 0a1.700 1.700 0 110-3.400 1.700 1.700 0 010 3.400z" fill="#f4ecd8" fillRule="evenodd" />,
};

export function Crest({ realmId, size = 32, title }: { realmId: string; size?: number; title?: string }) {
  const realm = realmById[realmId];
  return (
    <svg viewBox="0 0 32 40" width={size} height={size * 1.25} role="img" aria-label={title ?? realm?.name ?? 'Wappen'}>
      <path d="M2 4h28v18c0 8-7 13-14 16C9 35 2 30 2 22z" fill={realm?.color ?? '#777'} stroke="#f4ecd8" strokeWidth="1.500" />
      <g transform="translate(0 -3)">{CREST_SYMBOLS[realmId]}</g>
    </svg>
  );
}

const RESOURCE_COLORS: Record<ResourceKey, string> = { gold: '#e0b53f', material: '#a98a64', crystal: '#7fd0e6' };
export const RESOURCE_NAMES: Record<ResourceKey, string> = { gold: 'Gold', material: 'Baustoff', crystal: 'Kristall' };

export function ResourceIcon({ resource, size = 16 }: { resource: ResourceKey; size?: number }) {
  const fill = RESOURCE_COLORS[resource];
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} role="img" aria-label={RESOURCE_NAMES[resource]} style={{ verticalAlign: '-3px' }}>
      {resource === 'gold' && <circle cx="8" cy="8" r="6.500" fill={fill} stroke="#7a5d14" />}
      {resource === 'material' && <path d="M1 12l3-7h8l3 7z" fill={fill} stroke="#57452d" />}
      {resource === 'crystal' && <path d="M8 1l5 5-5 9-5-9z" fill={fill} stroke="#2f7d92" />}
    </svg>
  );
}
