#!/usr/bin/env python3
"""Riapplica ai progetti nativi le impostazioni che non sopravvivono a `cap add`.

`mobile/ios/` e `mobile/android/` sono gitignorati e vengono rigenerati: ogni
cosa impostata a mano in Xcode o in build.gradle sparisce al giro successivo.
Questo script la rimette, leggendo da `mobile/release.json`, che e' l'unica
fonte dei numeri di versione.

Cosa applica:

  iOS     ITSAppUsesNonExemptEncryption = false in Info.plist
          MARKETING_VERSION e CURRENT_PROJECT_VERSION in project.pbxproj
  Android versionName e versionCode in app/build.gradle
          firma di rilascio in app/build.gradle (vedi sotto)
          tema di avvio scuro in values/styles.xml e icona dello splash
          icona adattiva con fondo pieno in mipmap-anydpi-v26/

Firma Android: chiave e password NON stanno nel repo. build.gradle le legge da
`keystore.properties` nella cartella FANTASCAM_Signing, sorella del repo (o in
quella indicata da FANTASCAM_SIGNING_DIR). Se il file non c'e', come in CI, il
bundle esce non firmato invece di fallire.

Va eseguito dopo `npm run assets`, che riscrive l'icona adattiva.

Sulla dichiarazione di crittografia: App Store Connect chiede a ogni build se
la app usa crittografia. FANTASCAM fa solo chiamate HTTPS, cioe' usa la
crittografia di sistema, che Apple considera esente. Dichiarare `false`
significa "non uso crittografia NON esente" ed e' la risposta corretta finche'
la app non implementa cifratura propria. Se un giorno la implementasse, questa
riga va rivista.

Uso:
    python3 scripts/apply_native.py            applica release.json ai progetti
    python3 scripts/apply_native.py --bump     alza prima il numero di build
    python3 scripts/apply_native.py --check    non scrive, esce 1 se divergente
"""

import json
import plistlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release.json"
INFO_PLIST = ROOT / "ios" / "App" / "App" / "Info.plist"
PBXPROJ = ROOT / "ios" / "App" / "App.xcodeproj" / "project.pbxproj"
GRADLE = ROOT / "android" / "app" / "build.gradle"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

SFONDO = "#090511"

FIRMA_MARCA = "// FANTASCAM: firma di rilascio"
FIRMA = FIRMA_MARCA + """ (generato da scripts/apply_native.py)
def fsSigningDir = System.getenv('FANTASCAM_SIGNING_DIR') ?: rootProject.file('../../../FANTASCAM_Signing').path
def fsSigningFile = new File(fsSigningDir, 'keystore.properties')
if (fsSigningFile.exists()) {
    def fsSigning = new Properties()
    fsSigningFile.withInputStream { fsSigning.load(it) }
    android {
        signingConfigs {
            release {
                storeFile new File(fsSigningDir, fsSigning['storeFile'])
                storePassword fsSigning['storePassword']
                keyAlias fsSigning['keyAlias']
                keyPassword fsSigning['keyPassword']
            }
        }
        buildTypes.release.signingConfig signingConfigs.release
    }
}
"""

# Senza questi colori lo splash di Android 12+ segue il tema del telefono e in
# chiaro lampeggia bianco prima dell'intro.
STYLES = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Generato da scripts/apply_native.py -->
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="android:windowBackground">@color/fantascam_background</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:windowBackground">@color/fantascam_background</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/fantascam_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/fantascam_splash_icon</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
"""
COLORI = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Generato da scripts/apply_native.py -->
<resources>
    <color name="fantascam_background">{SFONDO}</color>
</resources>
"""
# L'icona dello splash occupa 288dp ma il sistema ne mostra solo il cerchio
# centrale da 192dp. Il margine e' in dp: in percentuale servirebbe API 26.
SPLASH = """<?xml version="1.0" encoding="utf-8"?>
<!-- Generato da scripts/apply_native.py -->
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@mipmap/ic_launcher_foreground"
    android:inset="54dp" />
"""
# @capacitor/assets mette un margine anche sul fondo: ai bordi della maschera
# resta un filo trasparente. Il fondo deve essere pieno.
ICONA = """<?xml version="1.0" encoding="utf-8"?>
<!-- Generato da scripts/apply_native.py -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/fantascam_background" />
    <foreground>
        <inset android:drawable="@mipmap/ic_launcher_foreground" android:inset="16.7%" />
    </foreground>
</adaptive-icon>
"""

esiti: list[tuple[bool, str]] = []


def nota(ok: bool, testo: str) -> None:
    esiti.append((ok, testo))
    print(("  = " if ok else "  > ") + testo)


def leggi_release() -> dict:
    if not RELEASE.exists():
        raise SystemExit(f"ERRORE: manca {RELEASE.relative_to(ROOT.parent)}")
    dati = json.loads(RELEASE.read_text(encoding="utf-8"))
    for chiave in ("version", "build"):
        if chiave not in dati:
            raise SystemExit(f"ERRORE: '{chiave}' assente in release.json")
    if not isinstance(dati["build"], int) or dati["build"] < 1:
        raise SystemExit("ERRORE: 'build' deve essere un intero >= 1")
    return dati


def bump(dati: dict) -> dict:
    # Il numero e' unico per i due store: si saltano le build usate su entrambi.
    registro = dati.get("usedBuilds", {})
    usate = set(registro.get("ios", [])) | set(registro.get("android", []))
    nuovo = dati["build"] + 1
    while nuovo in usate:
        nuovo += 1
    dati["build"] = nuovo
    RELEASE.write_text(json.dumps(dati, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  build portata a {nuovo}")
    return dati


def applica_plist(dati: dict, check: bool) -> None:
    if not INFO_PLIST.exists():
        nota(True, "Info.plist assente: progetto iOS non generato, salto")
        return
    with INFO_PLIST.open("rb") as f:
        plist = plistlib.load(f)
    if plist.get("ITSAppUsesNonExemptEncryption") is False:
        nota(True, "Info.plist: dichiarazione crittografia gia' presente")
        return
    if check:
        nota(False, "Info.plist: manca ITSAppUsesNonExemptEncryption")
        return
    plist["ITSAppUsesNonExemptEncryption"] = False
    with INFO_PLIST.open("wb") as f:
        plistlib.dump(plist, f)
    nota(False, "Info.plist: aggiunta ITSAppUsesNonExemptEncryption = false")


def applica_pbxproj(dati: dict, check: bool) -> None:
    if not PBXPROJ.exists():
        nota(True, "project.pbxproj assente: progetto iOS non generato, salto")
        return
    testo = PBXPROJ.read_text(encoding="utf-8")
    atteso = {
        "MARKETING_VERSION": str(dati["version"]),
        "CURRENT_PROJECT_VERSION": str(dati["build"]),
    }
    nuovo = testo
    for chiave, valore in atteso.items():
        schema = re.compile(rf"({re.escape(chiave)} = )[^;]+;")
        if not schema.search(nuovo):
            raise SystemExit(
                f"ERRORE: {chiave} non trovata in project.pbxproj.\n"
                "Il formato del progetto e' cambiato: aggiorna apply_native.py."
            )
        nuovo = schema.sub(rf"\g<1>{valore};", nuovo)
    if nuovo == testo:
        nota(True, f"iOS: gia' {dati['version']} ({dati['build']})")
    elif check:
        nota(False, f"iOS: numeri da allineare a {dati['version']} ({dati['build']})")
    else:
        PBXPROJ.write_text(nuovo, encoding="utf-8")
        nota(False, f"iOS: portato a {dati['version']} ({dati['build']})")


def applica_gradle(dati: dict, check: bool) -> None:
    if not GRADLE.exists():
        nota(True, "build.gradle assente: progetto Android non generato, salto")
        return
    testo = GRADLE.read_text(encoding="utf-8")
    nuovo = re.sub(r"(versionCode )\d+", rf"\g<1>{dati['build']}", testo)
    nuovo = re.sub(r'(versionName )"[^"]*"', rf'\g<1>"{dati["version"]}"', nuovo)
    if "versionCode" not in testo or "versionName" not in testo:
        raise SystemExit("ERRORE: versionCode/versionName non trovati in build.gradle.")
    if nuovo == testo:
        nota(True, f"Android: gia' {dati['version']} ({dati['build']})")
    elif check:
        nota(False, f"Android: numeri da allineare a {dati['version']} ({dati['build']})")
    else:
        GRADLE.write_text(nuovo, encoding="utf-8")
        nota(False, f"Android: portato a {dati['version']} ({dati['build']})")


def applica_firma(check: bool) -> None:
    if not GRADLE.exists():
        return
    testo = GRADLE.read_text(encoding="utf-8")
    base = testo.split(FIRMA_MARCA)[0].rstrip() + "\n"
    nuovo = base + "\n" + FIRMA
    if nuovo == testo:
        nota(True, "Android: firma di rilascio gia' configurata")
    elif check:
        nota(False, "Android: firma di rilascio da configurare")
    else:
        GRADLE.write_text(nuovo, encoding="utf-8")
        nota(False, "Android: configurata la firma di rilascio")


def applica_risorse(check: bool) -> None:
    if not RES.exists():
        return
    file = {
        RES / "values" / "styles.xml": STYLES,
        RES / "values" / "fantascam.xml": COLORI,
        RES / "drawable" / "fantascam_splash_icon.xml": SPLASH,
        RES / "mipmap-anydpi-v26" / "ic_launcher.xml": ICONA,
        RES / "mipmap-anydpi-v26" / "ic_launcher_round.xml": ICONA,
    }
    for percorso, atteso in file.items():
        nome = f"{percorso.parent.name}/{percorso.name}"
        if percorso.exists() and percorso.read_text(encoding="utf-8") == atteso:
            nota(True, f"Android: {nome} gia' a posto")
        elif check:
            nota(False, f"Android: {nome} da riscrivere")
        else:
            percorso.parent.mkdir(parents=True, exist_ok=True)
            percorso.write_text(atteso, encoding="utf-8")
            nota(False, f"Android: riscritto {nome}")


def main() -> int:
    argv = sys.argv[1:]
    check = "--check" in argv
    dati = leggi_release()

    if "--bump" in argv:
        if check:
            raise SystemExit("ERRORE: --bump e --check si escludono.")
        dati = bump(dati)

    print(f"release.json: versione {dati['version']}, build {dati['build']}")
    applica_plist(dati, check)
    applica_pbxproj(dati, check)
    applica_gradle(dati, check)
    applica_firma(check)
    applica_risorse(check)

    divergenti = [t for ok, t in esiti if not ok]
    if check and divergenti:
        print("\nProgetti nativi NON allineati a release.json.")
        return 1
    if check:
        print("\nProgetti nativi allineati.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
