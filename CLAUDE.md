# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cos'è questo progetto

**FANTASCAM / Fantacalcio Trade Calculator** — web app single-page (vanilla JS, zero build, zero dipendenze npm) che valuta l'equità di uno scambio di fantacalcio Serie A. L'utente seleziona i giocatori ceduti da due squadre ("Scammatore cede" / "Scammato cede"), aggiunge eventuali crediti, e l'app restituisce un punteggio di equità (0–100%) con verdetto `SCAMBIO EQUILIBRATO` / `SCAMBIO ACCETTABILE` / `FANTASCAM!!` e le motivazioni testuali.

Deploy su **Vercel** (`vercel.json` minimale, static + serverless functions in `api/`). Nessun package.json, nessun test, nessun linter, nessun bundler: i file `.js` sono serviti così come sono via `<script src>`.

## Comandi

Non esiste toolchain. Per sviluppare:

```bash
# Anteprima statica (le API /api/* NON funzionano: il frontend degrada senza errori fatali)
python3 -m http.server 8000

# Anteprima completa con le serverless functions
npx vercel dev

# Script di aggiornamento statistiche (richiede chiave API-Football)
API_FOOTBALL_KEY=xxx python3 scripts/update_stats.py
```

Il deploy avviene da GitHub → Vercel. Non ci sono comandi di build/lint/test da eseguire prima di un commit.

## Architettura: il punto più importante da capire

**L'app è costruita a strati sovrascritti (monkey-patching progressivo), non a moduli.** Ogni "versione" del motore è un IIFE che riassegna le stesse funzioni globali (`window.calculate`, `window.adjustedValue`, `window.packageValue`, `window.updateMeta`, `window.fsBreakdown`). **Vince l'ultimo che si carica.**

Ordine di caricamento effettivo (da `index.html`):

```
1. players.js          → const PLAYERS + const PLAYERS_META  (dati)
                       + IIFE "Ricerca giocatore globale V1"  (UI ricerca fuzzy)
2. <script> inline     → stato base (ACTIVE_PLAYERS, META, byRole), addRow/fillPlayers,
   in index.html         motore v1 "algoritmo 1,10" + refreshData() → /api/data
3. fs_engine.js        → "FS ENGINE V8.2": SOSTITUISCE adjustedValue/packageValue/
                         calculate/updateMeta. Aggiunge picker custom, box crediti,
                         pannello "Analisi multifattore". In coda inietta injuries.js
4. injuries.js         → caricato dinamicamente da fs_engine.js (src="injuries.js?v=103")
                         contiene QUATTRO IIFE in sequenza:
   ├─ Injury client    → fetch /api/injuries → popola window.FS_INJURIES
   ├─ V9.0 Confidence  → RISOSTITUISCE tutto il motore di valutazione
   ├─ V10.0/10.2 Roster Impact → wrappa window.calculate (chiama baseCalculate e poi
   │                     corregge il verdetto con l'impatto sulle rose reali)
   ├─ V10.1 Multi-League Vault → IndexedDB + import XLSX/CSV delle rose
   └─ V10.3 Roster-only picker → filtra i select ai soli giocatori della rosa scelta
```

**Conseguenza pratica: il motore che gira davvero in produzione è quello dentro `injuries.js` (V9.0 + wrapper V10.2), non `fs_engine.js`.** Il codice in `fs_engine.js` (V8.2) e quello inline in `index.html` sono morti per la parte di calcolo, ma vivi per la parte DOM/UI (template righe, picker, box crediti, pannelli). Prima di modificare una formula, **verifica quale strato la definisce per ultimo**.

Ogni strato è protetto da un flag idempotente: `window.FS_V9_LOADED`, `window.FS_V10_ROSTER_LOADED`, `window.FS_V101_MULTI_LEAGUE_LOADED`, `window.__FS_V103_ROSTER_PICKER__`.

### Comunicazione tra strati

- Variabili globali lessicali (`let`/`const` top-level in `index.html`): `PLAYERS`, `ACTIVE_PLAYERS`, `META`, `byRole`, `getPlayer()`, `sidePlayers()`, `teamAbbr()`. Sono visibili agli altri script ma **non sono su `window`** (vedi trappole sotto).
- Globali su `window`: `FS_INJURIES`, `FS_INJURIES_READY` (Promise), `FS_LAST_TRADE`, `FS_LEAGUE`, `FS_MULTI_LEAGUE`, `FS_ROSTER_ENGINE`, `fsBreakdown`, `fsBand`, `fsMarketTier`, `getTradeSummary()`.
- CustomEvent su `window`: `fantascam:injuries-updated`, `fantascam:trade-updated`, `fantascam:trade-v10`.
- `localStorage`: `fantascamLeagueBudget` (crediti iniziali lega, default 500), `fantascamLeagueV10` (lega attiva), `fantascamSavedLeaguesV101`, `fantascamActiveLeagueIdV101`. IndexedDB `fantascam-local` / store `leagues` per il vault multi-lega.

## Analisi funzionale: come viene valutato uno scambio

Il modello ruota intorno a un unico numero per giocatore, **FS (0–99)**, calcolato in `fsBreakdownV9()` (`injuries.js`). FS *non* è il FVM: è una stima di quanto quel giocatore vale davvero in uno scambio.

**Pipeline FS di un giocatore:**

1. `availability` — quanto ci si aspetta che giochi. Fonde un *prior* di gerarchia (`starterPrior`: se è il 1°/2°/3° del suo ruolo nel suo club reale) con le presenze osservate (`pv/matchday`). Il peso del dato reale cresce con la giornata: `realUsageWeight` → G5 10%, G10 50%, G20 75%, G30 90%, max 95%.
2. `roleRawBase` — formula lineare per ruolo che pesa disponibilità, `profile` (ruolo Mantra: un `Dd/Ds/E/W` vale più di un `Dc`), forza del club (tabella hardcoded `TEAM` con `def`/`att` per squadra) e percentile di mercato (`marketPct`, derivato da `.60*log1p(fvm) + .40*log1p(quote)`).
3. `starBandValue` — pavimento di protezione per i TOP (`starFloor`): se sei tra i primi N titolari del tuo ruolo non puoi scendere sotto una certa soglia. Dentro la fascia la posizione è continua, non piatta.
4. `usageDelta` — correzione ±(-4.5/+3) se le presenze reali smentiscono il prior.
5. `formDelta` — la forma entra **solo dalla 6ª giornata**, pesata per affidabilità del campione (`sampleReliability = pv / max(4, md*0.75)`), con cap crescente (2.5 → 5.5) e ridotto del 20% per ELITE/TOP (un top non diventa scarso per tre partite storte).
6. `injuryFactor` — moltiplicatore da 0.32 a 0.94 in base ai giorni al rientro, o al testo dell'infortunio (crociato/tendine → 0.32, frattura/operazione → 0.45, muscolare → 0.68, contusione → 0.90).

**Pacchetti (2×1, 3×1):** `packageValue` usa pesi fortemente decrescenti `[1, .20, .08, .04, .02]` moltiplicati per `tradability(p)` (quanto quel giocatore è realmente spendibile, dalla sua `usageScore`). È una scelta deliberata: **la quantità non deve poter comprare un top.**

**Crediti:** `creditValue` — rendimento decrescente, cap a 23 punti FS, rapportato al budget iniziale della lega, scontato a fine stagione (×0.80 dalla G26, ×0.62 dalla G32).

**Equità finale (`analyse()` in `injuries.js`):**

```
fairness = .44 * modelFair (rapporto dei FS pesati)
         + .44 * rawFair   (controllo indipendente sul solo FVM)
         + .12 * roleFair  (gerarchia relativa nel proprio ruolo)
```

Poi vengono applicati i **guardrail anti-scam**, che possono solo abbassare:
- 1×1 tra ruoli diversi: cap proporzionale alla distanza di percentile.
- 1×1 con FVM molto distanti (>40 e rapporto <.45): cap a ~74–80%, i crediti alleviano ma non sanano.
- `inspectPackage`: se un lato cede un singolo ELITE/TOP contro un pacchetto, calcola l'*adequacy* del "giocatore-ancora" avversario; sotto soglia applica penalità progressiva fino a 18 punti e cap a 68–79%. Serve un'ancora che raggiunga il 60–65% del FVM del top per poter essere "verde".

**Soglie del verdetto:** `< 75%` = FANTASCAM (bocciato) · `75–87%` = accettabile · `≥ 88%` = equilibrato.

**Roster Impact (V10.2)** — attivo solo se è collegata una lega e sono selezionate due fantasquadre diverse. Ricalcola miglior XI (7 moduli testati), profondità reale, qualità del blocco difensivo (modificatore) prima/dopo lo scambio, più un bonus "handcuff" **solo per la coppia di portieri dello stesso club** (e solo per club con difesa ≥78). La correzione è cappata a ±8 punti di equità e **non può mai far diventare verde uno scam strutturale**: se `baseFairness < 65`, o se è scattato un guardrail TOP/ELITE con `baseFairness < 75`, l'equità finale è forzata a max 74%.

## API serverless (`api/`)

- **`api/injuries.js`** — scraping HTML di Virgilio Sport + Goal.com (tabella infortunati Serie A), parsing testuale, dedup per `squadra|cognome`, matching fuzzy sui nomi di `players.js`. Cache CDN 1h. Risponde 502 se nessuna fonte produce righe. Include diagnostica `matching` con matched/unmatched per debug.
- **`api/league-sync.js`** — sync **read-only** di una lega pubblica `leghe.fantacalcio.it` (solo quell'host, whitelist esplicita). Nessuna credenziale, nessun cookie. Prova prima i blob JSON embedded (`__NEXT_DATA__`), poi scraping dei link `info-squadra?t=`. Se le rose sono private risponde 422 con messaggio esplicito.

**Vincolo legale ereditato dal progetto** (`README_SETUP.txt`): i Termini di Fantacalcio.it vietano lo scraping non autorizzato. L'aggiornamento di quotazioni/FVM è previsto **solo** via feed autorizzato configurato in env (`QUOTES_SOURCE_URL`, `STATS_SOURCE_URL`, `SEASON_MATCHDAY`). Non aggiungere scraping diretto di Fantacalcio.it.

## Dati

`players.js` — 533 giocatori, stagione dichiarata 2026/27 "post-calciomercato". Campi: `id, role (P/D/C/A), mantraRole, name, team, quote, initial, fvm, fvmMantra`. **Nessun record ha `pv`/`mv`/`fm`**: finché non arrivano le statistiche, `META.matchday` resta 0 e tutto il layer forma/presenze è dormiente — l'app gira in modalità strutturale pura.

`fallback.json` — 496 giocatori, snapshot più vecchio (FVM diversi), pensato per `/api/data`. Contiene meno campi (`no mantraRole`).

## Trappole note (verificare prima di "aggiustare")

Queste sono incoerenze reali già presenti nel codice. Non sono ancora state corrette: se tocchi l'area, sappi che esistono.

1. **`/api/data` non esiste.** `index.html:429` fa `fetch('/api/data?day=...')`, ma il file è `data.js` nella root (non in `api/`) e per di più fa `require("../data/fallback.json")`, path inesistente (il file è `fallback.json` in root). Risultato: 404 → l'app resta permanentemente sul listone locale e su `META.matchday = 0`. Per attivarlo: spostare in `api/data.js` e correggere il require.
2. **La GitHub Action di aggiornamento statistiche fallisce.** `scripts/update_stats.py::load_players()` cerca `const PLAYERS = [...]` **a fine file**, ma `players.js` ha una IIFE di UI dopo l'array: la regex non matcha → `SystemExit('players.js format not recognized')`. Inoltre `save_players()` riscriverebbe il file con il solo array, **cancellando `PLAYERS_META` e tutta la IIFE di ricerca globale**. Da sistemare prima di riabilitare il workflow.
3. **`window.ACTIVE_PLAYERS` non esiste.** `ACTIVE_PLAYERS` è dichiarato con `let` in `index.html` → non finisce su `window`. La ricerca globale (`players.js:27`) e il picker V10.3 (`injuries.js:989`) lo leggono da `window` e ricadono sempre su `PLAYERS`, ignorando eventuali dati live.
4. **Squadre disallineate.** `players.js` ha Frosinone/Monza/Venezia; `api/injuries.js` cerca Cremonese/Pisa/Verona. Gli infortuni di quelle squadre non matcheranno mai, e viceversa. Le tabelle `TEAM`/`TEAM_DEF` (in `fs_engine.js`, `injuries.js`, `roster_patch.js`) sono hardcoded e vanno aggiornate tutte insieme a ogni cambio di stagione.
5. **File morti da non toccare né aggiornare per sbaglio:**
   - `roster_patch.js` — copia V10.0 del blocco Roster Impact, **non referenziata da nessuna pagina**; la versione viva è la V10.2 inlineata in `injuries.js`.
   - `update_stats.py` e `update-stats.yml` in root — duplicati obsoleti; le versioni attive sono `scripts/update_stats.py` e `.github/workflows/update-stats.yml`.
   - `index_abbreviato.html`, `index_grafica_premium.html`, `index_scam_sirene.html`, `index_trade_premium_v3.html` — prototipi grafici precedenti. Solo `index.html` è l'app.
   - `fantacalcio_trade_site_v2.zip` — archivio storico con un `index.html` da 8 KB.
6. **Badge versione incoerenti.** `.algoBox b` viene riscritto in cascata (`1,10` → `V9.0` → `V10.2` → `V10.3`) da strati diversi: il numero mostrato dipende dall'ordine di esecuzione, non da una costante unica.
7. **Duplicazione TEAM/clamp/norm/levenshtein** in almeno 4 file. Una modifica alla forza delle squadre va replicata ovunque.

## Convenzioni di codice

- Italiano nei commenti, nei nomi UI e nei messaggi utente; inglese negli identificatori.
- Stile compresso, molte espressioni su una riga, arrow function, `??`/`?.` usati diffusamente. Mantieni lo stile del file che stai modificando.
- CSS iniettato via JS con `document.createElement('style')` + id sentinella (`fs-v9-verdict-style`, `fs-v10-league-style`, …) per evitare doppie injection.
- La UI è mobile-first: ogni modifica al layout va verificata sotto i 600px (i breakpoint ricorrenti sono 600px e 780px).
- I commit storici sono tutti "Add files via upload" (upload dalla UI web di GitHub). Non c'è convenzione di commit da rispettare.

---

# Store Edition — app mobile iOS/Android

Vive in **`mobile/`**, dentro questo repo (spostata qui il 2026-11-18 dalla cartella sorella `FANTASCAM_Store_Edition_iOS_Android_READY/`).

`mobile/.gitignore` esclude `node_modules/`, `android/`, `ios/`, `package-lock.json` e `www/icons/`: sono tutti rigenerati da `npm install` / `cap add` / `npm run assets`. `.vercelignore` esclude `mobile/` dal deploy web.

Resta fuori dal repo, come cartella sorella in `../`, `FANTASCAM_Store_Edition_iOS_Android/`: iterazione precedente di cui `mobile/` è un superset esatto. Archiviabile o cancellabile.

Wrapper **Capacitor 8.5.1** (`appId com.smdtortora.fantascam`, `webDir: www`, tema `#090511`, `CapacitorHttp` abilitato). Capacitor 8 su iOS usa **Swift Package Manager, non CocoaPods**: viene generato `App.xcodeproj` + `CapApp-SPM`, **non esiste `App.xcworkspace`**.

## Rapporto con la web app

`www/` è la web app riconfezionata:

| File | vs repo web |
|---|---|
| `players.js`, `fs_engine.js` | byte-identici |
| `injuries.js` | due sole differenze sistematiche |
| `index.html` | riscritto da zero |

Le differenze in `injuries.js` sono deliberate: (1) tutti i `fetch("/api/...")` diventano assoluti su `https://fantacalcio-trade-calculator.vercel.app/api/...`, (2) ogni occorrenza visibile di "Fantacalcio" è sostituita da "lega fantasy" (de-branding per la review degli store). L'`index.html` mobile ha UI nuova (tema viola, gauge circolare, Scambia lati / Svuota / Copia riepilogo, toast, meta PWA + manifest) ma **conserva lo stesso contratto DOM** (`#sideA`, `#sideB`, `.footballer`, `#score`, `#verdict`, `#valueA/B`, `rowTpl`), perciò `fs_engine.js` e `injuries.js` funzionano senza modifiche. Non c'è più la foto "Here We Go" hotlinkata da `skrill.com`.

**Il motore esiste quindi in tre copie non sincronizzate** (repo web + 2 cartelle store). Nessun symlink, build step o git: ogni fix va propagato a mano.

## Build — verificato funzionante il 2026-09-16

Dry run completo eseguito su questa macchina: `npm install` → `npx cap add android` → `assembleDebug` = **BUILD SUCCESSFUL** (APK 4.0 MB); `npx cap add ios` → `xcodebuild -sdk iphonesimulator` = **BUILD SUCCEEDED**; app installata e avviata nel simulatore, funzionante. Anche `npm run assets` gira (87 asset Android, 10 iOS, 7 PWA).

```bash
npm install
npx cap add android && npx cap add ios
npm run assets
npx cap sync
```

Toolchain locale presente: Node 26.6, npm 11.18, Xcode 26.6, CocoaPods 1.15.2 (non serve, SPM), Java 21, Android SDK. `ANDROID_HOME` non è esportato nell'ambiente: `export ANDROID_HOME=~/Library/Android/sdk` prima dei comandi gradle. Capacitor 8 richiede compileSdk/targetSdk **36**: Gradle lo scarica da solo al primo sync.

`android/`, `ios/` e `node_modules/` sono gitignorati e vengono rigenerati da `cap add`. Il codice nativo generato è **boilerplate vuoto** — iOS: `SceneDelegate.swift` con la sola riga `window?.rootViewController = CAPBridgeViewController()`; Android: `MainActivity extends BridgeActivity {}`, 5 righe — quindi oggi rigenerare non perde nulla. Diventa un problema appena si tocca il nativo (`versionCode` per una release, chiavi `Info.plist`, un plugin da configurare a mano): a quel punto vanno committati i progetti o scriptate le personalizzazioni. Oggi: unico permesso Android `INTERNET`, `versionCode 1` / `versionName "1.0"` (disallineato da `package.json` 1.0.0).

**Su questa macchina `xcode-select` punta a `/Library/Developer/CommandLineTools`**, quindi `xcodebuild` fallisce. Prefissa i comandi con `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (oppure sistema una volta per tutte con `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).

## Stato backend in produzione (verificato con curl)

- `GET /api/injuries` → **200**, 77 infortuni (Virgilio 67 + Goal 58, dedotti). Funziona.
- `GET /api/data` → **404**. Confermato in produzione: l'app mobile nasce senza statistiche live, `matchday` resta 0, il layer forma/presenze è spento. Nell'app si legge "Fantamedia non attiva".
- `GET /api/league-sync` → 422 con messaggio corretto quando le rose non sono pubbliche.
- `/` → serve la vecchia index verde della web app.

Nota: `CapacitorHttp` patcha `fetch` a livello nativo, quindi le chiamate cross-origin non passano dal CORS del browser. È il motivo per cui `api/league-sync.js` funziona dall'app pur non impostando header CORS.

## Bug mobile trovati a runtime

1. ~~Safe area non rispettata~~ — **risolto il 2026-11-18**: `.wrap` e `.toast` in `mobile/www/index.html` ora sommano `env(safe-area-inset-*)` ai padding. Verificato nel simulatore.
2. **"Infortuni caricati • N" mostra un numero gonfiato.** `FS_INJURIES_META.count` conta le *chiavi* della mappa, e ogni giocatore riconosciuto ne genera due (`id` e `name`). Con 77 infortuni reali l'app scrive 127. Il dato utile — quanti sono stati agganciati al listone — è ~50/77.
3. **Il matching lato server è cieco.** `/api/injuries` risponde `"playersLoaded":0, "matchedCount":0`: `loadPlayers()` in `api/injuries.js` non riesce a parsare `players.js` (stessa IIFE che rompe `update_stats.py`). Non è bloccante — il matching vero avviene nel browser — ma la diagnostica server è inutilizzabile.
4. **Doppio controllo "Le mie leghe"** nel pannello lega: lo strato V10.1 inietta selettore e bottone sopra il pannello V10.0, con due empty state di testo diverso ("Nessuna lega salvata" / "Nessuna lega collegata").

## CI

`.github/workflows/mobile-{ios,android}-validate.yml` alla radice del repo (GitHub Actions legge i workflow solo da lì), con `working-directory: mobile`. Si attivano sui push che toccano `mobile/**`, oppure a mano con `workflow_dispatch`. Android: `cap add` + APK debug + AAB release non firmato come artifact. iOS: build per simulatore senza firma — il riferimento a `App.xcworkspace` è stato corretto in `-project ios/App/App.xcodeproj` (Capacitor 8 usa SPM).

## Pacchetto store

`docs/` contiene testi di listing già pronti da incollare (`GOOGLE_PLAY_READY_IT.md`, `APP_STORE_CONNECT_READY_IT.md`), bozza privacy policy, note Data Safety, release checklist, e un workflow "solo da iPhone". Asset corretti: `assets/icon.png` 1024×1024, `assets/splash.png` 2732×2732.

Da sistemare prima della release: l'email personale `smdtortora@gmail.com` compare in `www/privacy.html` e `www/support.html` (il README lo segnala); privacy policy e supporto vanno pubblicati a un URL raggiungibile; mancano gli screenshot store. I testi di listing dichiarano già FANTASCAM come prodotto indipendente non affiliato a leghe o piattaforme terze — mantieni quella formulazione.
