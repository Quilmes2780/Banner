// Armeeanzeige und Einheitentausch zwischen Holdern am selben Ort.
import { BALANCE } from '../../config/balance';
import { creatureById } from '../../engine/content';
import { roomInArmy } from '../../engine/helpers';
import type { Action, Holder, Stack } from '../../engine/types';
import { CreatureIcon } from '../svg/icons';
import { ABILITY_NAMES, ROMAN } from '../text';

export function CreatureLine({ stack }: { stack: Stack }) {
  const def = creatureById[stack.creatureId];
  const t = BALANCE.tiers[def.tier];
  const abilities = def.abilities.map(a => ABILITY_NAMES[a]).join(', ');
  return (
    <span className="row creature-line" title={`Stufe ${ROMAN[def.tier]}: ${t.dice} Würfel, ${t.damage} Schaden, ${t.hp} LP, Tempo ${t.speed}${abilities ? `, ${abilities}` : ''}`}>
      <CreatureIcon icon={def.icon} size={20} />
      <span><strong>{stack.count}×</strong> {def.name} <span className="muted small">{ROMAN[def.tier]}{abilities ? ` · ${abilities}` : ''}</span></span>
    </span>
  );
}

export interface ArmyHolder { holder: Holder; label: string; army: Stack[] }

export function ArmyPanel({ holders, onAction, canAct }: { holders: ArmyHolder[]; onAction: (a: Action) => void; canAct: boolean }) {
  return (
    <div className="col">
      {holders.map(h => (
        <div key={`${h.holder.type}-${h.holder.id}`} className="col">
          <strong className="small">{h.label}</strong>
          {h.army.length === 0 && <span className="muted small">Keine Einheiten</span>}
          {h.army.map(stack => (
            <div key={stack.creatureId} className="spread army-row">
              <CreatureLine stack={stack} />
              {canAct && (
                <span className="row">
                  {holders.filter(o => o !== h).map(o => {
                    const room = roomInArmy(o.army, stack.creatureId);
                    return (
                      <button key={o.label} type="button" className="mini" disabled={room <= 0}
                        title={`Einheiten zu ${o.label}`}
                        onClick={() => onAction({ type: 'transfer', from: h.holder, to: o.holder, creatureId: stack.creatureId, count: Math.min(room, stack.count) })}>
                        → {o.label}
                      </button>
                    );
                  })}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
