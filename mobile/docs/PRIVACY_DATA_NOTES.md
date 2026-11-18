# FANTASCAM — Privacy / Data Safety notes

## Dati locali
- File XLSX/XLS/CSV importati: letti sul dispositivo.
- Rose normalizzate: salvate localmente nell'app.
- Multi-lega: locale sul dispositivo.
- Nessuna password di piattaforme fantasy richiesta per l'import manuale.
- Nessun account FANTASCAM nella versione iniziale.

## Rete
La Store Edition chiama il backend FANTASCAM/Vercel per dati applicativi e funzioni pubbliche. Vercel può trattare e conservare temporaneamente IP, user agent e log tecnici. Questo va considerato nelle dichiarazioni privacy degli store.

## Assente nella versione iniziale
- pubblicità
- SDK ad-tech
- tracking cross-app
- acquisti in-app
- abbonamenti
- geolocalizzazione richiesta dal dispositivo
- contatti/foto/microfono

## Cancellazione
Le leghe salvate possono essere cancellate dall'app. Disinstallando l'app o cancellandone i dati vengono rimossi i dati locali.

## Prima della release
1. scegliere una email pubblica di supporto;
2. pubblicare privacy.html e support.html su URL HTTPS;
3. controllare la build finale per eventuali SDK aggiunti;
4. compilare Google Data Safety e Apple App Privacy sulla build effettiva.
