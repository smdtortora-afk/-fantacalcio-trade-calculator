# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⛔ Confine di lavoro — leggere prima di toccare qualsiasi cosa

Sul repo lavorano **due autori**.

**Il motore è di smdtortora-afk e non va modificato:** `injuries.js`, `fs_engine.js`, `players.js`, `player-utils.js`, `data-client.js`, `lib/`, `api/`, `scripts/update_stats.py`, `data/stats.json`, `index.html`.

**Qui si lavora sui contenitori:** `mobile/` (Store Edition), build e CI, configurazione nativa, asset, pacchetto store, e `scripts/sync_mobile.py`.

Se la app mobile ha bisogno che il motore si comporti diversamente, l'adattamento va in `scripts/sync_mobile.py`, che trasforma la copia in `mobile/www/` — **mai nel file sorgente**. Ogni divergenza locale nel motore produce un conflitto a ogni merge con `origin/main`.

Controllo rapido prima di committare:

```bash
for f in injuries.js players.js fs_engine.js player-utils.js data-client.js index.html; do
  git diff --quiet origin/main -- "$f" || echo "ATTENZIONE: $f diverge dal motore upstream"
done
```

Se trovi un bug nel motore, segnalalo — non correggerlo.

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

Da `index.html` oggi: `player-utils.js` → `players.js` → `fs_engine.js` → `data-client.js`, tutti con `?v=105`.

- **`player-utils.js`** — espone `FS_DATA_UTILS` (normalizzazione nomi/squadre e `matchPlayer`), usata dal client infortuni. **Richiesto da `injuries.js`.**
- **`data-client.js`** — definisce `window.refreshData` e `window.updateStatus`, chiama `/api/data` e aggiorna la barra di stato. Pilota `#quoteStatus`, `#syncDetail`, `#refreshDataButton`.
- **`lib/catalog.js`** — usato lato serverless da `api/data.js`.

Lo schema sottostante descrive la catena di sovrascritture, che regge ancora:

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

> ⚠️ **Da riverificare.** Questa sezione descrive il motore nella versione di settembre 2026. A ottobre `injuries.js` è stato riscritto ("FANTASCAM 10.5", 188 righe cambiate) insieme a `fs_engine.js` e `index.html`. L'impianto — FS per giocatore, pesi decrescenti sui pacchetti, guardrail anti-scam — regge, ma **soglie e coefficienti non sono stati riletti sulla nuova versione**. Prima di modificare una formula, leggi il codice attuale invece di fidarti dei numeri qui sotto.

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

`players.js` — il listone statico di partenza: `id, role (P/D/C/A), mantraRole, name, team, quote, initial, fvm, fvmMantra`, senza statistiche. È solo il fallback.

`data/stats.json` + `api/data.js` — **la fonte vera**, aggiornata ogni giorno dal workflow. `/api/data` restituisce 535 giocatori con `pv`, `mv`, `fm`, gol, assist, cartellini, gol subiti, più un `meta` ricco (`matchday`, `statsStale`, `statsLastSuccessAt`, `quoteUpdatedAt`…). Al 2026-11-18: giornata 11, `live: true`.

**Il layer forma/presenze è quindi ATTIVO in produzione**, non più dormiente: la forma entra dalla 6ª giornata e oggi pesa fino al 15%.

`fallback.json` — 496 giocatori, snapshot di agosto. Residuo storico.

## Trappole note (verificare prima di "aggiustare")

Queste sono incoerenze reali già presenti nel codice. Non sono ancora state corrette: se tocchi l'area, sappi che esistono.

1. ~~`/api/data` non esiste~~ — **risolto a monte nell'ottobre 2026**: esiste `api/data.js`, risponde 200 con 535 giocatori completi di `pv`/`mv`/`fm`/gol/assist/cartellini. Il `data.js` in root è il vecchio abbozzo, ora morto.
2. ~~La GitHub Action fallisce~~ — **risolto a monte**: `scripts/update_stats.py` è stato riscritto e il workflow gira. Il bot `trade-lab-bot` committa `data/stats.json` ogni giorno.
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

Le differenze in `injuries.js` sono deliberate: (1) tutti i `fetch("/api/...")` diventano assoluti su `https://fantacalcio-trade-calculator.vercel.app/api/...`, (2) ogni occorrenza visibile di "Fantacalcio" è sostituita da "lega fantasy" (de-branding per la review degli store). L'`index.html` mobile **conserva lo stesso contratto DOM** del motore (`#sideA`, `#sideB`, `.footballer`, `.grid`, `.result`, `#score`, `#verdict`, `#detail`, `#valueA/B`, `#fs-trade-receipt` + figli, `rowTpl`), perciò `fs_engine.js` e `injuries.js` funzionano senza modifiche.

### Shell nativa (dal 2026-11-19)

La UI è un'app, non una pagina: `index.html` (markup + stato globale che il motore si aspetta), `app.css` (tema, e rivestimento degli stili iniettati dal motore) e `app-shell.js` (comportamento).

- **Tre tab** (Scambio / Analisi / Info) con tab bar in basso, large title, ogni vista con scroll proprio. Font di sistema (nessun Google Fonts: l'app parte offline).
- **Nessuna tendina di sistema.** `app-shell.js` aggancia ogni `<select>` (anche quelli che il motore crea dopo, via MutationObserver), lo nasconde e mostra un bottone che apre un bottom sheet con gruppi (optgroup), ricerca oltre 10 voci, swipe-down per chiudere. Il `<select>` vero resta la fonte di verità: `value`/`selectedIndex` sono intercettati sull'istanza perché il motore li assegna senza emettere eventi. Esclusi `.role` e `.footballer`, sempre nascosti (li sostituisce la ricerca globale di `players.js`).
- **Verdetto**: i popup V9/V10 dell'engine (che si aprivano a ogni modifica) sono nascosti via CSS; il verdetto vive in una barra flottante nella vista Scambio e nella vista Analisi, che legge `FS_LAST_TRADE` dopo `fantascam:trade-updated` / `fantascam:trade-v10`.
- Crediti con stepper −/+; pannello lega compatto finché non c'è una lega; tastiera aperta = tab bar nascosta; haptics (`@capacitor/haptics`) e tasto indietro Android (`@capacitor/app`: tastiera → foglio → pannelli lega → tab Scambio → esci), installati il 2026-11-20. Il codice li chiama solo se presenti, quindi nel browser sono no-op.
- **Movimento**: cambiando tab gli elementi della vista entrano a cascata (`reveal()` in `app-shell.js`, classi `.rv`/`.rv-sub` rimosse a fine animazione); il cerchio dell'equità si riempie e `#score` conta fino al valore del motore (se il motore riscrive `#score` a metà, l'animazione si ferma). `--pct`/`--p`/`--gc` sono registrate con `@property` per animare i conic-gradient. Tutto spento con `prefers-reduced-motion`.
- `capacitor.config.ts` → `ios.contentInset: 'never'`: con `'automatic'` la safe area veniva contata due volte.

Verificato il 2026-11-19 in Chrome a 390×844 (flusso completo con e senza lega) e nel simulatore iPhone 18 Pro Max.

### Sincronizzazione del motore

`python3 scripts/sync_mobile.py` allinea `mobile/www/` alla web app; `--check` verifica senza scrivere ed esce 1 se c'è divergenza.

- **Copie esatte**: `players.js`, `fs_engine.js`, `player-utils.js` (quest'ultimo serve perché `injuries.js` usa `FS_DATA_UTILS`).
- **`injuries.js`**: copiato col solo de-branding, dichiarato voce per voce con il numero di occorrenze attese. Se un testo sorgente cambia lo script **si ferma** invece di produrre una Store Edition sbagliata.
- **`data-client.js` è escluso di proposito**: pilota `#quoteStatus`, `#syncDetail` e `#refreshDataButton`, che nella index mobile non esistono. La Store Edition ha il suo caricamento dati inline.
- **URL assoluti**: da `capacitor://localhost` un `/api/...` relativo non risolve, quindi lo script li rende assoluti. L'indirizzo non è scritto nello script: lo legge da `FS_API_BASE` in `mobile/www/index.html`, unico posto in cui dichiararlo.
- Lo script **si ferma** se non trova più le chiamate relative attese o se ne resta una non riscritta.

Dopo un sync: `npx cap sync ios && xcodebuild …` e riprova nel simulatore.

## Build — verificato funzionante il 2026-09-16

Dry run completo eseguito su questa macchina: `npm install` → `npx cap add android` → `assembleDebug` = **BUILD SUCCESSFUL** (APK 4.0 MB); `npx cap add ios` → `xcodebuild -sdk iphonesimulator` = **BUILD SUCCEEDED**; app installata e avviata nel simulatore, funzionante. Anche `npm run assets` gira (87 asset Android, 10 iOS, 7 PWA).

```bash
npm install
npx cap add android && npx cap add ios
npm run assets
npx cap sync
```

Toolchain locale presente: Node 26.6, npm 11.18, Xcode 26.6, CocoaPods 1.15.2 (non serve, SPM), Java 21, Android SDK. `ANDROID_HOME` non è esportato nell'ambiente: `export ANDROID_HOME=~/Library/Android/sdk` prima dei comandi gradle. Capacitor 8 richiede compileSdk/targetSdk **36**: Gradle lo scarica da solo al primo sync.

`android/`, `ios/` e `node_modules/` sono gitignorati e vengono rigenerati da `cap add`. Il codice nativo generato è **boilerplate vuoto** — iOS: `SceneDelegate.swift` con la sola riga `window?.rootViewController = CAPBridgeViewController()`; Android: `MainActivity extends BridgeActivity {}`, 5 righe — quindi oggi rigenerare non perde nulla. Le personalizzazioni native che servono davvero sono **scriptate**, non fatte a mano in Xcode: le riapplica `scripts/apply_native.py` leggendo da `mobile/release.json`, unica fonte dei numeri di versione. Permessi Android: `INTERNET` e `VIBRATE` (haptics).

### Numeri di versione e dichiarazione crittografia

```bash
npm run native:config   # riapplica release.json a ios/ e android/
npm run native:check    # verifica senza scrivere, esce 1 se divergente
npm run release:bump    # alza il build number prima di un nuovo upload
```

Lo script imposta `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` (iOS), `versionName`/`versionCode` (Android) e `ITSAppUsesNonExemptEncryption = false` in `Info.plist`.

Su Android lo script scrive anche firma di rilascio, tema di avvio scuro, icona dello splash e icona adattiva.

**Va eseguito dopo ogni `cap add`** e dopo ogni `npm run assets` e prima di ogni archivio: i progetti nativi sono rigenerabili e tornano a `1`, mentre Apple e Google rifiutano un upload con un build number già usato. `release.json` tiene l'elenco delle build già consumate (`usedBuilds.ios`) e `--bump` le salta.

La chiave `ITSAppUsesNonExemptEncryption = false` elimina l'avviso **"Conformità mancante"** su App Store Connect. È corretta perché la app usa solo HTTPS, cioè la crittografia di sistema, che Apple considera esente — **va rivista se un domani la app implementasse cifratura propria**. Non sana le build già caricate: per quelle la domanda si risponde a mano in App Store Connect.

### Android: firma e particolarità (dal 2026-11-23)

- **Firma**: chiave di caricamento e password stanno fuori dal repo in `../FANTASCAM_Signing/` (`fantascam-upload.jks`, `keystore.properties`; altrove con `FANTASCAM_SIGNING_DIR`). Senza quel file il bundle esce non firmato, come in CI. I bundle pronti vanno in `../FANTASCAM_Release/`. **Mai committarla.**
- **Safe area**: nella WebView Android `env(safe-area-inset-*)` vale 0 e Capacitor scrive `--safe-area-inset-*`. In `app.css` si usano solo `--sa-t/r/b/l`, che prendono il maggiore dei due: mai `env()` diretto.
- **Tastiera**: il tasto indietro la chiude senza `focusout`; `bindKeyboard()` su Android si basa sull'altezza della finestra.
- **Condividi**: la WebView Android non ha `navigator.share`, si usa `@capacitor/share`.
- **Bug del motore aggirato**: il gestore leghe proponeva budget 1 (`num(null,500)` dà 0 in `injuries.js`); `www/index.html` salva 500 in `fantascamLeagueBudget` all'avvio. Da segnalare a monte.

**Su questa macchina `xcode-select` punta a `/Library/Developer/CommandLineTools`**, quindi `xcodebuild` fallisce. Prefissa i comandi con `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (oppure sistema una volta per tutte con `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).

## Stato backend in produzione (verificato con curl)

- `GET /api/injuries` → **200**, 77 infortuni (Virgilio 67 + Goal 58, dedotti). Funziona.
- `GET /api/data` → ~~404~~ **risponde**: il 2026-11-19 l'app nel simulatore mostra "Dati live", giornata 11 e 112 infortuni.
- `GET /api/league-sync` → 422 con messaggio corretto quando le rose non sono pubbliche.
- `/` → serve la vecchia index verde della web app.

Nota: `CapacitorHttp` patcha `fetch` a livello nativo, quindi le chiamate cross-origin non passano dal CORS del browser. È il motivo per cui `api/league-sync.js` funziona dall'app pur non impostando header CORS.

## Bug mobile trovati a runtime

1. ~~Safe area non rispettata~~ — **risolto il 2026-11-18**: `.wrap` e `.toast` in `mobile/www/index.html` ora sommano `env(safe-area-inset-*)` ai padding. Verificato nel simulatore.
2. ~~Numero infortuni gonfiato~~ — **aggirato nella shell il 2026-11-19**: si mostra `FS_INJURIES_META.total`. Il difetto nel motore resta: `FS_INJURIES_META.count` conta le *chiavi* della mappa, e ogni giocatore riconosciuto ne genera due (`id` e `name`). Con 77 infortuni reali l'app scrive 127. Il dato utile — quanti sono stati agganciati al listone — è ~50/77.
3. **Il matching lato server è cieco.** `/api/injuries` risponde `"playersLoaded":0, "matchedCount":0`: `loadPlayers()` in `api/injuries.js` non riesce a parsare `players.js` (stessa IIFE che rompe `update_stats.py`). Non è bloccante — il matching vero avviene nel browser — ma la diagnostica server è inutilizzabile.
4. ~~Doppio controllo "Le mie leghe"~~ — **nascosto in `app.css` il 2026-11-19**. In origine lo strato V10.1 inietta selettore e bottone sopra il pannello V10.0, con due empty state di testo diverso ("Nessuna lega salvata" / "Nessuna lega collegata").
5. **Lo stile della riga "Lega attiva" (V10.1) arriva solo quando si apre il gestore leghe** (`ensureStyles()` è chiamata da `ensureManager()`, non da `refreshSelector()`): `app.css` la stila da sé.
6. **I fattori V8 (`t.base`, `t.momentum`, `t.slots`, `t.role`) non esistono più nel motore V9**: la vecchia index li mostrava sempre a 0. Rimossi dalla shell.

## CI

`.github/workflows/mobile-{ios,android}-validate.yml` alla radice del repo (GitHub Actions legge i workflow solo da lì), con `working-directory: mobile`. Si attivano sui push che toccano `mobile/**`, oppure a mano con `workflow_dispatch`. Android: `cap add` + APK debug + AAB release non firmato come artifact. iOS: build per simulatore senza firma — il riferimento a `App.xcworkspace` è stato corretto in `-project ios/App/App.xcodeproj` (Capacitor 8 usa SPM).

## Pacchetto store

`docs/` contiene testi di listing già pronti da incollare (`GOOGLE_PLAY_READY_IT.md`, `APP_STORE_CONNECT_READY_IT.md`), bozza privacy policy, note Data Safety, release checklist, e un workflow "solo da iPhone". Asset corretti: `assets/icon.png` 1024×1024, `assets/splash.png` 2732×2732.

Privacy e supporto sono pubblicati da Vercel (dal 2026-11-20): `https://fantacalcio-trade-calculator.vercel.app/privacy.html` e `/support.html`. La fonte sono `privacy.html` e `support.html` alla radice; `sync_mobile.py` li copia identici in `mobile/www/`. Il contatto e' ancora l'email personale `smdtortora@gmail.com`. I testi di listing dichiarano già FANTASCAM come prodotto indipendente non affiliato a leghe o piattaforme terze — mantieni quella formulazione.
