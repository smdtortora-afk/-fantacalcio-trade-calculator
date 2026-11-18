#!/usr/bin/env python3
"""Allinea il motore della Store Edition (mobile/www/) a quello della web app.

players.js e fs_engine.js sono copie esatte.
injuries.js viene copiato applicando il de-branding richiesto dalla review degli
store: nessuna menzione di "Fantacalcio" nei testi mostrati all'utente. Resta il
placeholder del campo URL, che e' un indirizzo reale e non una menzione di marca.

Gli URL relativi delle API vengono resi assoluti: la webview gira da
capacitor://localhost, dove "/api/..." non porta da nessuna parte. L'indirizzo
non e' scritto qui: viene letto da FS_API_BASE in mobile/www/index.html, che
resta l'unico posto in cui dichiararlo.

REGOLA: i file del motore appartengono all'altro autore e non vanno modificati
nel repo. Tutto l'adattamento alla Store Edition vive in questo script.

Uso:
    python3 scripts/sync_mobile.py            applica
    python3 scripts/sync_mobile.py --check    non scrive, esce 1 se divergente
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "mobile" / "www"

# player-utils.js espone FS_DATA_UTILS, usata dal client infortuni di injuries.js.
# data-client.js resta ESCLUSO di proposito: pilota #quoteStatus, #syncDetail e
# #refreshDataButton, che nella index mobile non esistono, e la Store Edition ha
# gia' il suo caricamento dati inline.
COPIE_ESATTE = ["players.js", "fs_engine.js", "player-utils.js"]

# Ogni voce deve corrispondere esattamente una volta: se il testo sorgente cambia
# lo script si ferma invece di produrre silenziosamente una Store Edition sbagliata.
DEBRANDING = [
    ("'Lega Fantacalcio'", "'Lega fantasy'", 3),
    (
        "import diretto XLSX/XLS/CSV esportato da Fantacalcio",
        "import diretto XLSX/XLS/CSV della lega",
        1,
    ),
    (
        "Usa il file Rose esportato da Fantacalcio.",
        "Usa il file XLSX/CSV con le rose della tua lega.",
        1,
    ),
    (
        "Importa il file delle rose di Fantacalcio qui sopra.",
        "Importa il file XLSX/CSV delle rose della tua lega qui sopra.",
        1,
    ),
    (
        "Fantamedia dalla tabella pubblica Fantacalcio (Italia)",
        "Fantamedia dalla tabella pubblica italiana",
        1,
    ),
    (
        "Per una lega pubblica prova il link Leghe Fantacalcio. Se Fantacalcio "
        "non espone le rose pubblicamente, puoi importare un JSON normalizzato "
        "senza condividere password.",
        "Per una lega pubblica supportata puoi provare il relativo link. "
        "In alternativa importa manualmente le rose senza condividere password.",
        1,
    ),
]

# L'unica occorrenza ammessa dopo il de-branding: il placeholder del campo URL.
PLACEHOLDER = 'placeholder="https://leghe.fantacalcio.it/nome-lega"'

# Chiamate relative da rendere assolute per la webview.
API_RELATIVE = ["'/api/injuries'", "`/api/league-sync?url=", "'/api/data"]


def api_base() -> str:
    """Legge FS_API_BASE da mobile/www/index.html: unica fonte dell'indirizzo."""
    html = (DEST / "index.html").read_text(encoding="utf-8")
    marker = 'window.FS_API_BASE="'
    i = html.find(marker)
    if i < 0:
        raise SystemExit(
            "ERRORE: FS_API_BASE non trovata in mobile/www/index.html.\n"
            "La Store Edition deve dichiarare l'indirizzo del backend."
        )
    i += len(marker)
    return html[i:html.index('"', i)].rstrip("/")


def assolutizza(testo: str) -> str:
    """Rende assolute le chiamate /api/: da capacitor://localhost non risolvono."""
    base = api_base()
    sostituite = 0
    for frammento in API_RELATIVE:
        sostituite += testo.count(frammento)
        testo = testo.replace(frammento, frammento.replace("/api/", f"{base}/api/", 1))
    if not sostituite:
        raise SystemExit(
            "ERRORE: nessuna chiamata relativa /api/ trovata in injuries.js.\n"
            "Il motore ha cambiato il modo di chiamare le API: aggiorna API_RELATIVE."
        )
    rimaste = [
        riga for riga in testo.split("\n")
        if "fetch('/api/" in riga or "fetch(`/api/" in riga or 'fetch("/api/' in riga
    ]
    if rimaste:
        raise SystemExit(
            "ERRORE: chiamate /api/ ancora relative dopo la riscrittura:\n"
            + "\n".join(r.strip()[:160] for r in rimaste)
        )
    return testo




def debrand(testo: str) -> str:
    for vecchio, nuovo, attese in DEBRANDING:
        trovate = testo.count(vecchio)
        if trovate != attese:
            raise SystemExit(
                f"ERRORE: attese {attese} occorrenze di {vecchio[:60]!r}, trovate {trovate}.\n"
                "Il testo sorgente e' cambiato: aggiorna DEBRANDING in scripts/sync_mobile.py."
            )
        testo = testo.replace(vecchio, nuovo)

    residue = [
        riga
        for riga in testo.split("\n")
        if "fantacalcio" in riga.lower() and PLACEHOLDER not in riga
    ]
    if residue:
        raise SystemExit(
            "ERRORE: 'Fantacalcio' ancora presente dopo il de-branding:\n"
            + "\n".join(r.strip()[:160] for r in residue)
        )
    return testo


def main() -> int:
    check = "--check" in sys.argv[1:]

    attesi = {f: (ROOT / f).read_text(encoding="utf-8") for f in COPIE_ESATTE}
    attesi["injuries.js"] = assolutizza(debrand((ROOT / "injuries.js").read_text(encoding="utf-8")))

    divergenti = 0
    for nome, contenuto in attesi.items():
        destinazione = DEST / nome
        attuale = destinazione.read_text(encoding="utf-8") if destinazione.exists() else None
        if attuale == contenuto:
            print(f"  = {nome} gia' allineato")
        elif check:
            print(f"  ! {nome} DIVERGENTE")
            divergenti += 1
        else:
            destinazione.write_text(contenuto, encoding="utf-8")
            print(f"  > {nome} aggiornato")

    if check and not divergenti:
        print("Store Edition allineata.")
    return 1 if divergenti else 0


if __name__ == "__main__":
    raise SystemExit(main())
