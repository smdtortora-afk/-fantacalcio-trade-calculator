#!/usr/bin/env python3
"""Allinea il motore della Store Edition (mobile/www/) a quello della web app.

players.js e fs_engine.js sono copie esatte.
injuries.js viene copiato applicando il de-branding richiesto dalla review degli
store: nessuna menzione di "Fantacalcio" nei testi mostrati all'utente. Resta il
placeholder del campo URL, che e' un indirizzo reale e non una menzione di marca.

Gli URL delle API non vengono piu' riscritti: injuries.js usa window.FS_API(),
vuota sul web (URL relativi) e valorizzata nella Store Edition da
window.FS_API_BASE, definita in mobile/www/index.html.

Uso:
    python3 scripts/sync_mobile.py            applica
    python3 scripts/sync_mobile.py --check    non scrive, esce 1 se divergente
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "mobile" / "www"

COPIE_ESATTE = ["players.js", "fs_engine.js"]

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
    attesi["injuries.js"] = debrand((ROOT / "injuries.js").read_text(encoding="utf-8"))

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
