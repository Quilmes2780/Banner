// Abenteuerkarte als SVG: Hex-Raster mit Zoom, Verschieben und Pfadvorschau.
import { useEffect, useMemo, useRef, useState } from 'react';
import { creatureById, realmById } from '../../engine/content';
import { hexKey, sameHex } from '../../engine/hex';
import type { PathResult } from '../../engine/movement';
import type { GameState, Hero, Hex, PlayerId, Tile } from '../../engine/types';
import { CreatureIcon, Crest, ResourceIcon } from '../svg/icons';
import { ROMAN, TERRAIN_NAMES, contentText } from '../text';

const SIZE = 40;
const SQRT3 = Math.sqrt(3);
const toPixel = (h: Hex) => ({ x: SIZE * SQRT3 * (h.q + h.r / 2), y: SIZE * 1.5 * h.r });
const CORNERS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 90);
  return `${(SIZE - 1) * Math.cos(a)},${(SIZE - 1) * Math.sin(a)}`;
}).join(' ');

const TERRAIN_FILL: Record<string, string> = {
  plain: '#7f8f55', forest: '#3f6e43', swamp: '#56705f', mountain: '#7c7468', unknown: '#2c271f',
};

function TerrainMark({ terrain }: { terrain: string }) {
  const stroke = '#00000040';
  if (terrain === 'forest') return <g fill="#2c5233"><path d="M-22 22l6-12 6 12zM12 26l6-12 6 12zM-6 -28l5-10 5 10z" /></g>;
  if (terrain === 'mountain') return <g fill="#5f584d"><path d="M-26 24l9-14 9 14zM10 26l9-14 9 14zM-6-24l7-11 7 11z" /></g>;
  if (terrain === 'swamp') return <g fill="none" stroke={stroke} strokeWidth="2"><path d="M-26 22q4-4 8 0t8 0M10 24q4-4 8 0t8 0M-8-28q4-4 8 0t8 0" /></g>;
  return null;
}

function ContentMark({ tile, playerColor }: { tile: Tile; playerColor: (id: PlayerId) => string }) {
  const c = tile.content;
  if (!c) return null;
  const glyph = (node: React.ReactNode) => <g transform="translate(-12 -14)">{node}</g>;
  switch (c.kind) {
    case 'mine':
      return (
        <g>
          <path d="M-14 12V-6l14-8 14 8v18z" fill="#2c271f" stroke={c.owner !== null ? playerColor(c.owner) : '#d8cfb8'} strokeWidth="3" />
          <g transform="translate(-8 -8)"><ResourceIcon resource={c.resource} size={16} /></g>
        </g>
      );
    case 'treasure':
      return <g><rect x="-13" y="-8" width="26" height="18" rx="3" fill="#8a5a2b" stroke="#efc867" strokeWidth="2" /><rect x="-13" y="-8" width="26" height="6" fill="#a97337" stroke="#efc867" strokeWidth="1" /><rect x="-3" y="-4" width="6" height="7" fill="#efc867" /></g>;
    case 'guardian': {
      const icon = creatureById[c.army[0]?.creatureId]?.icon ?? 'blade';
      return (
        <g color="#f1d4cc">
          <circle r="17" fill="#6b2b23" stroke="#e08a79" strokeWidth="2" />
          {glyph(<CreatureIcon icon={icon} size={24} />)}
          <text y="30" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffe6dd" stroke="#2c271f" strokeWidth="3" paintOrder="stroke">{ROMAN[c.tier]}</text>
        </g>
      );
    }
    case 'dwelling':
      return <g><path d="M-14 12V-3L0-14 14-3v15z" fill="#6a5a3c" stroke={c.owner !== null ? playerColor(c.owner) : '#d8cfb8'} strokeWidth="2.500" /><text y="9" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{ROMAN[c.tier]}</text></g>;
    case 'obelisk':
      return <path d="M-6 16L-3-16 0-20 3-16 6 16z" fill="#b6c3d6" stroke="#37465c" strokeWidth="2" />;
    case 'shrine':
      return <g><path d="M-15 14h30M-11 14V-3M11 14V-3M-15-3L0-16 15-3z" fill="#ccb9e6" stroke="#5a4580" strokeWidth="2.500" /></g>;
    case 'heart':
      return (
        <g>
          <path d="M0 18C-22 2-16-16-6-16c3 0 5 2 6 5 1-3 3-5 6-5 10 0 16 18-6 34z" fill={c.army ? '#c23b3b' : '#7a4a4a'} stroke="#ffd7d7" strokeWidth="2" />
        </g>
      );
  }
}

export interface MapViewProps {
  view: GameState;
  viewer: PlayerId;
  selectedHero: Hero | null;
  path: PathResult | null;
  onHover: (hex: Hex | null) => void;
  onTileClick: (hex: Hex) => void;
  ownerName: (id: PlayerId) => string;
  canAct: boolean;
}

export function MapView({ view, viewer, selectedHero, path, onHover, onTileClick, ownerName, canAct }: MapViewProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const tiles = useMemo(() => Object.values(view.tiles), [view.tiles]);
  const box = useMemo(() => {
    const halfW = SIZE * SQRT3 * (view.radius + 0.6);
    const halfH = SIZE * (1.5 * view.radius + 1.2);
    return { x: -halfW, y: -halfH, w: halfW * 2, h: halfH * 2 };
  }, [view.radius]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => Math.max(0.6, Math.min(3, z * (e.deltaY < 0 ? 1.12 : 0.89))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const playerColor = (id: PlayerId) => realmById[view.players[id].realmId].color;
  const hints = new Set(view.players[viewer].hints);
  const pathKeys = new Set(path?.path.map(hexKey) ?? []);
  const scale = (box.w / (svg.current?.clientWidth || box.w)) / zoom;

  return (
    <div className="map-wrap">
      <svg
        ref={svg}
        className="map-svg"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        role="application"
        aria-label="Abenteuerkarte"
        onPointerDown={e => {
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false };
          movedRef.current = false;
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 6) {
            d.moved = true;
            movedRef.current = true;
          }
          if (d.moved) setOffset({ x: d.ox + dx * scale, y: d.oy + dy * scale });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; onHover(null); }}
      >
        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          {tiles.map(tile => {
            const { x, y } = toPixel(tile.hex);
            const key = hexKey(tile.hex);
            const known = tile.revealedBy.includes(viewer);
            const city = Object.values(view.cities).find(c => sameHex(c.pos, tile.hex));
            const heroes = Object.values(view.heroes).filter(h => sameHex(h.pos, tile.hex));
            const label = [
              known ? TERRAIN_NAMES[tile.terrain] : 'Verdeckt',
              known ? contentText(tile.content, ownerName) : '',
              city ? `Stadt von ${ownerName(city.owner)}` : '',
              heroes.length ? `Held von ${ownerName(heroes[0].owner)}` : '',
              hints.has(key) ? 'Kein Herzstein' : '',
            ].filter(Boolean).join(', ');
            return (
              <g
                key={key}
                transform={`translate(${x} ${y})`}
                className="hex"
                role="button"
                tabIndex={0}
                aria-label={label}
                onMouseEnter={() => onHover(tile.hex)}
                onClick={() => { if (!movedRef.current) onTileClick(tile.hex); }}
                onKeyDown={e => { if (e.key === 'Enter') onTileClick(tile.hex); }}
              >
                <title>{label}</title>
                <polygon points={CORNERS} fill={TERRAIN_FILL[known ? tile.terrain : 'unknown']} stroke={pathKeys.has(key) ? '#efc867' : '#1b1813'} strokeWidth={pathKeys.has(key) ? 3 : 1.500} />
                {known ? <TerrainMark terrain={tile.terrain} /> : <text y="7" textAnchor="middle" fontSize="20" fill="#5e5443">?</text>}
                {known && !city && <ContentMark tile={tile} playerColor={playerColor} />}
                {city && (
                  <g>
                    <path d="M-22 16V-10l7 5 7-9 8 9 8-9 7 9 7-5v26z" fill="#3b342a" stroke={playerColor(city.owner)} strokeWidth="3" />
                    <g transform="translate(-9 -15)"><Crest realmId={city.realmId} size={18} /></g>
                  </g>
                )}
                {hints.has(key) && <path d="M-9-9L9 9M9-9L-9 9" stroke="#ffd7d7" strokeWidth="3" transform="translate(0 -22) scale(.6)" />}
                {heroes.map((h, i) => (
                  <g key={h.id} transform={`translate(${14 - i * 16} 16)`}>
                    <circle r="12" fill={playerColor(h.owner)} stroke={selectedHero?.id === h.id ? '#efc867' : '#f4ecd8'} strokeWidth={selectedHero?.id === h.id ? 3.500 : 1.500} />
                    <path d="M-5 7V-8M-5-8l10 3.500L-5-1z" fill="#f4ecd8" stroke="#f4ecd8" strokeWidth="1.500" />
                  </g>
                ))}
              </g>
            );
          })}
          {selectedHero && path && (
            <g pointerEvents="none">
              {path.path.map((h, i) => {
                const { x, y } = toPixel(h);
                const prev = toPixel(i === 0 ? selectedHero.pos : path.path[i - 1]);
                const reachable = i < path.affordableSteps;
                const cost = path.costs[i];
                return (
                  <g key={hexKey(h)}>
                    <line x1={prev.x} y1={prev.y} x2={x} y2={y} stroke={reachable ? '#efc867' : '#c9c1ad'} strokeWidth="4" strokeDasharray={reachable ? undefined : '6 6'} />
                    <circle cx={x} cy={y} r="11" fill={reachable ? '#efc867' : '#6f6657'} stroke="#241c0c" />
                    <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#241c0c">{cost ?? '?'}</text>
                  </g>
                );
              })}
            </g>
          )}
        </g>
      </svg>
      <div className="map-controls">
        <button type="button" aria-label="Hineinzoomen" onClick={() => setZoom(z => Math.min(3, z * 1.2))}>+</button>
        <button type="button" aria-label="Herauszoomen" onClick={() => setZoom(z => Math.max(0.6, z / 1.2))}>−</button>
        <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>Mitte</button>
      </div>
      {!canAct && <div className="map-note small">Sicht von {ownerName(viewer)}</div>}
    </div>
  );
}
