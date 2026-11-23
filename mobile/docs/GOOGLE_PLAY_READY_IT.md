# FANTASCAM — Google Play Console (valori pronti da copiare)

## Creazione app
- Nome app: FANTASCAM
- Lingua predefinita: Italiano (Italia)
- App o gioco: App
- Gratuita o a pagamento: Gratuita
- Categoria: Sport
- Annunci al lancio: No

## Scheda dello Store principale
### Nome app (max 30)
FANTASCAM

### Descrizione breve (max 80)
Valuta gli scambi della tua lega fantasy: rose reali, infortuni, verdetto netto.

### Descrizione completa (max 4000)
Ti hanno proposto uno scambio e non sai se è un affare o una fregatura? FANTASCAM te lo dice in pochi secondi.

Scegli i giocatori che cedi e quelli che ricevi, aggiungi eventuali crediti e ottieni un punteggio di equità da 0 a 100% con un verdetto netto: SCAMBIO EQUILIBRATO, SCAMBIO ACCETTABILE oppure FANTASCAM!! — sempre accompagnato dalle motivazioni.

UN VALORE PER OGNI GIOCATORE
Ogni calciatore riceve un punteggio che stima quanto vale davvero in uno scambio: titolarità nel suo club, ruolo, forza della squadra, quotazione di mercato, presenze e forma recente.

DATI AGGIORNATI
Statistiche e presenze vengono aggiornate durante la stagione. Dalla sesta giornata entra in gioco anche la forma, pesata in base a quante partite sono state giocate: tre gare storte non bastano a bocciare un top.

INFORTUNI INCLUSI
I giocatori infortunati perdono valore in base alla gravità e ai tempi di recupero. Una contusione non pesa come un crociato.

PROTEZIONE TOP PLAYER
La quantità non compra la qualità: un pacchetto di giocatori medi più crediti non basta per prendersi un campione. Il motore riconosce questi casi e li segnala.

CREDITI E PACCHETTI
Scambi 1×1, 2×1, 3×1, con o senza crediti. Il valore dei crediti dipende dal budget della tua lega e cala con l'avanzare della stagione.

LE TUE LEGHE, SUL TUO TELEFONO
Importa le rose da un file XLSX, XLS o CSV, salva più leghe sul dispositivo e passa dall'una all'altra al volo. Scelte le due fantasquadre, vedi soltanto i giocatori che possiedono davvero.

ROSTER IMPACT
Con una lega collegata, FANTASCAM misura anche come lo scambio cambia la miglior formazione, la profondità della rosa e il blocco difensivo di entrambe le squadre. Il contesto può correggere il verdetto, ma non trasformerà mai una fregatura in un buon affare.

PENSATA PER IL TELEFONO
Interfaccia nativa a schede, ricerca rapida dei giocatori, nessuna registrazione e nessuna pubblicità.

PRIVACY
Le leghe importate restano sul dispositivo. Non servono account né password di piattaforme di terze parti.

FANTASCAM è un prodotto indipendente e non è affiliato, sponsorizzato o approvato da federazioni, leghe o piattaforme fantasy di terze parti. Le valutazioni sono uno strumento di supporto e non costituiscono previsioni certe sui risultati sportivi.

## Grafica
- Icona 512×512: `store-assets/google-play/icon-512.png`
- Immagine in primo piano 1024×500: `store-assets/google-play/feature-graphic-1024x500.png`
- Screenshot telefono (5, 1080×2160): `store-assets/screenshots/android/`

## Contatti / URL
- Privacy policy: https://fantacalcio-trade-calculator.vercel.app/privacy.html
- Sito / supporto: https://fantacalcio-trade-calculator.vercel.app/support.html
- Email di contatto (pubblica sulla scheda): smdtortora@gmail.com

## Contenuti dell'app (dichiarazioni)
- Accesso all'app: tutte le funzionalità disponibili senza credenziali
- Annunci: No
- Classificazione contenuti (IARC): categoria "Utility, produttività, comunicazione o altro"; No a tutto, compresi giochi d'azzardo, interazione fra utenti, acquisti e posizione
- Pubblico di destinazione: 18 anni e oltre (non rivolta ai bambini)
- App di notizie: No · Sanità: No · App governativa: No · Funzionalità finanziarie: nessuna
- ID pubblicità: No (la app non ha il permesso `AD_ID`)
- Permessi: `INTERNET` e `VIBRATE` (feedback aptico), nessuno da giustificare

## Sicurezza dei dati
- L'app raccoglie o condivide dati utente? **No**
- Rose e file importati restano sul dispositivo: non sono "raccolti" nel senso di Google.
- Le richieste HTTPS al backend su Vercel scaricano dati pubblici e non inviano dati dell'utente. Vercel tiene log tecnici (IP, user agent) che FANTASCAM non usa per identificare o localizzare nessuno. Se un domani venissero usati, o si aggiungessero SDK, la risposta va cambiata.

## Rilascio
- Bundle: `npm run native:config`, poi `cd android && ./gradlew bundleRelease`
- Firma: Play App Signing attiva. La chiave in `FANTASCAM_Signing/` è quella di **caricamento**.
- Dopo ogni upload: aggiungere il build number a `usedBuilds.android` in `release.json`.

### Note sulla versione (max 500)
Prima versione di FANTASCAM: valuta gli scambi della tua lega fantasy con dati aggiornati, infortuni e rose reali.

### Account personale creato dopo il 13/11/2023
Prima della produzione serve un test chiuso con almeno 12 tester iscritti per 14 giorni consecutivi. Non vale per gli account organizzazione.
