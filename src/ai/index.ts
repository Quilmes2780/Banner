// Einstieg der KI: bestimmt die nächste Aktion des entscheidenden Spielers.
import { BALANCE } from '../config/balance';
import { autoCombatAction } from '../engine/combat/policy';
import { creatureOfRealm, skillById } from '../engine/content';
import { currentDecider } from '../engine/encounter';
import { armyUnits, canAfford, effectiveStat, heroesOf, roomInArmy, tileAt } from '../engine/helpers';
import { recruitUnitCost } from '../engine/city';
import { rand, deriveSeed, type RngHolder } from '../engine/rng';
import { applyAction } from '../engine/reducer';
import { createGame } from '../engine/setup';
import { playerView } from '../engine/view';
import type { Action, Control, GameState, Hero, HeroStat, PlayerId, PlayerSetup } from '../engine/types';
import { cityAction, pickSpell, type DifficultyProfile } from './cityPlanner';
import { chooseTarget, shouldDig } from './evaluate';
import { encounterOdds } from './simulate';

const PROFILE: Record<Exclude<Control, 'human'>, DifficultyProfile> = {
  'ai-easy': BALANCE.ai.easy,
  'ai-normal': BALANCE.ai.normal,
  'ai-hard': BALANCE.ai.hard,
};

function profileOf(control: Control): DifficultyProfile {
  return control === 'human' ? BALANCE.ai.normal : PROFILE[control];
}

function levelUpAction(view: GameState, hero: Hero): Action {
  const stats: HeroStat[] = ['attack', 'defense'];
  const stat = effectiveStat(view, hero, 'attack') <= effectiveStat(view, hero, 'defense') ? stats[0] : stats[1];
  const options = hero.levelUp as string[];
  // Direkte Kampfwerte vor Komfort.
  const worth = (id: string): number => {
    const e = skillById[id].effects[0];
    if (e.type === 'stat') return e.stat === 'magic' ? (hero.spells.length > 0 ? 2 : 0) : 3;
    if (e.type === 'tierDice') return 3;
    if (e.type === 'movement') return 2;
    return 1;
  };
  const skillId = [...options].sort((a, b) => worth(b) - worth(a))[0];
  return { type: 'chooseLevelUp', heroId: hero.id, stat, skillId };
}

function heroAction(view: GameState, me: PlayerId, profile: DifficultyProfile, rng: RngHolder): Action {
  const heroes = heroesOf(view, me).sort((a, b) => armyUnits(b.army) - armyUnits(a.army));
  for (const hero of heroes) {
    const tile = tileAt(view, hero.pos);
    if (tile?.content?.kind === 'dwelling' && tile.content.stock > 0) {
      const creature = creatureOfRealm(view.players[me].realmId, tile.content.tier).id;
      const cost = recruitUnitCost(view, tile.content.tier);
      const room = roomInArmy(hero.army, creature);
      const each = cost.gold ?? 1;
      const affordable = canAfford(view.players[me].resources, cost) ? Math.floor(view.players[me].resources.gold / Math.max(1, each)) : 0;
      const count = Math.min(room, tile.content.stock, affordable);
      if (count > 0) return { type: 'recruitDwelling', heroId: hero.id, count };
    }
    if (hero.movement < 1) continue;
    if (profile.idleChance > 0 && rand(rng) < profile.idleChance) continue;
    if (shouldDig(view, hero)) return { type: 'dig', heroId: hero.id };
    const choice = chooseTarget(view, hero, profile, () => rand(rng) * 2 - 1);
    if (!choice) continue;
    const { path } = choice.candidate;
    const steps = path.path.slice(0, path.affordableSteps);
    if (steps.length === 0) continue;
    return { type: 'move', heroId: hero.id, path: steps };
  }
  return { type: 'endHeroPhase' };
}

/** Bestimmt die nächste Aktion. Rein: dieselbe Eingabe ergibt dieselbe Aktion. */
export function aiAction(state: GameState): Action {
  const me = currentDecider(state) as PlayerId;
  const view = playerView(state, me);
  const profile = profileOf(state.players[me].control);
  const rng: RngHolder = { rng: deriveSeed(state.seed, state.actionCount, me) };

  if (view.combat) {
    if (view.combat.state.step === 'done') return { type: 'finishCombat' };
    return { type: 'combat', action: autoCombatAction(view.combat.state, { allowFlee: true }) };
  }
  const leveling = heroesOf(view, me).find(h => h.levelUp);
  if (leveling) return levelUpAction(view, leveling);
  if (view.guildOffer) return { type: 'guildKeep', spellId: pickSpell(view.guildOffer.options) };
  if (view.encounter) {
    const e = view.encounter;
    const hero = view.heroes[e.heroId];
    if (armyUnits(hero.army) === 0) return { type: 'declineEncounter' };
    // Auf bekannte Ziele hat sich die KI schon festgelegt; Verdecktes wird jetzt neu bewertet.
    if (e.moveCost > 0) return { type: 'startEncounter' };
    return encounterOdds(view, e, profile.sims).winRate >= profile.minWin ? { type: 'startEncounter' } : { type: 'declineEncounter' };
  }
  if (view.phase === 'city') return cityAction(view, me, profile, () => rand(rng));
  return heroAction(view, me, profile, rng);
}

export interface PlayedGame { final: GameState; afterWeek: Record<number, GameState> }

/** Spielt eine Partie nur mit KI zu Ende. */
export function playAiGame(seed: number, setups: PlayerSetup[], snapshotWeeks: number[] = []): PlayedGame {
  let s = createGame(seed, setups);
  const afterWeek: Record<number, GameState> = {};
  let lastWeek = s.week;
  for (let i = 0; s.phase !== 'ended'; i++) {
    if (i > 200000) throw new Error(`Partie mit Seed ${seed} endet nicht.`);
    s = applyAction(s, aiAction(s));
    if (s.week !== lastWeek) {
      if (snapshotWeeks.includes(lastWeek)) afterWeek[lastWeek] = s;
      lastWeek = s.week;
    }
  }
  return { final: s, afterWeek };
}
