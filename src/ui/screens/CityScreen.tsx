// Stadtbildschirm: Bauen, Rekrutieren, Markt, Heldenanwerbung, Magiergilde.
import { useState } from 'react';
import { BALANCE } from '../../config/balance';
import { availableGuildSpells, buildCost, buildableReason, recruitUnitCost } from '../../engine/city';
import { BUILDINGS, HEROES, creatureOfRealm, realmById, spellById } from '../../engine/content';
import { canAfford, heroAt, roomInArmy } from '../../engine/helpers';
import type { Action, BuildingId, City, GameState, Holder, PlayerId, ResourceKey, Tier } from '../../engine/types';
import { ArmyPanel, type ArmyHolder } from '../components/ArmyList';
import { CreatureIcon, Crest, RESOURCE_NAMES, ResourceIcon } from '../svg/icons';
import { ABILITY_NAMES, ROMAN, costText } from '../text';

const RESOURCES: ResourceKey[] = ['gold', 'material', 'crystal'];

interface Props { view: GameState; city: City; me: PlayerId; canAct: boolean; onAction: (a: Action) => void; onClose: () => void }

export function CityScreen({ view, city, me, canAct, onAction, onClose }: Props) {
  const player = view.players[me];
  const heroesHere = heroAt(view, city.pos).filter(h => h.owner === me);
  const [give, setGive] = useState<ResourceKey>('gold');
  const [get, setGet] = useState<ResourceKey>('crystal');
  const [counts, setCounts] = useState<Record<number, number>>({ 1: 1, 2: 1, 3: 1, 4: 1 });
  const [targetKey, setTargetKey] = useState<string>('');

  const holders: ArmyHolder[] = [
    ...heroesHere.map(h => ({ holder: { type: 'hero', id: h.id } as Holder, label: HEROES.find(d => d.id === h.defId)?.name ?? 'Held', army: h.army })),
    { holder: { type: 'city', id: city.id }, label: 'Garnison', army: city.garrison },
  ];
  const selected = holders.find(h => `${h.holder.type}:${h.holder.id}` === targetKey) ?? holders[0];
  const inCityPhase = canAct && view.phase === 'city';
  const myHeroCount = Object.values(view.heroes).filter(h => h.owner === me).length;
  const hireable = HEROES.filter(d => d.realm === player.realmId && !view.heroes[`p${me}_${d.id}`]);
  const heroForGuild = heroesHere.find(h => availableGuildSpells(city, h.spells).length > 0);

  return (
    <div className="modal-back" role="dialog" aria-label="Stadt">
      <div className="modal wide">
        <div className="spread">
          <div className="row">
            <Crest realmId={city.realmId} size={28} />
            <div>
              <h2>Hauptstadt von {view.players[city.originalOwner].name}</h2>
              <div className="small muted">{realmById[city.realmId].name}{city.owner !== city.originalOwner ? ` · erobert von ${view.players[city.owner].name}` : ''}</div>
            </div>
          </div>
          <button type="button" onClick={onClose}>Schließen</button>
        </div>
        {!inCityPhase && <p className="notice small">Bauen und Rekrutieren geht nur in der Stadtphase des aktiven Spielers. Einheiten tauschen ist jederzeit möglich.</p>}
        <div className="city-grid">
          <section className="panel col">
            <h3>Bauen {city.builtThisWeek && <span className="small muted">(diese Woche erledigt)</span>}</h3>
            {BUILDINGS.map(b => {
              const built = city.buildings.includes(b.id as BuildingId);
              const reason = buildableReason(view, city, b.id as BuildingId);
              return (
                <div key={b.id} className="spread build-row">
                  <div>
                    <strong>{b.name}</strong> <span className="small muted">{built ? 'gebaut' : costText(buildCost(view, b.id as BuildingId))}</span>
                    <div className="small muted">{b.description}</div>
                  </div>
                  {!built && (
                    <button type="button" disabled={!inCityPhase || reason !== null} title={reason ?? 'Bauen'} onClick={() => onAction({ type: 'build', cityId: city.id, building: b.id as BuildingId })}>Bauen</button>
                  )}
                </div>
              );
            })}
          </section>
          <section className="panel col">
            <h3>Rekrutieren</h3>
            <label className="row small">Ziel
              <select value={selected ? `${selected.holder.type}:${selected.holder.id}` : ''} onChange={e => setTargetKey(e.target.value)}>
                {holders.map(h => <option key={h.label} value={`${h.holder.type}:${h.holder.id}`}>{h.label}</option>)}
              </select>
            </label>
            {([1, 2, 3, 4] as Tier[]).map(tier => {
              if (!city.buildings.includes(`dwelling${tier}` as BuildingId)) {
                return <div key={tier} className="small muted">Stufe {ROMAN[tier]}: Behausung fehlt</div>;
              }
              const c = creatureOfRealm(city.realmId, tier);
              const t = BALANCE.tiers[tier];
              const cost = recruitUnitCost(view, tier);
              const room = selected ? roomInArmy(selected.army, c.id) : 0;
              const unitsCanPay = canAfford(player.resources, cost)
                ? Math.min(cost.gold ? Math.floor(player.resources.gold / cost.gold) : 99, cost.crystal ? Math.floor(player.resources.crystal / cost.crystal) : 99) : 0;
              const max = Math.min(city.stock[tier], room, unitsCanPay);
              const n = Math.max(1, Math.min(counts[tier] ?? 1, Math.max(max, 1)));
              return (
                <div key={tier} className="recruit-row">
                  <CreatureIcon icon={c.icon} size={28} />
                  <div>
                    <strong>{c.name}</strong> <span className="small muted">Stufe {ROMAN[tier]}{c.abilities.length ? ` · ${c.abilities.map(a => ABILITY_NAMES[a]).join(', ')}` : ''}</span>
                    <div className="small muted">{t.dice} Würfel · {t.damage} Schaden · {t.hp} LP · Tempo {t.speed} · {costText(cost)}</div>
                    <div className="small">Vorrat: {city.stock[tier]}</div>
                  </div>
                  <div className="row">
                    <input type="number" aria-label={`Anzahl ${c.name}`} min={1} max={Math.max(max, 1)} value={n} onChange={e => setCounts({ ...counts, [tier]: Number(e.target.value) })} disabled={!inCityPhase || max <= 0} />
                    <button type="button" className="mini" disabled={!inCityPhase || max <= 0} onClick={() => setCounts({ ...counts, [tier]: max })}>Max</button>
                    <button type="button" disabled={!inCityPhase || max <= 0 || !selected} onClick={() => onAction({ type: 'recruit', cityId: city.id, tier, count: n, to: selected.holder })}>Rekrutieren</button>
                  </div>
                </div>
              );
            })}
          </section>
          <section className="panel col">
            <h3>Truppen in der Stadt</h3>
            <ArmyPanel holders={holders} onAction={onAction} canAct={canAct} />
          </section>
          <section className="panel col">
            <h3>Markt</h3>
            {city.buildings.includes('market') ? (
              <div className="row small">
                <label className="row">{BALANCE.marketRate}
                  <select value={give} onChange={e => setGive(e.target.value as ResourceKey)}>{RESOURCES.map(r => <option key={r} value={r}>{RESOURCE_NAMES[r]}</option>)}</select>
                </label>
                <label className="row">→ 1
                  <select value={get} onChange={e => setGet(e.target.value as ResourceKey)}>{RESOURCES.map(r => <option key={r} value={r}>{RESOURCE_NAMES[r]}</option>)}</select>
                </label>
                <ResourceIcon resource={get} />
                <button type="button" disabled={!inCityPhase || give === get || player.resources[give] < BALANCE.marketRate} onClick={() => onAction({ type: 'trade', cityId: city.id, give, get })}>Tauschen</button>
              </div>
            ) : <span className="small muted">Noch kein Markt gebaut.</span>}
            <h3>Magiergilde</h3>
            {city.buildings.includes('guild') ? (
              <div className="col small">
                {heroesHere.length === 0 && <span className="muted">Es muss ein Held in der Stadt sein.</span>}
                {heroesHere.map(h => <span key={h.id} className="muted">{HEROES.find(d => d.id === h.defId)?.name}: {h.spells.map(s => spellById[s].name).join(', ') || 'noch keine Zauber'}</span>)}
                <button type="button" disabled={!inCityPhase || !heroForGuild || city.guildUsedWeek === view.week} onClick={() => heroForGuild && onAction({ type: 'guildDraw', cityId: city.id, heroId: heroForGuild.id })}>
                  {city.guildUsedWeek === view.week ? 'Diese Woche genutzt' : 'Zauber ziehen'}
                </button>
              </div>
            ) : <span className="small muted">Noch keine Magiergilde gebaut.</span>}
            <h3>Zweiter Held</h3>
            {myHeroCount >= BALANCE.maxHeroes ? <span className="small muted">Du führst bereits {BALANCE.maxHeroes} Helden.</span> : hireable.map(d => (
              <div key={d.id} className="spread">
                <span className="small"><strong>{d.name}</strong> A {d.attack} / V {d.defense} / M {d.magic}<br /><span className="muted">{d.specialty.name}: {d.specialty.description}</span></span>
                <button type="button" disabled={!inCityPhase || player.resources.gold < BALANCE.secondHeroCost} onClick={() => onAction({ type: 'hireHero', cityId: city.id, defId: d.id })}>{BALANCE.secondHeroCost} G</button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
