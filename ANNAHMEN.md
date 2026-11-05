# Regel-Annahmen

Hier stehen alle Lücken, die die Regeln offen ließen. Im Code sind sie mit `// ANNAHME` markiert, die Zahlenwerte stehen in `src/config/balance.ts`.

## Im Plan freigegeben

| # | Thema | Annahme |
|---|---|---|
| 1 | Aufdecken | Felder werden pro Spieler aufgedeckt, nicht für alle. |
| 2 | Verdeckte Felder | Die Pfadvorschau zeigt „?“. Zum Betreten reicht 1 Bewegung; kostet das Feld mehr, verfällt der Rest. |
| 3 | Kampfbewegung | Ein Stapel darf statt anzugreifen 1 Feld auf der eigenen Seite ziehen. |
| 4 | Start | Der Held startet mit 4× Stufe I und 2× Stufe II. Behausungen starten mit einem Wochenwachstum. |
| 5 | Wächterwerte | Wächter haben Angriff/Verteidigung 0/0, 1/1 oder 2/2 je Stufe. Helden starten je nach Reich um 1/1. |

## Karte und Bewegung

- Radius 4 bei 2 und 3 Spielern, Radius 5 bei 4 Spielern; Heimatfelder auf den Ecken des Bretts.
- Ringstufen: ganz außen Stufe I, davor Stufe II, die 6 Felder ums Zentrum Stufe III. Bei Radius 5 sind die beiden äußeren Ringe Stufe I.
- Inhaltsdichte je Ring, Geländeverteilung und Schatzwerte sind eigene Vorschläge; mindestens 3 Obelisken und 2 Schreine.
- Jede Heimat hat eine Gold- und eine Baustoffmine als Nachbarfeld.
- Nach dem Aufdecken eines Feldes endet der Pfad, der Spieler entscheidet neu.
- Auf einem Feld steht höchstens ein eigener Held, außer in eigenen Städten.
- Vor einem Kampf darf der Held ausweichen. Auf bekannten Feldern wird die Bewegung erst beim Kampf fällig, auf verdeckten ist sie schon bezahlt.
- Volle Artefaktplätze: 3 Gold statt des Artefakts.
- Umland-Behausung: rekrutiert in der Heldenphase für den Helden auf dem Feld, jeweils Kreaturen des eigenen Reichs. Wächst wie eine Stadtbehausung.

## Herzstein

- Jeder Hinweis schließt privat ein falsches Feld aus, nie doppelt.
- Graben geht nur auf den 6 Feldern ums Zentrum und kostet alle restliche Bewegung. Ein Fehlversuch schließt das Feld für den Spieler aus.
- Das Herz zählt als Stufe-III-Wächter: 3 Ruhm und 6 Erfahrung, dazu 2 Ruhm und 2 Hinweise.

## Städte und Wirtschaft

- Es gibt nur die Hauptstädte der Spieler, keine neutralen Städte.
- Das Kapitol ersetzt das Rathaus-Einkommen: 8 statt 4 Gold, nicht 12.
- Rekrutierte Einheiten gehen zum Helden in der Stadt oder in eine Garnison mit höchstens 3 Stapeln.
- Eroberte Städte rekrutieren weiter die Kreaturen ihres Ursprungsreichs.
- Neu gebaute Behausungen starten leer und wachsen ab dem nächsten Wochenwechsel.
- Vorratsgrenze: das Doppelte des Grundwachstums, ohne Wochenkarte.
- Je Kreaturenart gibt es einen Stapel.
- Wochenkarten gelten die ganze Woche; Einkommen und Wachstum am Wochenende nutzen noch die laufende Karte. In den Regeln nicht aufgeführt, daher 12 eigene Karten.

## Helden

- Höchstens 2 Helden je Spieler.
- Den Wert für +1 beim Aufstieg wählt der Spieler selbst.
- Die 8 Helden, 10 Fertigkeiten und 10 Artefakte sind eigene Inhalte.
- Keine Startzauber; Zauber kommen von Schreinen und der Gilde.
- Keine Spezialität gibt +1 Bewegung: In Simulationen gewann ein solcher Held 38–44 % der 4-Spieler-Partien (fair: 25 %).
- Stufe-I-Kreaturen der Reiche haben keine Sonderfähigkeit.

## Kampf

- Fernkampf -1 heißt Trefferschwelle +1; „gegenüber“ heißt vorn in derselben Reihe.
- Die Reihenbeschränkung gilt auch, wenn die vordere gegnerische Linie leer ist.
- „Schnell“: Der Angreifer erhält keinen Rückschlag.
- „Heilen“: statt anzugreifen; je Heiler 1 LP, zuerst Restschaden, dann Gefallene, höchstens bis zur Anfangsgröße.
- Fernkämpfer schlagen im Nahkampf zurück, Fliegende können Rückschläge erhalten.
- Beidseitige Auslöschung zählt für den Verteidiger.
- Restschaden verfällt nach dem Kampf. Überlebende bleiben dezimiert, auch bei Wächtern.
- Rückzug nach 3 Runden: Der Angreifer steht wieder auf dem Ausgangsfeld, seine Bewegung verfällt, niemand erhält eine Belohnung.

## Flucht und Niederlage

- Ein besiegter Held kehrt ohne Armee zur Hauptstadt zurück; Stufe, Artefakte und Zauber bleiben, die Bewegung verfällt.
- Ohne eigene Hauptstadt geht er in eine andere eigene Stadt, sonst ist er verloren.
- Wer weder Stadt noch Helden hat, scheidet aus.
- Flucht verwehrt dem Gegner Heldensieg und Erfahrung. Das gibt ihr erst einen Sinn, denn Niederlage und Flucht kosten sonst dasselbe.
- Ein Gegner ohne Armee bringt keinen Heldensieg.
- Flieht der Verteidiger einer Stadt, geht auch die Garnison verloren und die Stadt fällt.

## Belagerung

- Der Turm gehört zur Stadtmauer; ohne Mauer kein Turm.
- Der Turm schießt nach den Rundenentscheidungen, trifft bei 4+ mit 1 Schaden und zielt auf den Stapel mit den wenigsten LP je Einheit.
- Eine leere Stadt ohne Mauer fällt kampflos. Mit Mauer schießt der Turm einmal, dann fällt sie.
- Eine Garnison ohne Held kämpft mit 0/0 plus Mauerbonus. Der Kronland-Bonus gilt für den aktuellen Besitzer.

## Zauber

- Keine Zauberpunkte, nur die Begrenzung pro Kampf. Gewirkt wird zu Rundenbeginn, der Angreifer entscheidet zuerst.
- Blitz: 2 + Magie Schaden. Feuerball: 1 + Magie Schaden an jedem Gegner einer Reihe.
- Segen: Stapel trifft 1 besser. Steinhaut: Gegner treffen 1 schlechter. Hast: +2 Tempo. Alle drei gelten bis Kampfende.
- Stadtportal: einmal pro Woche in eine eigene Stadt, braucht Bewegung und verbraucht den Rest.
- Magiergilde: Der Held muss in der Stadt sein; Stufe 2 erst mit Ausbau.

## Spielende

- Der Eroberer aller gegnerischen Hauptstädte gewinnt sofort, unabhängig vom Ruhm.
- Bei Ruhm-Gleichstand nach Woche 10 gewinnen alle Führenden gemeinsam.
- Einheiten-Stufen zählen auch die Garnison.

## Sichtbarkeit

- Die Ruhmesleiste zeigt allen die Summe jedes Spielers, auch wenn sie verdeckte Minen einschließt.
- Armeen fremder Helden und Garnisonen sind sichtbar, sobald ihr Feld aufgedeckt ist. Aufgedeckte Felder zeigen immer den aktuellen Stand.
- Im laufenden Kampf zweier Menschen wird nur für die Aufstellung übergeben, danach ist das Raster offen.

## KI

- Die KI sieht nur `playerView` und schummelt nicht. Sie kennt die 6 möglichen Herzstein-Felder, weil das eine offene Regel ist.
- Die KI flieht nur vor Helden.
