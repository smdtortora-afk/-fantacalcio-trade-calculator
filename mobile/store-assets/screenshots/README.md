# Screenshot per gli store

Catturati dal simulatore iPhone 18 Pro Max con dati live (giornata 11).

## iOS — App Store Connect
`ios/` — **1320×2868**, la misura 6.9" che Apple richiede. Apple scala da sola
per i display piu' piccoli, quindi questa serie basta.

## Android — Google Play
`android/` — **1080×2160**, rapporto 1:2 esatto. Le catture iOS sono 1:2,17,
fuori dall'intervallo accettato da Play: qui il contenuto e' riportato in scala
e centrato su fondo #090511, senza ritagli.

Play chiede da 2 a 8 screenshot per telefono, Apple fino a 10: la serie e' valida
per entrambi.

## Come rifarli

Non esiste una modalita' demo nell'app: le schermate sono state prodotte con una
build temporanea che pilotava la UI via JavaScript, poi scartata. Per rifarli
serve ripetere quel procedimento, oppure catturare a mano dopo aver importato
una lega.

| File | Cosa mostra |
|---|---|
| 1-schermata-iniziale | hero con dati live e giornata corrente |
| 2-scegli-giocatori | selezione dei due lati dello scambio |
| 3-verdetto-scam | equita' 30%, verdetto FANTASCAM |
| 4-scambio-equilibrato | equita' 99%, verdetto equilibrato |
| 5-motivazioni | banner con le ragioni del verdetto |
