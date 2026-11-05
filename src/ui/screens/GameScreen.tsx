// Spielbildschirm: verbindet reinen Spielzustand mit der Darstellung. Gezeigt wird nur die Spieler-Sicht.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { aiAction } from '../../ai';
import type { CombatAction, Side } from '../../engine/combat/types';
import { heroDefById, realmById, spellById, weekCardById } from '../../engine/content';
import { currentDecider } from '../../engine/encounter';
import { hexDistance, sameHex } from '../../engine/hex';
import { citiesOf, heroAt, heroesOf, tileAt } from '../../engine/helpers';
import { findPath, type PathResult } from '../../engine/movement';
import { applyAction } from '../../engine/reducer';
import { playerView } from '../../engine/view';
import { weeklyIncome } from '../../engine/week';
import type { Action, GameState, Hero, Hex, PlayerId, ResourceKey } from '../../engine/types';
import { ArmyPanel, CreatureLine, type ArmyHolder } from '../components/ArmyList';
import { MapView } from '../components/MapView';
import { loadOptions, saveGame, saveOptions } from '../save';
import { Crest, RESOURCE_NAMES, ResourceIcon } from '../svg/icons';
import { CityScreen } from './CityScreen';
import { CombatScreen } from './CombatScreen';
import { EncounterModal, EndScreen, FameBar, GuildModal, HeroWindow, LevelUpModal, RulesModal } from './Panels';

const RESOURCES: ResourceKey[] = ['gold', 'material', 'crystal'];
const AI_DELAY_MS = 180;

const isHuman = (s: GameState, id: PlayerId | null): boolean => id !== null && s.players[id].control === 'human';
const combatHasHuman = (s: GameState): boolean => {
  const c = s.combat?.state;
  if (!c) return false;
  return (['attacker', 'defender'] as Side[]).some(side => isHuman(s, c.sides[side].playerId));
};

export function GameScreen({ initial, initialViewer, onExit }: { initial: GameState; initialViewer: PlayerId; onExit: () => void }) {
  const [state, setState] = useState(initial);
  const [viewer, setViewer] = useState<PlayerId>(initialViewer);
  const [error, setError] = useState<string | null>(null);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [heroWindow, setHeroWindow] = useState(false);
  const [rules, setRules] = useState(false);
  const [hover, setHover] = useState<Hex | null>(null);
  const [options, setOptions] = useState(loadOptions);
  const [saveFailed, setSaveFailed] = useState(false);

  const dispatch = useCallback((a: Action) => {
    setState(s => {
      try {
        const next = applyAction(s, a);
        setError(null);
        return next;
      } catch (e) {
        setError((e as Error).message);
        return s;
      }
    });
  }, []);

  useEffect(() => { setSaveFailed(!saveGame({ state, viewer })); }, [state, viewer]);

  const decider = currentDecider(state);
  const c = state.combat?.state;
  // Im laufenden Kampf zweier Menschen wird nur für die verdeckte Aufstellung übergeben.
  const inOpenCombat = !!c && c.step !== 'placement';
  const needsHandover = state.phase !== 'ended' && isHuman(state, decider) && decider !== viewer && !inOpenCombat;
  const humanCombat = combatHasHuman(state);

  // KI handelt; Kämpfe mit Menschen laufen sichtbar über den Kampfbildschirm.
  useEffect(() => {
    if (state.phase === 'ended' || isHuman(state, decider) || humanCombat) return;
    const t = setTimeout(() => dispatch(aiAction(state)), state.combat ? 5 : AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, decider, humanCombat, dispatch]);

  const view = useMemo(() => playerView(state, viewer), [state, viewer]);
  const myTurn = !needsHandover && decider === viewer && isHuman(state, viewer);
  const activeIsMine = myTurn && state.order[state.activeIndex] === viewer;
  const myHeroes = useMemo(() => heroesOf(view, viewer), [view, viewer]);
  const selected: Hero | null = myHeroes.find(h => h.id === selectedHeroId) ?? myHeroes[0] ?? null;
  const myCities = citiesOf(view, viewer);

  // Zu Beginn der eigenen Stadtphase öffnet sich die Stadt.
  const phaseKey = `${state.week}-${state.activeIndex}-${state.phase}-${viewer}`;
  useEffect(() => {
    if (activeIsMine && state.phase === 'city' && myCities.length > 0) setCityId(myCities[0].id);
    else if (state.phase !== 'city') setCityId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey]);

  const path: PathResult | null = useMemo(() => {
    if (!hover || !selected || !activeIsMine || state.phase !== 'hero' || state.encounter) return null;
    return findPath(view, selected.id, hover);
  }, [hover, selected, activeIsMine, state.phase, state.encounter, view]);

  const onTileClick = (hex: Hex) => {
    const mineHere = heroAt(view, hex).filter(h => h.owner === viewer);
    if (mineHere.length > 0 && !sameHex(selected?.pos ?? { q: 99, r: 99 }, hex)) {
      setSelectedHeroId(mineHere[0].id);
      return;
    }
    const city = myCities.find(x => sameHex(x.pos, hex));
    if (city && state.phase === 'city') { setCityId(city.id); return; }
    if (!activeIsMine || state.phase !== 'hero' || !selected) {
      if (city) setCityId(city.id);
      return;
    }
    if (selected && sameHex(selected.pos, hex)) {
      if (city) setCityId(city.id);
      return;
    }
    // Maus: Vorschau kam schon durchs Überfahren. Touch: erster Tipp zeigt sie, zweiter bewegt.
    if (!hover || !sameHex(hover, hex)) {
      setHover(hex);
      return;
    }
    const p = findPath(view, selected.id, hex);
    if (!p) {
      setError('Dorthin führt kein bekannter Weg.');
      return;
    }
    dispatch({ type: 'move', heroId: selected.id, path: p.path });
    setHover(null);
  };

  if (state.phase === 'ended') return <EndScreen state={state} onMenu={onExit} />;

  if (needsHandover) {
    const next = state.players[decider as PlayerId];
    return (
      <div className="center-screen">
        <Crest realmId={next.realmId} size={64} />
        <h1>{next.name} ist am Zug</h1>
        <p className="muted">Gib das Gerät weiter. Die Karte bleibt verdeckt, bis {next.name} bestätigt.</p>
        {c?.step === 'placement' && <p>Es kommt zum Kampf: Du stellst jetzt deine Truppen auf.</p>}
        <button type="button" className="primary" onClick={() => setViewer(decider as PlayerId)}>Bereit</button>
      </div>
    );
  }

  if (c && humanCombat) {
    return (
      <CombatScreen
        combat={c}
        controllers={{
          attacker: isHuman(state, c.sides.attacker.playerId) ? 'human' : 'auto',
          defender: isHuman(state, c.sides.defender.playerId) ? 'human' : 'auto',
        }}
        onAction={(a: CombatAction) => dispatch({ type: 'combat', action: a })}
        error={error}
        finishLabel="Zur Karte"
        onFinish={() => dispatch({ type: 'finishCombat' })}
      />
    );
  }

  const leveling = myTurn ? myHeroes.find(h => h.levelUp) : undefined;
  const income = weeklyIncome(view, viewer);
  const card = weekCardById[state.weekCardId];
  const me = view.players[viewer];
  const city = cityId ? view.cities[cityId] : null;
  const activePlayer = state.players[state.order[state.activeIndex]];
  const tile = selected ? tileAt(view, selected.pos) : undefined;
  const canDig = !!selected && activeIsMine && state.phase === 'hero' && hexDistance(selected.pos, { q: 0, r: 0 }) === 1 && selected.movement >= 1 && !tile?.dugBy.includes(viewer);
  const dwelling = tile?.content?.kind === 'dwelling' ? tile.content : null;
  const hasPortal = !!selected?.spells.some(id => spellById[id].kind === 'portal');
  const othersHere = selected ? heroAt(view, selected.pos).filter(h => h.owner === viewer && h.id !== selected.id) : [];
  const cityHere = selected ? myCities.find(x => sameHex(x.pos, selected.pos)) : undefined;
  const holders: ArmyHolder[] = selected ? [
    { holder: { type: 'hero', id: selected.id }, label: heroDefById[selected.defId].name, army: selected.army },
    ...othersHere.map(h => ({ holder: { type: 'hero' as const, id: h.id }, label: heroDefById[h.defId].name, army: h.army })),
    ...(cityHere ? [{ holder: { type: 'city' as const, id: cityHere.id }, label: 'Garnison', army: cityHere.garrison }] : []),
  ] : [];

  return (
    <div className="game">
      <header className="topbar">
        <div className="row">
          <Crest realmId={me.realmId} size={24} />
          <div>
            <strong>{me.name}</strong> <span className="small muted">{realmById[me.realmId].name}</span>
            <div className="small muted">Woche {state.week} von 10 · Seed {state.seed}</div>
          </div>
        </div>
        <div className="row resources">
          {RESOURCES.map(r => (
            <span key={r} className="row res" title={`${RESOURCE_NAMES[r]}: nächste Woche +${income[r]}`}>
              <ResourceIcon resource={r} /> <strong>{me.resources[r]}</strong> <span className="small muted">+{income[r]}</span>
            </span>
          ))}
        </div>
        <div className="small week-card" title={card.description}><strong>{card.name}</strong><br /><span className="muted">{card.description}</span></div>
        <div className="row">
          <button type="button" onClick={() => setRules(true)}>Regeln</button>
          <button type="button" onClick={onExit}>Menü</button>
          {activeIsMine && state.phase === 'city' && <button type="button" className="primary" onClick={() => dispatch({ type: 'endCityPhase' })}>Zur Heldenphase</button>}
          {activeIsMine && state.phase === 'hero' && <button type="button" className="primary" onClick={() => dispatch({ type: 'endHeroPhase' })}>Zug beenden</button>}
        </div>
      </header>
      {error && <div className="error banner" role="alert">{error}</div>}
      {saveFailed && <div className="notice banner small">Der Spielstand konnte nicht gespeichert werden. Die Partie läuft weiter, geht beim Schließen aber verloren.</div>}
      {!activeIsMine && <div className="notice banner small" aria-live="polite">{activePlayer.name} ist am Zug{activePlayer.control === 'human' ? '' : ' (KI) …'}</div>}
      <div className="game-body">
        <MapView view={view} viewer={viewer} selectedHero={selected} path={path} onHover={setHover} onTileClick={onTileClick}
          ownerName={id => view.players[id].name} canAct={activeIsMine} />
        <aside className="side">
          <section className="panel col">
            <h3>{state.phase === 'city' ? 'Stadtphase' : 'Heldenphase'}</h3>
            {path && (
              <div className="small path-info">
                {path.path.length} {path.path.length === 1 ? 'Feld' : 'Felder'}, Kosten {path.knownCost}{path.endsHidden ? ' + ?' : ''}
                {selected && selected.movement >= path.knownCost && ` · Rest ${selected.movement - path.knownCost}`}
                {path.affordableSteps < path.path.length && <span className="muted"> · Bewegung reicht für {path.affordableSteps} von {path.path.length} Feldern</span>}
                {path.endsInEncounter && <span> · Kampf am Ziel</span>}
                {path.endsHidden && <span className="muted"> · Ziel verdeckt</span>}
              </div>
            )}
            {myCities.map(x => <button key={x.id} type="button" onClick={() => setCityId(x.id)}>Stadt öffnen: {view.players[x.originalOwner].name}</button>)}
          </section>
          <section className="panel col">
            <div className="spread"><h3>Helden</h3>{selected && <button type="button" className="mini" onClick={() => setHeroWindow(true)}>Details</button>}</div>
            {myHeroes.length === 0 && <span className="small muted">Keine Helden. In der Stadtphase kannst du einen anwerben.</span>}
            <div className="row">
              {myHeroes.map(h => (
                <button key={h.id} type="button" className={h.id === selected?.id ? 'selected' : ''} onClick={() => setSelectedHeroId(h.id)}>
                  {heroDefById[h.defId].name.split(' ')[0]} · {h.movement} B
                </button>
              ))}
            </div>
            {selected && (
              <>
                <div className="small muted">Stufe {selected.level} · Erfahrung {selected.xp} · {selected.movement} Bewegung</div>
                <div className="col">{selected.army.map(s => <CreatureLine key={s.creatureId} stack={s} />)}</div>
                {selected.army.length === 0 && <span className="small error">Keine Armee.</span>}
                <div className="row">
                  {canDig && <button type="button" onClick={() => dispatch({ type: 'dig', heroId: selected.id })}>Nach dem Herzstein graben</button>}
                  {dwelling && activeIsMine && state.phase === 'hero' && dwelling.stock > 0 && (
                    <button type="button" onClick={() => dispatch({ type: 'recruitDwelling', heroId: selected.id, count: 1 })}>Aus Behausung rekrutieren ({dwelling.stock})</button>
                  )}
                  {hasPortal && activeIsMine && state.phase === 'hero' && myCities.map(x => (
                    <button key={x.id} type="button" disabled={selected.portalUsedWeek === state.week || selected.movement < 1} onClick={() => dispatch({ type: 'portal', heroId: selected.id, cityId: x.id })}>Stadtportal</button>
                  ))}
                </div>
                {holders.length > 1 && <details><summary className="small">Einheiten tauschen</summary><ArmyPanel holders={holders} onAction={dispatch} canAct={activeIsMine} /></details>}
              </>
            )}
          </section>
          <section className="panel col">
            <h3>Ruhmesleiste</h3>
            <FameBar state={state} />
          </section>
          <section className="panel col">
            <h3>Herzstein</h3>
            <span className="small muted">{state.heartstoneFound ? 'Der Herzstein ist geborgen.' : `Ausgeschlossen: ${me.hints.length} von 5 falschen Feldern.`}</span>
          </section>
          <section className="panel col">
            <h3>Ereignisprotokoll</h3>
            <div className="combat-log">
              {[...view.log].reverse().slice(0, 60).map((e, i) => <div key={view.log.length - i}><span className="muted small">W{e.week}</span> {e.text}</div>)}
            </div>
          </section>
        </aside>
      </div>
      {city && <CityScreen view={view} city={city} me={viewer} canAct={activeIsMine} onAction={dispatch} onClose={() => setCityId(null)} />}
      {heroWindow && selected && <HeroWindow view={view} hero={selected} onClose={() => setHeroWindow(false)} />}
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {leveling && <LevelUpModal hero={leveling} onChoose={(stat, skillId) => dispatch({ type: 'chooseLevelUp', heroId: leveling.id, stat, skillId })} />}
      {myTurn && view.guildOffer && <GuildModal options={view.guildOffer.options} onKeep={spellId => dispatch({ type: 'guildKeep', spellId })} />}
      {myTurn && view.encounter && (
        <EncounterModal view={view} encounter={view.encounter} showOdds={options.showOdds}
          setShowOdds={v => { const o = { ...options, showOdds: v }; setOptions(o); saveOptions(o); }}
          onFight={() => dispatch({ type: 'startEncounter' })} onDecline={() => dispatch({ type: 'declineEncounter' })} />
      )}
    </div>
  );
}
