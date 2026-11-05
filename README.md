# Banner der Reiche

Browser-Umsetzung des Brettspiels: rundenbasierte Fantasy-Strategie mit Erkundung, Städtebau, Helden und taktischem Kampf. Hotseat für 2 bis 4 Plätze, jeder Platz Mensch oder KI. Keine Server-Komponente.

## Online spielen

[quilmes2780.github.io/Banner](https://quilmes2780.github.io/Banner/). Jeder Push auf `main` testet, baut und veröffentlicht das Spiel über GitHub Actions.

## Lokal starten

```bash
npm install
```

```bash
npm run dev
```

Danach `http://localhost:5173` öffnen.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm test` | Alle Vitest-Regeltests |
| `npm run typecheck` | TypeScript prüfen |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run simulate -- --games 200 --out reports/simulation` | KI-gegen-KI-Reihen auswerten |

Optionen für `simulate`: `--level ai-easy|ai-normal|ai-hard`, `--players 2,3,4`, `--seed 1000`.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/engine` | Regeln als reine Funktionen: `applyAction(state, action)` und `combatReducer(combat, action)`. Keine UI-Abhängigkeit. |
| `src/ai` | KI: Zielbewertung, Stadtplanung, Monte-Carlo-Kampfrisiko. Liest nur `playerView`. |
| `src/ui` | React-Oberfläche, rendert nur und meldet Aktionen. |
| `src/config/balance.ts` | Alle Zahlenwerte. |
| `src/content/*.json` | Reiche, Kreaturen, Gebäude, Helden, Zauber, Fertigkeiten, Artefakte, Wächter, Wochenkarten. |
| `tests` | Regeltests, benannt nach Regelnummer. |
| `scripts/simulate.ts` | Auswertung über viele Partien. |

Regel-Annahmen stehen in [ANNAHMEN.md](ANNAHMEN.md), im Code sind sie mit `// ANNAHME` markiert.
