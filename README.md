# BIFF 2026 – planleggar

Uoffisiell planleggar for Bergen Internasjonale Filmfestival (14.–22. oktober 2026).
Merk filmar som «Må sjå» eller «Kanskje», så foreslår han ein timeplan utan kollisjonar.
Planen blir lagra i nettlesaren (localStorage).

Statisk nettstad utan byggesteg: `public/` er alt som blir publisert.

## Oppdatering av data

GitHub Actions (`.github/workflows/oppdater.yml`) køyrer `scrape.py` kvart 10. minutt
fram til `FESTIVAL_END` og publiserer `public/` til GitHub Pages. Dataa blir ikkje
committa; kvar køyring publiserer det som er ferskt. Feilar skrapinga, står førre
versjon, og appen viser tidspunktet for billettstatus i raudt når det er over ein time gammalt.

Manuelt:

```sh
python3 scrape.py          # hentar ca. 13 sider frå biff.no, skriv public/data/program.json
python3 scrape.py --cache  # gjenbruk nedlasta sider i .cache/
```

Skraparen skriv ut kva som er endra (nye, fjerna og flytta visningar, endra billettstatus).
Han nektar å skrive fila om han får under halvparten så mange visningar som før.

## Lokalt

```sh
python3 serve.py                           # http://localhost:8765 (utan bufring)
npm test                                   # testar for planleggaren (node --test)
```

## Korleis

- `scrape.py` – berre standardbiblioteket. Les URL-koda JSON som Filmgrail legg i sidene:
  `/showtimes-calendar/<dato>` (alle visningar per dag med billettstatus og filmdata) og
  `/playing-now/all/all` (plakatar og filmar utan visningar).
- `public/js/planner.js` – autoforslaget. Branch and bound med dynamisk rekkjefølgje, så
  forbetring ved å løyse éin og éin dag (og dagane til filmar som ikkje fekk plass) på nytt.
  «Må sjå» vinn alltid over «Kanskje». Med svært lange ønskelister (40+) kan han få plass
  til 1–3 færre «Kanskje» enn det som er mogleg; lås visningar for å styre han.
- `public/js/store.js` – lagring og overføringslenkje (`?plan=…`).
- `public/js/views/` – Filmar, Program (tidslinje), Min plan og filmdetalj.

## Neste år

Kopier mappa, endre `festival` i `scrape.py`, `FESTIVAL_END` i workflowen og nøkkelen
i `store.js` (`biff-2026-plan`), og køyr skraparen. Viss biff.no har bytt plattform, er
det `scrape.py` som må skrivast om – appen les berre `program.json`.
