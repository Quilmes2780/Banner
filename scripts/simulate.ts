// KI-gegen-KI-Reihen: npm run simulate -- --games 200 --level ai-normal --out reports/simulation
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { playAiGame } from '../src/ai';
import { REALMS, realmById } from '../src/engine/content';
import { fameBreakdown, totalFame } from '../src/engine/scoring';
import { shuffle } from '../src/engine/rng';
import type { Control, FameSource, GameState, PlayerSetup } from '../src/engine/types';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const GAMES = Number(arg('games', '200'));
const LEVEL = arg('level', 'ai-normal') as Control;
const OUT = arg('out', '');
const COUNTS = arg('players', '2,3,4').split(',').map(Number);
const BASE_SEED = Number(arg('seed', '1000'));

const SOURCES: FameSource[] = ['guardian', 'heroWin', 'heartstone', 'heart', 'city', 'capturedCapital', 'capitol', 'mine', 'heroLevel', 'artifact', 'armyLevels'];
const SOURCE_NAMES: Record<FameSource, string> = {
  guardian: 'Wächter', heroWin: 'Heldensiege', heartstone: 'Herzstein', heart: 'Herz', city: 'Eigene Stadt', capturedCapital: 'Eroberte Hauptstadt',
  capitol: 'Kapitol', mine: 'Minen', heroLevel: 'Heldenstufen', artifact: 'Artefakte', armyLevels: 'Einheiten-Stufen',
};

interface Stats {
  players: number; games: number;
  realmGames: Record<string, number>; realmWins: Record<string, number>;
  seatGames: number[]; seatWins: number[];
  fame: Record<FameSource, number>; fameTotal: number; winnerFame: number; playerGames: number;
  conquest: number;
  leaderKnown: number; leaderWins: number; leaderTies: number;
  soloLeaders: number; soloWins: number;
  capitols: number; heroWins: number; mineCount: number; ms: number; actions: number; heartstone: number;
  eliminated: number;
}

function runCount(players: number): Stats {
  const stats: Stats = {
    players, games: 0, realmGames: {}, realmWins: {}, seatGames: Array(players).fill(0), seatWins: Array(players).fill(0),
    fame: Object.fromEntries(SOURCES.map(k => [k, 0])) as Record<FameSource, number>, fameTotal: 0, winnerFame: 0, playerGames: 0,
    conquest: 0, leaderKnown: 0, leaderWins: 0, leaderTies: 0, soloLeaders: 0, soloWins: 0,
    capitols: 0, heroWins: 0, mineCount: 0, ms: 0, actions: 0, heartstone: 0, eliminated: 0,
  };
  const start = Date.now();
  for (let g = 0; g < GAMES; g++) {
    const seed = BASE_SEED + players * 100000 + g;
    const h = { rng: seed ^ 0x5bd1e995 };
    // Zufällige Reiche, jedes höchstens einmal je Partie.
    const realms = shuffle(h, REALMS.map(r => r.id)).slice(0, players);
    const setups: PlayerSetup[] = realms.map((realmId, i) => ({ name: `KI ${i + 1}`, realmId, control: LEVEL }));
    const { final, afterWeek } = playAiGame(seed, setups, [4]);
    collect(stats, final, afterWeek[4]);
  }
  stats.ms = Date.now() - start;
  return stats;
}

function collect(st: Stats, final: GameState, week4: GameState | undefined): void {
  st.games += 1;
  st.actions += final.actionCount;
  const winners = final.winners ?? [];
  if (final.endReason === 'conquest') st.conquest += 1;
  if (final.heartstoneFound) st.heartstone += 1;
  for (const p of final.players) {
    const b = fameBreakdown(final, p.id);
    st.realmGames[p.realmId] = (st.realmGames[p.realmId] ?? 0) + 1;
    st.seatGames[p.id] += 1;
    if (p.eliminated) st.eliminated += 1;
    if (winners.includes(p.id)) {
      st.realmWins[p.realmId] = (st.realmWins[p.realmId] ?? 0) + 1 / winners.length;
      st.seatWins[p.id] += 1 / winners.length;
      st.winnerFame += b.total / winners.length;
    }
    for (const s of SOURCES) st.fame[s] += b[s];
    st.fameTotal += b.total;
    st.playerGames += 1;
    st.capitols += Object.values(final.cities).filter(c => c.owner === p.id && c.buildings.includes('capitol')).length;
    st.mineCount += b.mine;
    st.heroWins += p.fame.heroWin / 3;
  }
  if (week4) {
    const totals = week4.players.map(p => totalFame(week4, p.id));
    const best = Math.max(...totals);
    const leaders = week4.players.filter(p => totals[p.id] === best).map(p => p.id);
    st.leaderKnown += 1;
    if (leaders.length > 1) st.leaderTies += 1;
    if (leaders.length === 1) {
      st.soloLeaders += 1;
      if (winners.includes(leaders[0])) st.soloWins += 1 / winners.length;
    }
    // Faire Zählung auch bei geteilter Führung
    st.leaderWins += leaders.filter(l => winners.includes(l)).length / (leaders.length * Math.max(1, winners.filter(w => leaders.includes(w)).length));
  }
}

const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;

function report(all: Stats[]): string {
  const lines: string[] = [`# Simulation Banner der Reiche`, '', `${GAMES} Partien je Spielerzahl, KI-Stufe ${LEVEL}, Basis-Seed ${BASE_SEED}.`, ''];
  lines.push('## Siegquote je Reich', '', `| Reich | ${all.map(s => `${s.players} Spieler`).join(' | ')} |`, `|---|${all.map(() => '---').join('|')}|`);
  for (const r of REALMS) {
    lines.push(`| ${realmById[r.id].name} | ${all.map(s => (s.realmGames[r.id] ? `${pct((s.realmWins[r.id] ?? 0) / s.realmGames[r.id])} (${s.realmGames[r.id]})` : '–')).join(' | ')} |`);
  }
  lines.push('', 'In Klammern die Zahl der Partien, in denen das Reich mitspielte. Fairer Wert: 50 / 33 / 25 %.', '');
  lines.push('## Siegquote je Sitzplatz', '', `| Spielerzahl | ${[1, 2, 3, 4].map(n => `Platz ${n}`).join(' | ')} |`, '|---|---|---|---|---|');
  for (const s of all) lines.push(`| ${s.players} | ${[0, 1, 2, 3].map(i => (i < s.players ? pct(s.seatWins[i] / s.seatGames[i]) : '–')).join(' | ')} |`);
  lines.push('', '## Durchschnittlicher Ruhm je Spieler und Partie, nach Quelle', '', `| Quelle | ${all.map(s => `${s.players} Spieler`).join(' | ')} |`, `|---|${all.map(() => '---').join('|')}|`);
  for (const k of SOURCES) lines.push(`| ${SOURCE_NAMES[k]} | ${all.map(s => `${(s.fame[k] / s.playerGames).toFixed(2)} (${pct(s.fame[k] / Math.max(1, s.fameTotal))})`).join(' | ')} |`);
  lines.push(`| **Summe** | ${all.map(s => `**${(s.fameTotal / s.playerGames).toFixed(2)}**`).join(' | ')} |`);
  lines.push(`| Ruhm des Siegers | ${all.map(s => (s.winnerFame / s.games).toFixed(2)).join(' | ')} |`);
  lines.push('', '## Sofortsieg und Schneeball-Test', '', `| Kennzahl | ${all.map(s => `${s.players} Spieler`).join(' | ')} |`, `|---|${all.map(() => '---').join('|')}|`);
  lines.push(`| Anteil Partien mit Sofortsieg | ${all.map(s => pct(s.conquest / s.games)).join(' | ')} |`);
  lines.push(`| Partien, die Woche 4 überstanden | ${all.map(s => `${s.leaderKnown}`).join(' | ')} |`);
  lines.push(`| Alleiniger Führender nach Woche 4 | ${all.map(s => `${s.soloLeaders}`).join(' | ')} |`);
  lines.push(`| **Siegquote des alleinigen Führenden** | ${all.map(s => `**${s.soloLeaders ? pct(s.soloWins / s.soloLeaders) : '–'}**`).join(' | ')} |`);
  lines.push(`| Siegquote bei Zufall | ${all.map(s => pct(1 / s.players)).join(' | ')} |`);
  lines.push('', '## Weitere Kennzahlen', '', `| Kennzahl | ${all.map(s => `${s.players} Spieler`).join(' | ')} |`, `|---|${all.map(() => '---').join('|')}|`);
  lines.push(`| Herzstein gefunden | ${all.map(s => pct(s.heartstone / s.games)).join(' | ')} |`);
  lines.push(`| Kapitole je Partie | ${all.map(s => (s.capitols / s.games).toFixed(2)).join(' | ')} |`);
  lines.push(`| Heldensiege je Partie | ${all.map(s => (s.heroWins / s.games).toFixed(2)).join(' | ')} |`);
  lines.push(`| Minen je Spieler am Ende | ${all.map(s => (s.mineCount / s.playerGames).toFixed(2)).join(' | ')} |`);
  lines.push(`| Ausgeschiedene Spieler je Partie | ${all.map(s => (s.eliminated / s.games).toFixed(2)).join(' | ')} |`);
  lines.push(`| Rechenzeit je Partie | ${all.map(s => `${(s.ms / s.games / 1000).toFixed(2)} s`).join(' | ')} |`);
  return lines.join('\n') + '\n';
}

const results = COUNTS.map(runCount);
const text = report(results);
console.log(text);
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(`${OUT}.md`, text);
  writeFileSync(`${OUT}.json`, JSON.stringify(results, null, 2));
}
