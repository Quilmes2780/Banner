// Heldenfenster, Regelübersicht, Aufstieg, Gilde, Begegnung, Endwertung, Ruhmesleiste.
import { useMemo } from 'react';
import { encounterOdds } from '../../ai/simulate';
import { BALANCE } from '../../config/balance';
import { artifactById, heroDefById, realmById, skillById, spellById } from '../../engine/content';
import { effectiveStat, weeklyMovement } from '../../engine/helpers';
import { fameBreakdown, type FameBreakdown } from '../../engine/scoring';
import type { Encounter, GameState, Hero, HeroStat, PlayerId } from '../../engine/types';
import { CreatureLine } from '../components/ArmyList';
import { Crest } from '../svg/icons';
import { FAME_NAMES, FAME_ORDER, ROMAN, armyText } from '../text';

const STAT_NAMES: Record<HeroStat, string> = { attack: 'Angriff', defense: 'Verteidigung', magic: 'Magie' };

export function HeroWindow({ view, hero, onClose }: { view: GameState; hero: Hero; onClose: () => void }) {
  const def = heroDefById[hero.defId];
  const next = BALANCE.levelThresholds[hero.level - 1];
  return (
    <div className="modal-back" role="dialog" aria-label="Heldenfenster">
      <div className="modal">
        <div className="spread">
          <div className="row"><Crest realmId={view.players[hero.owner].realmId} size={28} /><h2>{def.name}</h2></div>
          <button type="button" onClick={onClose}>Schließen</button>
        </div>
        <div className="stat-grid">
          {(['attack', 'defense', 'magic'] as HeroStat[]).map(s => (
            <div key={s} className="stat-box"><span className="small muted">{STAT_NAMES[s]}</span><strong>{effectiveStat(view, hero, s)}</strong></div>
          ))}
          <div className="stat-box"><span className="small muted">Bewegung</span><strong>{hero.movement} / {weeklyMovement(view, hero)}</strong></div>
          <div className="stat-box"><span className="small muted">Stufe</span><strong>{hero.level}</strong></div>
          <div className="stat-box"><span className="small muted">Erfahrung</span><strong>{hero.xp}{next ? ` / ${next}` : ''}</strong></div>
        </div>
        <p><strong>Spezialität {def.specialty.name}:</strong> {def.specialty.description}</p>
        <p className="small muted">Reich: {realmById[view.players[hero.owner].realmId].ability}</p>
        <h3>Armee</h3>
        {hero.army.length === 0 && <span className="muted small">Keine Einheiten. Ohne Armee kann der Held nicht kämpfen.</span>}
        <div className="col">{hero.army.map(s => <CreatureLine key={s.creatureId} stack={s} />)}</div>
        <h3>Artefakte ({hero.artifacts.length} / {BALANCE.maxArtifacts})</h3>
        {hero.artifacts.length === 0 && <span className="muted small">Noch keine.</span>}
        {hero.artifacts.map(id => <div key={id} className="small"><strong>{artifactById[id].name}:</strong> {artifactById[id].description}</div>)}
        <h3>Fertigkeiten</h3>
        {hero.skills.length === 0 && <span className="muted small">Noch keine. Beim Aufstieg kommt eine dazu.</span>}
        {hero.skills.map(id => <div key={id} className="small"><strong>{skillById[id].name}:</strong> {skillById[id].description}</div>)}
        <h3>Zauber</h3>
        {hero.spells.length === 0 && <span className="muted small">Noch keine. Schreine und die Magiergilde lehren Zauber.</span>}
        {hero.spells.map(id => <div key={id} className="small"><strong>{spellById[id].name} (Stufe {spellById[id].level}):</strong> {spellById[id].description}</div>)}
      </div>
    </div>
  );
}

export function LevelUpModal({ hero, onChoose }: { hero: Hero; onChoose: (stat: HeroStat, skillId: string) => void }) {
  const options = hero.levelUp as string[];
  const def = heroDefById[hero.defId];
  return (
    <div className="modal-back" role="dialog" aria-label="Aufstieg">
      <div className="modal">
        <h2>{def.name} erreicht Stufe {hero.level}</h2>
        <p>Wähle einen Wert und eine der zwei Fertigkeitskarten.</p>
        <form className="col" onSubmit={e => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          onChoose(data.get('stat') as HeroStat, data.get('skill') as string);
        }}>
          <fieldset className="choice">
            <legend className="small">+1 Wert</legend>
            {(['attack', 'defense', 'magic'] as HeroStat[]).map((s, i) => (
              <label key={s} className="row"><input type="radio" name="stat" value={s} defaultChecked={i === 0} /> {STAT_NAMES[s]} ({hero[s]} → {hero[s] + 1})</label>
            ))}
          </fieldset>
          <fieldset className="choice">
            <legend className="small">Fertigkeit</legend>
            {options.map((id, i) => (
              <label key={id} className="row"><input type="radio" name="skill" value={id} defaultChecked={i === 0} /> <strong>{skillById[id].name}:</strong> {skillById[id].description}</label>
            ))}
          </fieldset>
          <button type="submit" className="primary">Bestätigen</button>
        </form>
      </div>
    </div>
  );
}

export function GuildModal({ options, onKeep }: { options: string[]; onKeep: (id: string) => void }) {
  return (
    <div className="modal-back" role="dialog" aria-label="Magiergilde">
      <div className="modal">
        <h2>Magiergilde</h2>
        <p>Behalte einen der gezogenen Zauber.</p>
        <div className="col">
          {options.map(id => (
            <button key={id} type="button" className="spell-card" onClick={() => onKeep(id)}>
              <strong>{spellById[id].name}</strong> <span className="small muted">Stufe {spellById[id].level}</span>
              <div className="small">{spellById[id].description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function describeEncounter(view: GameState, e: Encounter): string {
  const t = e.target;
  if (t.kind === 'hero') {
    const foe = view.heroes[t.heroId];
    return `${heroDefById[foe.defId].name} von ${view.players[foe.owner].name} (${armyText(foe.army)})`;
  }
  if (t.kind === 'city') {
    const c = view.cities[t.cityId];
    return `Hauptstadt von ${view.players[c.originalOwner].name}, Garnison: ${armyText(c.garrison)}${c.buildings.includes('wall') ? ', mit Stadtmauer und Turm' : ''}`;
  }
  const tile = Object.values(view.tiles).find(x => x.hex.q === t.hex.q && x.hex.r === t.hex.r);
  const c = tile?.content;
  if (c?.kind === 'guardian') return `${c.name}, Wächter Stufe ${ROMAN[c.tier]} (${armyText(c.army)})`;
  if (c?.kind === 'heart') return `Wächter des Herzens: ${c.name} (${armyText(c.army ?? [])})`;
  return 'Unbekannt';
}

export function EncounterModal({ view, encounter, showOdds, setShowOdds, onFight, onDecline }: {
  view: GameState; encounter: Encounter; showOdds: boolean; setShowOdds: (v: boolean) => void; onFight: () => void; onDecline: () => void;
}) {
  const hero = view.heroes[encounter.heroId];
  const odds = useMemo(
    () => (showOdds && hero.army.length > 0 ? encounterOdds(view, encounter, BALANCE.ai.previewSims) : null),
    [showOdds, view, encounter, hero.army.length],
  );
  return (
    <div className="modal-back" role="dialog" aria-label="Begegnung">
      <div className="modal">
        <h2>Begegnung</h2>
        <p>{describeEncounter(view, encounter)}</p>
        <p className="small muted">Deine Armee: {armyText(hero.army)}</p>
        {odds && (
          <div className="odds">
            <div className="odds-bar" aria-hidden="true">
              <span style={{ width: `${odds.winRate * 100}%`, background: 'var(--good)' }} />
              <span style={{ width: `${odds.drawRate * 100}%`, background: 'var(--muted)' }} />
              <span style={{ width: `${odds.lossRate * 100}%`, background: 'var(--danger)' }} />
            </div>
            <div className="small">
              Sieg <strong>{(odds.winRate * 100).toFixed(0)} %</strong> · Rückzug {(odds.drawRate * 100).toFixed(0)} % · Niederlage {(odds.lossRate * 100).toFixed(0)} %
              <span className="muted"> ({odds.runs} Simulationen, im Schnitt {(odds.avgAttackerLossShare * 100).toFixed(0)} % Verluste)</span>
            </div>
          </div>
        )}
        <label className="row small"><input type="checkbox" checked={showOdds} onChange={e => setShowOdds(e.target.checked)} /> Siegchance anzeigen</label>
        {encounter.moveCost === 0 && <p className="small muted">Das Feld war verdeckt: Die Bewegung ist bereits verbraucht.</p>}
        {hero.army.length === 0 && <p className="error small">Ohne Armee kann der Held nicht kämpfen.</p>}
        <div className="row">
          <button type="button" className="primary" disabled={hero.army.length === 0} onClick={onFight}>Kämpfen</button>
          <button type="button" onClick={onDecline}>Ausweichen</button>
        </div>
      </div>
    </div>
  );
}

export function FameBar({ state }: { state: GameState }) {
  const rows = state.players.map(p => ({ p, f: fameBreakdown(state, p.id).total })).sort((a, b) => b.f - a.f);
  const max = Math.max(1, ...rows.map(r => r.f));
  return (
    <div className="col">
      {rows.map(({ p, f }) => (
        <div key={p.id} className="fame-row">
          <Crest realmId={p.realmId} size={14} />
          <span className="small fame-name">{p.name}</span>
          <div className="fame-track" aria-hidden="true"><span style={{ width: `${(f / max) * 100}%`, background: realmById[p.realmId].color }} /></div>
          <strong className="small">{f}</strong>
        </div>
      ))}
    </div>
  );
}

export function EndScreen({ state, onMenu }: { state: GameState; onMenu: () => void }) {
  const table: { id: PlayerId; name: string; realmId: string; b: FameBreakdown }[] = state.players
    .map(p => ({ id: p.id, name: p.name, realmId: p.realmId, b: fameBreakdown(state, p.id) }))
    .sort((a, b) => b.b.total - a.b.total);
  const winners = (state.winners ?? []).map(id => state.players[id].name).join(' und ');
  return (
    <div className="screen">
      <div className="spread">
        <h1>Endwertung</h1>
        <button type="button" className="primary" onClick={onMenu}>Zum Hauptmenü</button>
      </div>
      <p>
        <strong>Sieg: {winners}.</strong>{' '}
        {state.endReason === 'conquest' ? 'Alle gegnerischen Hauptstädte sind gefallen.' : `Woche ${BALANCE.weeks} ist vorüber, der meiste Ruhm entscheidet.`}
        {' '}<span className="muted">Seed {state.seed}</span>
      </p>
      <div className="table-wrap panel">
        <table className="score">
          <thead>
            <tr><th scope="col">Spieler</th>{FAME_ORDER.map(k => <th key={k} scope="col">{FAME_NAMES[k]}</th>)}<th scope="col">Summe</th></tr>
          </thead>
          <tbody>
            {table.map(r => (
              <tr key={r.id} className={state.winners?.includes(r.id) ? 'winner' : ''}>
                <th scope="row"><span className="row"><Crest realmId={r.realmId} size={14} /> {r.name}</span></th>
                {FAME_ORDER.map(k => <td key={k}>{r.b[k]}</td>)}
                <td><strong>{r.b.total}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel col">
        <h3>Ereignisprotokoll</h3>
        <div className="combat-log" style={{ maxHeight: 280 }}>
          {[...state.log].reverse().map((e, i) => <div key={i}><span className="muted small">W{e.week}</span> {e.text}</div>)}
        </div>
      </div>
    </div>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" role="dialog" aria-label="Regelübersicht">
      <div className="modal wide">
        <div className="spread"><h2>Regelübersicht</h2><button type="button" onClick={onClose}>Schließen</button></div>
        <div className="rules">
          <section><h3>Ablauf</h3><p>10 Wochen. Jeder Spieler macht nacheinander Stadtphase und Heldenphase. Danach Wochenwechsel: Einkommen (Rathaus 4 G, Kapitol 8 G; Minen 2 G, 2 B oder 1 K), Wachstum (I:4, II:3, III:2, IV:1; Vorrat höchstens doppelt), neue Wochenkarte, Startspieler rotiert.</p></section>
          <section><h3>Karte</h3><p>Felder sind verdeckt, bis du sie betrittst. Ebene kostet 1 Bewegung, Wald, Sumpf und Gebirge 2. Helden haben 4 Bewegung pro Woche. Verdeckte Felder brauchen nur 1 Bewegung; kostet das Feld mehr, verfällt der Rest.</p></section>
          <section><h3>Felder</h3><p>Minen beflaggen, Schätze einsammeln, Wächter besiegen, Umland-Behausungen nutzen. Obelisken schließen je ein Feld für den Herzstein aus. Er liegt unter einem der 6 Felder ums Zentrum; dort kannst du graben. Das Herz in der Mitte gibt 2 Hinweise und 2 Ruhm.</p></section>
          <section><h3>Stadt</h3><p>Start 10 G, 4 B, 1 K mit Rathaus und Behausung I und II. Ein Gebäude pro Stadt und Woche. Einheiten gehen zum Helden in der Stadt oder in die Garnison. Zweiter Held: 10 Gold.</p></section>
          <section><h3>Kampf</h3><p>Raster mit 3 Reihen und 4 Spalten. Der Verteidiger stellt zuerst auf. Initiative nach Tempo, bei Gleichstand der Angreifer. Nahkampf nur vorn gegen vorn in gleicher oder benachbarter Reihe, hinten erst, wenn vorn leer ist. Fliegende und Fernkämpfer erreichen alle; Fernkampf ist 1 schlechter, wenn der Schütze vorn mit Gegner direkt gegenüber steht. Statt anzugreifen darf ein Stapel 1 Feld ziehen.</p></section>
          <section><h3>Würfel</h3><p>Würfel = Einheiten × Würfel je Einheit, höchstens 8. Treffer bei 4+. Angriffsvorsprung 1 oder 2+: Treffer bei 3+ oder 2+. Rückstand: 5+ oder 6+. Schaden = Treffer × Schaden; je volle LP stirbt eine Einheit, Restschaden bleibt. Das Nahkampfziel schlägt einmal pro Runde zurück. Nach 3 Runden zieht sich der Angreifer zurück.</p></section>
          <section><h3>Belagerung, Flucht, Zauber</h3><p>Stadtmauer: +1 Verteidigung, der Turm schießt 2 Würfel pro Runde; ein Sieg übernimmt die Stadt. Flucht zu Rundenbeginn: Armee verloren, Held zur Hauptstadt. Ein Zauber pro Kampf, Aschenturm zwei.</p></section>
          <section><h3>Helden</h3><p>Erfahrung: Wächterstufe × 2, gegen Helden 3 + deren Stufe. Aufstieg bei 4, 9, 15, 22: +1 Wert und 1 von 2 Fertigkeiten. Höchstens 3 Artefakte, 3 Stapel, 6 Einheiten je Stapel (Stufe IV: 2).</p></section>
          <section><h3>Sieg und Ruhm</h3><p>Sofortsieg, wenn du alle gegnerischen Hauptstädte hältst. Sonst zählt nach Woche 10 der Ruhm. Sofort: Wächter 1/2/3, Heldensieg 3, Herzstein 6, Herz 2. Am Ende: Stadt 3, eroberte Hauptstadt 5, Kapitol 3, Mine 1, Heldenstufe über 1 je 1, Artefakt 1, je 10 Einheiten-Stufen 1.</p></section>
          <section><h3>Reiche</h3>{Object.values(realmById).map(r => <p key={r.id}><strong>{r.name}:</strong> {r.ability}</p>)}</section>
        </div>
      </div>
    </div>
  );
}
