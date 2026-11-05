// Startaufstellung einer Partie.
import { BALANCE } from '../config/balance';
import { HEROES, WEEK_CARDS, creatureOfRealm, heroDefById } from './content';
import { RuleError } from './errors';
import { hexKey } from './hex';
import { generateMap } from './map';
import { randInt, shuffle } from './rng';
import type { City, GameState, Hero, Hex, Player, PlayerId, PlayerSetup, Tier } from './types';

export function makeHero(defId: string, owner: PlayerId, pos: Hex): Hero {
  const def = heroDefById[defId];
  return {
    id: `p${owner}_${defId}`, defId, owner, pos: { ...pos }, level: 1, xp: 0,
    attack: def.attack, defense: def.defense, magic: def.magic,
    movement: BALANCE.movementPerWeek, army: [], artifacts: [], spells: def.startSpell ? [def.startSpell] : [], skills: [],
    portalUsedWeek: 0, levelUp: null,
  };
}

export function createGame(seed: number, setups: PlayerSetup[]): GameState {
  if (setups.length < BALANCE.minPlayers || setups.length > BALANCE.maxPlayers) {
    throw new RuleError(`Es spielen ${BALANCE.minPlayers} bis ${BALANCE.maxPlayers} Spieler.`);
  }
  const h = { rng: seed | 0 };
  const map = generateMap(h, setups.length);
  const players: Player[] = setups.map((p, id) => ({
    id, name: p.name, realmId: p.realmId, control: p.control,
    resources: { ...BALANCE.startResources },
    fame: { guardian: 0, heroWin: 0, heartstone: 0, heart: 0 },
    hints: [], eliminated: false,
  }));
  const heroes: Record<string, Hero> = {};
  const cities: Record<string, City> = {};
  players.forEach((p, id) => {
    const home = map.homes[id];
    const stock: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const tier of [1, 2, 3, 4] as Tier[]) {
      if (BALANCE.startBuildings.includes(`dwelling${tier}` as City['buildings'][number])) {
        stock[tier] = BALANCE.growth[tier] * BALANCE.startStockWeeks;
      }
    }
    // ANNAHME: Es gibt nur die Hauptstädte der Spieler, keine neutralen Städte.
    // ANNAHME: Neu gebaute Behausungen starten leer und wachsen ab dem nächsten Wochenwechsel.
    cities[`c${id}`] = {
      id: `c${id}`, owner: id, originalOwner: id, realmId: p.realmId, pos: home,
      buildings: [...BALANCE.startBuildings], builtThisWeek: false, stock, garrison: [], guildUsedWeek: 0,
    };
    const defs = HEROES.filter(d => d.realm === p.realmId);
    const hero = makeHero(defs[randInt(h, defs.length)].id, id, home);
    hero.army = BALANCE.startArmy.map(a => ({ creatureId: creatureOfRealm(p.realmId, a.tier).id, count: a.count }));
    heroes[hero.id] = hero;
    map.tiles[hexKey(home)].revealedBy.push(id);
  });
  const deck = shuffle(h, WEEK_CARDS.map(c => c.id));
  const weekCardId = deck.pop() as string;
  const order = shuffle(h, players.map(p => p.id));
  return {
    seed, rng: h.rng, actionCount: 0, week: 1, order, activeIndex: 0, phase: 'city',
    radius: BALANCE.map.radiusByPlayers[setups.length], weekCardId, weekDeck: deck,
    tiles: map.tiles, heartstone: map.heartstone, heartstoneFound: false,
    players, heroes, cities, encounter: null, combat: null, guildOffer: null,
    log: [{ week: 1, text: `Partie beginnt (Seed ${seed}).`, players: 'all' }],
    winners: null, endReason: null,
  };
}
