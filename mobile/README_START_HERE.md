# FANTASCAM Store Edition — iOS + Android

Questa cartella è la base unica per pubblicare FANTASCAM su App Store e Google Play.

## Identità app
- Nome: **FANTASCAM**
- Bundle / Package ID: **com.smdtortora.fantascam**
- Versione iniziale: **1.0.0**
- Motore web incluso: **V10.3 Roster Picker**
- Web runtime: **Capacitor 8.5.1**

## Funzioni già incluse
- Motore FANTASCAM V10.3
- Multi-lega persistente
- Import XLSX/XLS/CSV
- Selettore delle fantasquadre
- Giocatori filtrati sulla rosa reale di Squadra A / Squadra B
- Roster Impact
- Copertura portieri realistica/dinamica
- Cache-bust V10.3
- Persistenza locale della lega
- Capacitor Native HTTP attivo per le API HTTPS
- Asset base icona/splash inclusi

## Generazione nativa
Su una macchina di build con Node 22, Xcode 26 e Android SDK/API richiesti:

```bash
npm install
npx cap add android
npx cap add ios
npm run assets
npx cap sync
```

Poi:

```bash
npx cap open android
npx cap open ios
```

## Firma e pubblicazione
I binari finali non possono essere firmati finché gli account developer non sono approvati e non abbiamo le credenziali/certificati di firma. Non mettere password, certificati o keystore nel repository pubblico.

Per Google Play useremo Play App Signing con una upload key dedicata. Per Apple useremo certificato/profilo App Store oppure firma gestita da Xcode/App Store Connect.

## Nota pubblicazione pubblica
Prima della release pubblica definitiva va verificato che i dataset/quotazioni eventualmente distribuiti nell'app abbiano diritti di utilizzo compatibili con la distribuzione sugli store. La Store Edition non presenta FANTASCAM come prodotto ufficiale di terze parti.

## Store submission pack aggiunto
Sono inclusi anche:
- `docs/GOOGLE_PLAY_READY_IT.md`
- `docs/APP_STORE_CONNECT_READY_IT.md`
- `docs/PRIVACY_DATA_NOTES.md`
- `www/privacy.html`
- `www/support.html`

Nota: nella bozza privacy/support è presente temporaneamente l'email dell'account sviluppatore. Prima della release è consigliato creare una casella dedicata FANTASCAM e sostituirla.
