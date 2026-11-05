// Kampfbildschirm: Raster, Initiativleiste, Würfelanimation, Protokoll. Rendert nur und meldet Aktionen.
import { useEffect, useMemo, useState } from 'react';
import { BALANCE } from '../../config/balance';
import {
  aliveStacks, attackThreshold, combatPendingSide, defaultPlacement, hasAbility, legalHealTargets, legalMoves,
  legalTargets, spellSlotsLeft, stackOf,
} from '../../engine/combat/combat';
import { autoCombatAction } from '../../engine/combat/policy';
import type { CStack, CombatAction, CombatState, DiceRoll, Line, Placement, Side } from '../../engine/combat/types';
import { creatureById, spellById } from '../../engine/content';
import { CreatureIcon } from '../svg/icons';

const ABILITY_NAMES: Record<string, string> = { ranged: 'Fernkampf', flying: 'Fliegen', heal: 'Heilen', fast: 'Schnell' };
const TIER_NAMES = ['', 'I', 'II', 'III', 'IV'];
export const AUTO_DELAY_MS = 650;

interface Props {
  combat: CombatState;
  controllers: Record<Side, 'human' | 'auto'>;
  onAction: (a: CombatAction) => void;
  error?: string | null;
  finishLabel: string;
  onFinish: () => void;
  footer?: React.ReactNode;
}

export function DiceTray({ rolls }: { rolls: DiceRoll[] }) {
  const signature = JSON.stringify(rolls);
  const [settled, setSettled] = useState(false);
  const [flicker, setFlicker] = useState(0);
  useEffect(() => {
    setSettled(false);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setSettled(true); return; }
    const tick = setInterval(() => setFlicker(f => f + 1), 70);
    const stop = setTimeout(() => { clearInterval(tick); setSettled(true); }, 420);
    return () => { clearInterval(tick); clearTimeout(stop); };
  }, [signature]);
  if (rolls.length === 0) return <div className="dice-tray muted small">Noch kein Wurf in dieser Aktivierung.</div>;
  return (
    <div className="dice-tray" aria-live="polite">
      {rolls.map((r, i) => (
        <div key={i}>
          <div className="small">
            <strong>{r.actor}</strong> {r.kind === 'retaliation' ? 'schlägt zurück gegen' : '→'} {r.target}, trifft bei {r.threshold}+
          </div>
          <div className="dice-row">
            {r.rolls.map((v, j) => {
              const shown = settled ? v : 1 + ((flicker + j * 3 + i) % 6);
              return <span key={j} className={`die ${settled ? (v >= r.threshold ? 'hit' : 'miss') : 'rolling'}`}>{shown}</span>;
            })}
            {settled && <span className="small">{r.hits} Treffer · {r.damage} Schaden · {r.kills} gefallen</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function StackTile({ s, classes, onClick, badge }: { s: CStack; classes: string; onClick?: () => void; badge?: string }) {
  const def = creatureById[s.creatureId];
  const hpLeft = s.count * s.hp - s.damage;
  const abilities = def.abilities.map(a => ABILITY_NAMES[a]).join(', ');
  const label = `${def.name}, ${s.count} Einheiten, ${hpLeft} Lebenspunkte${abilities ? `, ${abilities}` : ''}`;
  const body = (
    <>
      <CreatureIcon icon={def.icon} size={30} />
      <span className="stack-name">{def.name} <span className="muted">{TIER_NAMES[s.tier]}</span></span>
      <span className="stack-count">×{s.count}</span>
      <span className="stack-meta">{hpLeft} LP · T{s.speed}{s.damage > 0 ? ` · Rest ${s.damage}` : ''}</span>
      {abilities && <span className="stack-meta">{abilities}</span>}
      {s.blessed && <span className="stack-meta">Gesegnet</span>}
      {s.stoneskin && <span className="stack-meta">Steinhaut</span>}
      {badge && <span className="hit-badge">{badge}</span>}
    </>
  );
  const cls = `stack ${s.side} ${classes}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-label={label}>{body}</button>
    : <div className={cls} aria-label={label}>{body}</div>;
}

const CELL_COLUMNS: { side: Side; line: Line }[] = [
  { side: 'attacker', line: 'back' }, { side: 'attacker', line: 'front' },
  { side: 'defender', line: 'front' }, { side: 'defender', line: 'back' },
];

export function CombatScreen({ combat: c, controllers, onAction, error, finishLabel, onFinish, footer }: Props) {
  const pending = combatPendingSide(c);
  const human = pending !== null && controllers[pending] === 'human';
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [placing, setPlacing] = useState<number | null>(null);
  const [spell, setSpell] = useState<string | null>(null);

  // Automatisch gesteuerte Seiten handeln mit kurzer Verzögerung, damit man folgen kann.
  useEffect(() => {
    if (c.step === 'done' || !pending || human) return;
    const t = setTimeout(() => onAction(autoCombatAction(c, { allowFlee: true })), AUTO_DELAY_MS);
    return () => clearTimeout(t);
  }, [c, pending, human, onAction]);

  useEffect(() => {
    if (c.step === 'placement' && pending) {
      setPlacements(defaultPlacement(c, pending));
      setPlacing(null);
    }
    setSpell(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.step, pending, c.round]);

  const active = c.activeId !== null ? stackOf(c, c.activeId) : null;
  const humanActive = active && human ? active : null;
  const targets = useMemo(() => (humanActive ? legalTargets(c, humanActive) : []), [c, humanActive]);
  const heals = useMemo(() => (humanActive ? legalHealTargets(c, humanActive) : []), [c, humanActive]);
  const moves = useMemo(() => (humanActive ? legalMoves(c, humanActive) : []), [c, humanActive]);
  const spellDef = spell ? spellById[spell] : null;

  const positionOf = (s: CStack): { row: number; line: Line } | null => {
    if (c.step === 'placement' && s.side === pending) {
      const p = placements.find(x => x.stackId === s.id);
      return p ? { row: p.row, line: p.line } : null;
    }
    return s.row >= 0 ? { row: s.row, line: s.line } : null;
  };
  const stacksHere = (side: Side, row: number, line: Line): CStack | undefined =>
    aliveStacks(c, side).find(s => {
      const p = positionOf(s);
      return p && p.row === row && p.line === line;
    });

  const placeAt = (row: number, line: Line) => {
    if (placing === null) return;
    const occupant = placements.find(p => p.row === row && p.line === line);
    const mine = placements.find(p => p.stackId === placing) as Placement;
    setPlacements(placements.map(p => {
      if (p.stackId === placing) return { ...p, row, line };
      if (occupant && p.stackId === occupant.stackId) return { ...p, row: mine.row, line: mine.line };
      return p;
    }));
    setPlacing(null);
  };

  const clickStack = (s: CStack): (() => void) | undefined => {
    if (c.step === 'placement' && human && s.side === pending) return () => (placing === null ? setPlacing(s.id) : placing === s.id ? setPlacing(null) : placeAt(positionOf(s)!.row, positionOf(s)!.line));
    if (c.step === 'decision' && human && spellDef && spellDef.kind !== 'fireball') {
      const friendly = spellDef.kind !== 'lightning';
      if ((s.side === pending) === friendly) return () => { onAction({ type: 'cast', spellId: spellDef.id, targetId: s.id }); setSpell(null); };
      return undefined;
    }
    if (humanActive) {
      if (targets.includes(s)) return () => onAction({ type: 'attack', targetId: s.id });
      if (heals.includes(s)) return () => onAction({ type: 'heal', targetId: s.id });
    }
    return undefined;
  };

  const statusText = (): string => {
    if (c.step === 'done') {
      if (c.result?.reason === 'roundLimit') return 'Rundenlimit erreicht: Der Angreifer zieht sich zurück.';
      if (c.result?.reason === 'flee') return `${c.sides[c.result.fled as Side].label} ist geflohen. ${c.sides[c.result.winner as Side].label} behauptet das Feld.`;
      return `${c.sides[c.result?.winner as Side].label} hat gewonnen.`;
    }
    if (!pending) return '';
    const who = c.sides[pending].label;
    if (c.step === 'placement') return human ? `${who}: Stapel anklicken, dann Zielfeld wählen. Danach bestätigen.` : `${who} stellt auf …`;
    if (c.step === 'decision') return human ? `${who}: Zauber wirken, fliehen oder weiter?` : `${who} entscheidet …`;
    return active ? `${who}: ${creatureById[active.creatureId].name} ist am Zug${human ? '' : ' …'}` : '';
  };

  const queueStacks = [active, ...c.queue.map(id => stackOf(c, id))].filter((s): s is CStack => !!s && s.count > 0);

  return (
    <div className="screen">
      <div className="spread">
        <h2>Runde {Math.max(c.round, 1)} von {BALANCE.combat.maxRounds}{c.siege ? ' · Belagerung' : ''}</h2>
        <div className="row small">
          <span style={{ color: 'var(--attacker)' }}>{c.sides.attacker.label} (A {c.sides.attacker.attack} / V {c.sides.attacker.defense})</span>
          <span className="muted">gegen</span>
          <span style={{ color: 'var(--defender)' }}>{c.sides.defender.label} (A {c.sides.defender.attack} / V {c.sides.defender.defense})</span>
        </div>
      </div>
      <div className="combat-layout">
        <div className="col">
          <div className="panel col">
            <strong aria-live="polite">{statusText()}</strong>
            {error && <div className="error" role="alert">{error}</div>}
            <div>
              <div className="small muted">Initiative</div>
              <div className="initiative">
                {queueStacks.length === 0 && <span className="muted small">–</span>}
                {queueStacks.map((s, i) => (
                  <span key={s.id} className={`init-chip ${s.side} ${i === 0 && active ? 'current' : ''}`}>
                    <CreatureIcon icon={creatureById[s.creatureId].icon} size={16} />{creatureById[s.creatureId].name} {s.speed}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="combat-grid-head small muted">
              <span>Angreifer hinten</span><span>Angreifer vorn</span><span>Verteidiger vorn</span><span>Verteidiger hinten</span>
            </div>
            <div className="combat-grid">
              {[0, 1, 2].flatMap(row => CELL_COLUMNS.map(({ side, line }) => {
                const s = stacksHere(side, row, line);
                const canMove = humanActive?.side === side && moves.some(m => m.row === row && m.line === line);
                const canPlace = c.step === 'placement' && human && pending === side && placing !== null;
                const classes = `cell ${side}-side ${canMove ? 'can-move' : ''} ${canPlace && !s ? 'can-place' : ''}`;
                const cellKey = `${row}-${side}-${line}`;
                if (s) {
                  const handler = clickStack(s);
                  const isTarget = targets.includes(s);
                  const badge = isTarget && humanActive ? `${attackThreshold(c, humanActive, s, hasAbility(humanActive, 'ranged'))}+` : undefined;
                  const cls = [
                    s.id === c.activeId ? 'active' : '',
                    isTarget ? 'target' : '',
                    heals.includes(s) ? 'healable' : '',
                    placing === s.id ? 'chosen' : '',
                    c.step === 'decision' && spellDef && handler ? 'target' : '',
                  ].join(' ');
                  return <div key={cellKey} className={classes}><StackTile s={s} classes={cls} onClick={handler} badge={badge} /></div>;
                }
                if (canMove) return <button key={cellKey} type="button" className={classes} aria-label={`Auf Reihe ${row + 1} ziehen`} onClick={() => onAction({ type: 'moveStack', row, line })} />;
                if (canPlace) return <button key={cellKey} type="button" className={classes} aria-label={`Auf Reihe ${row + 1} aufstellen`} onClick={() => placeAt(row, line)} />;
                return <div key={cellKey} className={classes} />;
              }))}
            </div>
          </div>
          <div className="panel row">
            {c.step === 'placement' && human && (
              <button type="button" className="primary" onClick={() => onAction({ type: 'place', placements })}>Aufstellung bestätigen</button>
            )}
            {c.step === 'decision' && human && pending && (
              <>
                {c.sides[pending].spells.map(id => {
                  const def = spellById[id];
                  if (def.kind === 'portal') return null;
                  return (
                    <button key={id} type="button" title={def.description} className={spell === id ? 'selected' : ''}
                      disabled={spellSlotsLeft(c, pending) <= 0} onClick={() => setSpell(spell === id ? null : id)}>
                      {def.name}
                    </button>
                  );
                })}
                {spellDef?.kind === 'fireball' && [0, 1, 2].map(r => (
                  <button key={r} type="button" onClick={() => { onAction({ type: 'cast', spellId: spellDef.id, row: r }); setSpell(null); }}>Reihe {r + 1}</button>
                ))}
                {spellDef && spellDef.kind !== 'fireball' && <span className="small muted">Ziel im Raster anklicken.</span>}
                <span className="small muted">Zauber übrig: {spellSlotsLeft(c, pending)}</span>
                <button type="button" className="primary" onClick={() => onAction({ type: 'passDecision' })}>Weiter</button>
                <button type="button" className="danger" title="Armee geht verloren, der Held kehrt zur Hauptstadt zurück." onClick={() => onAction({ type: 'flee' })}>Fliehen</button>
              </>
            )}
            {humanActive && (
              <>
                <span className="small muted">
                  Ziel anklicken{moves.length > 0 ? ', blaues Feld zum Ziehen' : ''}.
                  {targets.length === 0 && heals.length === 0 ? ' Kein Ziel erreichbar.' : ''}
                </span>
                <button type="button" onClick={() => onAction({ type: 'pass' })}>Aussetzen</button>
              </>
            )}
            {c.step === 'done' && <button type="button" className="primary" onClick={onFinish}>{finishLabel}</button>}
            {!human && c.step !== 'done' && <span className="small muted">Automatischer Zug …</span>}
            {footer}
          </div>
        </div>
        <div className="col">
          <div className="panel col">
            <h3>Würfel</h3>
            <DiceTray rolls={c.lastRolls} />
          </div>
          <div className="panel col">
            <h3>Kampfprotokoll</h3>
            <div className="combat-log">
              {[...c.log].reverse().map((l, i) => <div key={c.log.length - i}>{l}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
