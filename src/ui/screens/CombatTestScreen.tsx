// Testmodus: Kampf isoliert aufsetzen und spielen, ohne Karte.
import { useCallback, useState } from 'react';
import { BALANCE } from '../../config/balance';
import { combatReducer, initCombat } from '../../engine/combat/combat';
import { simulateCombat } from '../../engine/combat/policy';
import type { CombatAction, CombatSetup, CombatState, Side, SideSetup } from '../../engine/combat/types';
import { CREATURES, SPELLS, realmById } from '../../engine/content';
import type { Stack } from '../../engine/types';
import { CombatScreen } from './CombatScreen';

interface SideConfig {
  attack: number; defense: number; magic: number; spells: string[]; control: 'human' | 'auto';
  army: Record<string, number>;
}
const REALM_GROUPS = ['kronland', 'wildhain', 'aschenturm', 'knochenfeste', 'neutral'];

const DEFAULTS: Record<Side, SideConfig> = {
  attacker: { attack: 1, defense: 1, magic: 1, spells: ['lightning', 'bless'], control: 'human', army: { landwehr: 4, armbruster: 2, falkenreiter: 1 } },
  defender: { attack: 1, defense: 1, magic: 0, spells: [], control: 'auto', army: { raeuber: 4, sumpfschuetze: 2, wildwolf: 2 } },
};

function buildSide(cfg: SideConfig, label: string, playerId: number): SideSetup {
  const army: Stack[] = Object.entries(cfg.army).filter(([, n]) => n > 0).map(([creatureId, count]) => ({ creatureId, count }));
  return {
    kind: 'hero', label, playerId, attack: cfg.attack, defense: cfg.defense, magic: cfg.magic,
    spells: cfg.spells, spellSlots: BALANCE.combat.spellsPerCombat, rangedNoPenalty: false, tierDice: {}, army,
  };
}

function SideEditor({ title, cfg, onChange }: { title: string; cfg: SideConfig; onChange: (c: SideConfig) => void }) {
  const stacks = Object.values(cfg.army).filter(n => n > 0).length;
  const num = (key: 'attack' | 'defense' | 'magic', label: string) => (
    <label className="row small">{label}
      <input type="number" min={0} max={9} value={cfg[key]} onChange={e => onChange({ ...cfg, [key]: Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="panel col">
      <div className="spread">
        <h3>{title}</h3>
        <label className="row small">Steuerung
          <select value={cfg.control} onChange={e => onChange({ ...cfg, control: e.target.value as SideConfig['control'] })}>
            <option value="human">Mensch</option>
            <option value="auto">KI</option>
          </select>
        </label>
      </div>
      <div className="row">{num('attack', 'Angriff')}{num('defense', 'Verteidigung')}{num('magic', 'Magie')}</div>
      <div className="row small">
        {SPELLS.filter(s => s.kind !== 'portal').map(s => (
          <label key={s.id} className="row">
            <input type="checkbox" checked={cfg.spells.includes(s.id)}
              onChange={e => onChange({ ...cfg, spells: e.target.checked ? [...cfg.spells, s.id] : cfg.spells.filter(x => x !== s.id) })} />
            {s.name}
          </label>
        ))}
      </div>
      <div className="small muted">Stapel: {stacks} von {BALANCE.maxStacks}</div>
      {REALM_GROUPS.map(group => (
        <details key={group} open={group === 'kronland' || group === 'neutral'}>
          <summary className="small">{realmById[group]?.name ?? 'Neutral'}</summary>
          <div className="col" style={{ paddingTop: 6 }}>
            {CREATURES.filter(c => c.realm === group).map(c => {
              const value = cfg.army[c.id] ?? 0;
              return (
                <label key={c.id} className="army-line small">
                  <span>{c.name} (Stufe {c.tier})</span>
                  <input type="number" min={0} max={BALANCE.maxPerStack[c.tier]} value={value}
                    disabled={value === 0 && stacks >= BALANCE.maxStacks}
                    onChange={e => onChange({ ...cfg, army: { ...cfg.army, [c.id]: Math.min(BALANCE.maxPerStack[c.tier], Math.max(0, Number(e.target.value))) } })} />
                </label>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

export function CombatTestScreen({ onBack }: { onBack: () => void }) {
  const [attacker, setAttacker] = useState(DEFAULTS.attacker);
  const [defender, setDefender] = useState(DEFAULTS.defender);
  const [seed, setSeed] = useState(1234);
  const [siege, setSiege] = useState(false);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const setup = (): CombatSetup => ({
    attacker: buildSide(attacker, 'Angreifer', 0),
    defender: buildSide(defender, 'Verteidiger', 1),
    siege: siege ? { wall: true } : null,
    seed,
  });
  const onAction = useCallback((a: CombatAction) => {
    setCombat(c => {
      if (!c) return c;
      try {
        setError(null);
        return combatReducer(c, a);
      } catch (e) {
        setError((e as Error).message);
        return c;
      }
    });
  }, []);

  if (combat) {
    return (
      <CombatScreen combat={combat} controllers={{ attacker: attacker.control, defender: defender.control }}
        onAction={onAction} error={error} finishLabel="Zurück zur Einrichtung" onFinish={() => setCombat(null)}
        footer={<button type="button" onClick={() => setCombat(null)}>Abbrechen</button>} />
    );
  }
  const ready = Object.values(attacker.army).some(n => n > 0) && Object.values(defender.army).some(n => n > 0);
  return (
    <div className="screen">
      <div className="spread">
        <h1>Kampf-Testmodus</h1>
        <button type="button" onClick={onBack}>Zurück zum Hauptmenü</button>
      </div>
      <div className="test-sides">
        <SideEditor title="Angreifer" cfg={attacker} onChange={c => { setAttacker(c); setPreview(null); }} />
        <SideEditor title="Verteidiger" cfg={defender} onChange={c => { setDefender(c); setPreview(null); }} />
      </div>
      <div className="panel row">
        <label className="row">Seed <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} style={{ width: 110 }} /></label>
        <label className="row"><input type="checkbox" checked={siege} onChange={e => setSiege(e.target.checked)} /> Belagerung mit Turm</label>
        <button type="button" disabled={!ready} onClick={() => setPreview(simulateCombat(setup(), BALANCE.ai.previewSims, seed).winRate)}>Siegchance berechnen</button>
        {preview !== null && <span>Angreifer gewinnt in {(preview * 100).toFixed(0)} % von {BALANCE.ai.previewSims} Simulationen.</span>}
        <button type="button" className="primary" disabled={!ready} onClick={() => { setError(null); setCombat(initCombat(setup())); }}>Kampf starten</button>
      </div>
    </div>
  );
}
