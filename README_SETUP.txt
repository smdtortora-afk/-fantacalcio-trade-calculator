FANTACALCIO TRADE CALCULATOR — SETUP DATI AUTOMATICI

COSA È GIÀ ATTIVO
- Listone locale di fallback: 496 giocatori.
- Soglie: >=80% EQUO, 65-79% ACCETTABILE, <65% SBILANCIATO.
- FVM <= 3: valore nullo.
- TOP 30 evidenziati.
- Pacchetti 2x1/3x1 con peso decrescente dei giocatori aggiuntivi.
- Fantamedia progressiva:
  giornate 1-3: 0%
  4-6: max 5%
  7-10: max 10%
  11-15: max 15%
  dalla 16: max 20%
- Il peso FM viene ulteriormente ridotto quando le presenze sono poche.

AGGIORNAMENTO AUTOMATICO
L'app chiama /api/data una volta al giorno (cache Vercel per 24h).
Per attivare dati realmente aggiornati, aggiungere in Vercel > Settings > Environment Variables:
- QUOTES_SOURCE_URL = URL JSON autorizzato con listone/quotazioni/FVM
- STATS_SOURCE_URL = URL JSON autorizzato con PV/MV/FM
- SEASON_MATCHDAY = opzionale; se assente viene stimata dal massimo PV.

Il server accetta array JSON o oggetti {players:[...]} / {data:[...]}.
Campi riconosciuti automaticamente:
quotazioni: id, role/ruolo, name/nome, team/squadra, quote/quotazione, initial, fvm
statistiche: id, name/nome, team/squadra, pv/presenze, mv/mediaVoto, fm/fantamedia

NOTA IMPORTANTE
Non è incluso scraping automatico diretto di Fantacalcio.it: i Termini di Utilizzo Fantacalcio
vietano scraping/accesso automatico senza autorizzazione scritta. Per aggiornamento automatico
da Fantacalcio serve quindi un feed/API autorizzato o altra fonte dati licenziata.
