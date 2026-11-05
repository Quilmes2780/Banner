// Erfahrung, Aufstieg, Hinweise, Stadtportal (Regeln 3, 6, 8).
import { BALANCE } from '../config/balance';
import { SKILLS, spellById } from './content';
import { RuleError } from './errors';
import { hexKey, neighbors } from './hex';
import { getCity, getHero, heroEffects, log } from './helpers';
import { randInt, shuffle } from './rng';
import type { GameState, Hero, HeroStat, PlayerId } from './types';

/** Regel 6: Stufe aus den Schwellen 4/9/15/22. ANNAHME: Den Wert für +1 wählt der Spieler selbst. */
export function levelForXp(xp: number): number {
  return 1 + BALANCE.levelThresholds.filter(t => xp >= t).length;
}

function checkLevelUp(s: GameState, hero: Hero): void {
  if (hero.levelUp || levelForXp(hero.xp) <= hero.level) return;
  hero.level += 1;
  const available = SKILLS.filter(k => !hero.skills.includes(k.id)).map(k => k.id);
  hero.levelUp = shuffle(s, available).slice(0, BALANCE.skillChoices);
  log(s, `${s.players[hero.owner].name}: Held steigt auf Stufe ${hero.level} auf.`);
}

export function addXp(s: GameState, hero: Hero, amount: number): void {
  if (amount <= 0) return;
  const bonus = heroEffects(s, hero).reduce((v, e) => (e.type === 'xpBonus' ? v + e.value : v), 0);
  hero.xp += amount + bonus;
  checkLevelUp(s, hero);
}

export function applyLevelUp(s: GameState, heroId: string, stat: HeroStat, skillId: string): void {
  const hero = getHero(s, heroId);
  if (!hero.levelUp) throw new RuleError('Für diesen Helden steht kein Aufstieg an.');
  if (!hero.levelUp.includes(skillId)) throw new RuleError('Diese Fertigkeit steht nicht zur Wahl.');
  if (!['attack', 'defense', 'magic'].includes(stat)) throw new RuleError('Unbekannter Wert.');
  hero[stat] += 1;
  hero.skills.push(skillId);
  hero.levelUp = null;
  checkLevelUp(s, hero);
}

/** Regel 3: Hinweis schließt ein falsches Herzstein-Feld aus. ANNAHME (privat, kein Doppel). */
export function addHint(s: GameState, playerId: PlayerId): void {
  const player = s.players[playerId];
  const wrong = neighbors({ q: 0, r: 0 }).map(hexKey).filter(k => k !== s.heartstone && !player.hints.includes(k));
  if (wrong.length === 0) {
    log(s, `${player.name} erhält keinen neuen Hinweis: Der Herzstein ist bereits eindeutig.`, [playerId]);
    return;
  }
  const key = wrong[randInt(s, wrong.length)];
  player.hints.push(key);
  log(s, `${player.name} erfährt: Unter Feld ${key} liegt der Herzstein nicht.`, [playerId]);
}

/** Regel 8: Stadtportal. ANNAHME: Einmal pro Woche, braucht Bewegung, verbraucht den Rest. */
export function applyPortal(s: GameState, heroId: string, cityId: string): void {
  if (s.phase !== 'hero') throw new RuleError('Das Portal wirkt nur in der Heldenphase.');
  const hero = getHero(s, heroId);
  if (hero.owner !== s.order[s.activeIndex]) throw new RuleError('Dieser Held gehört nicht dem aktiven Spieler.');
  if (!hero.spells.some(id => spellById[id].kind === 'portal')) throw new RuleError('Der Held kennt das Stadtportal nicht.');
  if (hero.portalUsedWeek === s.week) throw new RuleError('Das Portal wurde diese Woche bereits genutzt.');
  if (hero.movement < 1) throw new RuleError('Der Held hat keine Bewegung mehr.');
  const city = getCity(s, cityId);
  if (city.owner !== hero.owner) throw new RuleError('Das Portal führt nur in eigene Städte.');
  hero.pos = { ...city.pos };
  hero.movement = 0;
  hero.portalUsedWeek = s.week;
  log(s, `${s.players[hero.owner].name} reist durch ein Stadtportal.`, [hero.owner]);
}
