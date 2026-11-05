// Zentrale reine Funktion: (Zustand, Aktion) -> neuer Zustand.
import { combatReducer } from './combat/combat';
import {
  applyBuild, applyGuildDraw, applyGuildKeep, applyHire, applyRecruit, applyRecruitDwelling, applyTrade, applyTransfer,
} from './city';
import { declineEncounter, finishCombat, startEncounter } from './encounter';
import { RuleError } from './errors';
import { applyLevelUp, applyPortal } from './hero';
import { applyDig, applyMove } from './movement';
import { advanceTurn } from './week';
import type { Action, GameState } from './types';

function assertFree(s: GameState, a: Action): void {
  if (s.phase === 'ended') throw new RuleError('Die Partie ist beendet.');
  if (s.combat && a.type !== 'combat' && a.type !== 'finishCombat') throw new RuleError('Erst den Kampf beenden.');
  if (s.encounter && a.type !== 'startEncounter' && a.type !== 'declineEncounter') throw new RuleError('Erst die Begegnung entscheiden.');
  if (s.guildOffer && a.type !== 'guildKeep') throw new RuleError('Erst einen Zauber aus der Gilde wählen.');
  if (!s.combat && a.type !== 'chooseLevelUp' && Object.values(s.heroes).some(h => h.levelUp)) {
    throw new RuleError('Erst den Aufstieg des Helden entscheiden.');
  }
}

export function applyAction(state: GameState, a: Action): GameState {
  assertFree(state, a);
  const s = structuredClone(state);
  s.actionCount += 1;
  switch (a.type) {
    case 'build': applyBuild(s, a.cityId, a.building); break;
    case 'recruit': applyRecruit(s, a.cityId, a.tier, a.count, a.to); break;
    case 'recruitDwelling': applyRecruitDwelling(s, a.heroId, a.count); break;
    case 'trade': applyTrade(s, a.cityId, a.give, a.get); break;
    case 'hireHero': applyHire(s, a.cityId, a.defId); break;
    case 'guildDraw': applyGuildDraw(s, a.cityId, a.heroId); break;
    case 'guildKeep': applyGuildKeep(s, a.spellId); break;
    case 'endCityPhase':
      if (s.phase !== 'city') throw new RuleError('Es läuft keine Stadtphase.');
      s.phase = 'hero';
      break;
    case 'move': applyMove(s, a.heroId, a.path); break;
    case 'startEncounter': startEncounter(s); break;
    case 'declineEncounter': declineEncounter(s); break;
    case 'dig': applyDig(s, a.heroId); break;
    case 'transfer': applyTransfer(s, a.from, a.to, a.creatureId, a.count); break;
    case 'chooseLevelUp': applyLevelUp(s, a.heroId, a.stat, a.skillId); break;
    case 'portal': applyPortal(s, a.heroId, a.cityId); break;
    case 'endHeroPhase':
      if (s.phase !== 'hero') throw new RuleError('Es läuft keine Heldenphase.');
      advanceTurn(s);
      break;
    case 'combat':
      if (!s.combat) throw new RuleError('Es läuft kein Kampf.');
      s.combat.state = combatReducer(s.combat.state, a.action);
      break;
    case 'finishCombat': finishCombat(s); break;
  }
  return s;
}
