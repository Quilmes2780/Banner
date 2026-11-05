// Hauptmenü und Partie-Einrichtung.
import { useState } from 'react';
import { BALANCE } from '../../config/balance';
import { REALMS } from '../../engine/content';
import type { Control, PlayerSetup } from '../../engine/types';
import { Crest } from '../svg/icons';
import { RulesModal } from './Panels';

const CONTROLS: { id: Control; label: string }[] = [
  { id: 'human', label: 'Mensch' },
  { id: 'ai-easy', label: 'KI leicht' },
  { id: 'ai-normal', label: 'KI normal' },
  { id: 'ai-hard', label: 'KI schwer' },
];
const newSeed = () => Math.floor(Math.random() * 1000000);

interface Props {
  hasSave: boolean;
  onContinue: () => void;
  onStart: (seed: number, setups: PlayerSetup[]) => void;
  onCombatTest: () => void;
}

export function MenuScreen({ hasSave, onContinue, onStart, onCombatTest }: Props) {
  const [count, setCount] = useState(2);
  const [seed, setSeed] = useState(newSeed);
  const [rules, setRules] = useState(false);
  const [seats, setSeats] = useState<PlayerSetup[]>(
    REALMS.map((r, i) => ({ name: `Spieler ${i + 1}`, realmId: r.id, control: i === 0 ? 'human' : 'ai-normal' })),
  );
  const update = (i: number, patch: Partial<PlayerSetup>) => setSeats(seats.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="menu">
      <div className="menu-head">
        <h1>Banner der Reiche</h1>
        <p className="muted">Rundenbasierte Fantasy-Strategie: erkunden, bauen, kämpfen. {BALANCE.weeks} Wochen, 2 bis 4 Plätze am selben Gerät.</p>
        <div className="row">
          {hasSave && <button type="button" className="primary" onClick={onContinue}>Partie fortsetzen</button>}
          <button type="button" onClick={() => setRules(true)}>Regelübersicht</button>
          <button type="button" onClick={onCombatTest}>Kampf-Testmodus</button>
        </div>
      </div>
      <section className="panel col menu-setup">
        <h2>Neue Partie</h2>
        <label className="row">Spielerzahl
          <select value={count} onChange={e => setCount(Number(e.target.value))}>
            {[2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {seats.slice(0, count).map((seat, i) => (
          <div key={i} className="seat">
            <Crest realmId={seat.realmId} size={26} />
            <label className="col small">Name
              <input type="text" value={seat.name} onChange={e => update(i, { name: e.target.value })} />
            </label>
            <label className="col small">Reich
              <select value={seat.realmId} onChange={e => update(i, { realmId: e.target.value })}>
                {REALMS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="col small">Steuerung
              <select value={seat.control} onChange={e => update(i, { control: e.target.value as Control })}>
                {CONTROLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <span className="small muted seat-ability">{REALMS.find(r => r.id === seat.realmId)?.ability}</span>
          </div>
        ))}
        <div className="row">
          <label className="row">Seed <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} style={{ width: 110 }} /></label>
          <button type="button" onClick={() => setSeed(newSeed())}>Neuer Seed</button>
          <button type="button" className="primary" onClick={() => onStart(seed, seats.slice(0, count).map(s => ({ ...s, name: s.name.trim() || 'Namenlos' })))}>Partie starten</button>
        </div>
      </section>
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </div>
  );
}
