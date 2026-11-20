# Screenshot per gli store

Catturati dal simulatore con dati live (giornata 11).

## iOS — App Store Connect

| Cartella | Misura | Serve per |
|---|---|---|
| `ios/` | **1320×2868** | iPhone 6.9". Apple scala da sola per i display piu' piccoli |
| `ipad/` | **2064×2752** | iPad 13". Richiesto solo finche' la app dichiara `TARGETED_DEVICE_FAMILY = "1,2"` |

Se si decide di pubblicare come app **solo iPhone** (`TARGETED_DEVICE_FAMILY = 1`),
la scheda iPad sparisce da App Store Connect e `ipad/` diventa inutile: la app
resta comunque installabile su iPad in modalita' compatibilita'.

Le quattro misure iPad 13" accettate sono 2732×2048, 2048×2732, 2752×2064 e
2064×2752. La nostra e' l'ultima, nativa dell'iPad Pro 13" (M5): nessun
ridimensionamento, nessuna banda aggiunta.

## Android — Google Play

`android/` — **1080×2160**, rapporto 1:2 esatto. Le catture iOS sono 1:2,17,
fuori dall'intervallo accettato da Play: qui il contenuto e' riportato in scala
e centrato su fondo #090511, senza ritagli.

Play chiede da 2 a 8 screenshot per telefono, Apple fino a 10: la serie e' valida
per entrambi.

## Cosa mostra ogni schermata

| File | iPhone / Android | iPad |
|---|---|---|
| 1-schermata-iniziale | hero con dati live e giornata corrente | idem, con le due card affiancate |
| 2-scegli-giocatori | selezione dei due lati | ricerca aperta con i risultati |
| 3-verdetto-scam | equita' 30%, verdetto FANTASCAM | equita' 69%, Malen contro Orsolini |
| 4-scambio-equilibrato | equita' 99% | equita' 98%, Mora contro Da Cunha |
| 5-motivazioni | banner con le ragioni | ragioni + dettaglio per giocatore |

## Come rifarli

Non esiste una modalita' demo nell'app: le schermate sono prodotte con una build
temporanea che pilota la UI via JavaScript e poi viene scartata. Il driver
inietta uno `<script>` prima di `</body>` in `www/index.html` che, a tempi fissi,
riempie i due lati con `rebuildSideFromSelections()` e cambia scheda.

Due accorgimenti imparati sbagliando:

- **I tempi di cattura vanno calcolati da un t0 assoluto**, non con sleep
  cumulative, altrimenti si catturano momenti sbagliati e si ottengono file
  identici. Verificare sempre con `shasum` che gli hash siano tutti distinti.
- **I giocatori vanno scelti dai dati, non a mano.** Per il verdetto negativo
  serve un avversario che valga circa un terzo del top: prendendo il peggiore del
  listone (FVM 1) la motivazione stampa "vale solo lo 0%" e sembra un difetto.
  Per quello equilibrato non basta un FS simile — serve anche un rapporto FVM
  >= 0.94, altrimenti il motore boccia lo scambio.

Dopo la cattura: `git checkout -- www/index.html`, `npx cap sync ios` e
verificare con `grep -c FS_DEMO` che il driver non sia rimasto ne' in `www/` ne'
in `ios/App/App/public/`.
