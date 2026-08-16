#!/usr/bin/env python3

import json
import os
import re
import unicodedata
import urllib.request
import urllib.parse
from pathlib import Path
from difflib import SequenceMatcher

ROOT = Path(__file__).resolve().parents[1]
PLAYERS_FILE = ROOT / "players.js"

API_KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()

LEAGUE_ID = 135
SEASON = int(os.environ.get("SERIE_A_SEASON", "2026"))

if not API_KEY:
    raise SystemExit("Missing API_FOOTBALL_KEY")


def norm(s):
    s = "".join(
        c
        for c in unicodedata.normalize("NFKD", s or "")
        if not unicodedata.combining(c)
    )
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def surname(s):
    parts = norm(s).split()
    return parts[-1] if parts else ""


def api_get(path, params):
    url = (
        "https://v3.football.api-sports.io/"
        + path
        + "?"
        + urllib.parse.urlencode(params)
    )

    req = urllib.request.Request(
        url,
        headers={"x-apisports-key": API_KEY}
    )

    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def load_players():
    text = PLAYERS_FILE.read_text(encoding="utf-8")

    m = re.search(
        r"const\s+PLAYERS\s*=\s*(\[.*\])\s*;?\s*$",
        text,
        re.S
    )

    if not m:
        raise SystemExit("players.js format not recognized")

    return json.loads(m.group(1))


def save_players(players):
    PLAYERS_FILE.write_text(
        "const PLAYERS="
        + json.dumps(
            players,
            ensure_ascii=False,
            separators=(",", ":")
        )
        + ";\n",
        encoding="utf-8"
    )


def fetch_all_players():
    out = []
    page = 1

    while True:
        data = api_get(
            "players",
            {
                "league": LEAGUE_ID,
                "season": SEASON,
                "page": page
            }
        )

        out.extend(data.get("response", []))

        paging = data.get("paging") or {}

        if page >= int(paging.get("total") or 1):
            break

        page += 1

    return out


def best_stat_block(item):
    stats = item.get("statistics") or []

    for st in stats:
        league = (st.get("league") or {}).get("id")

        if league == LEAGUE_ID:
            return st

    return stats[0] if stats else {}


def similarity(local, api_name, local_team, api_team):
    a = norm(local)
    b = norm(api_name)

    score = SequenceMatcher(None, a, b).ratio()

    if surname(a) and surname(a) == surname(b):
        score += 0.25

    if norm(local_team) == norm(api_team):
        score += 0.20

    return score


def derive_values(st):
    games = st.get("games") or {}
    goals = st.get("goals") or {}
    cards = st.get("cards") or {}

    apps = int(games.get("appearences") or 0)

    rating_raw = games.get("rating")

    try:
        rating = (
            float(rating_raw)
            if rating_raw is not None
            else None
        )
    except:
        rating = None

    if not apps:
        return None

    # Valori interni Trade Lab.
    # Non sono voti ufficiali Fantacalcio.it.

    mv = None

    if rating is not None:
        mv = max(
            4.5,
            min(
                7.5,
                6.0 + (rating - 6.8) * 0.70
            )
        )

    g = int(goals.get("total") or 0)
    a = int(goals.get("assists") or 0)
    y = int(cards.get("yellow") or 0)
    r = int(cards.get("red") or 0)

    conceded = int(goals.get("conceded") or 0)

    fm = mv

    if fm is not None:

        fm += (
            3.0 * g
            + 1.0 * a
            - 0.5 * y
            - 1.0 * r
        ) / max(1, apps)

        position = norm(
            games.get("position") or ""
        )

        if "goalkeeper" in position:
            fm -= min(
                0.45,
                conceded / max(1, apps) * 0.08
            )

        fm = max(
            4.0,
            min(9.5, fm)
        )

    return {
        "pv": apps,
        "mv": (
            round(mv, 2)
            if mv is not None
            else None
        ),
        "fm": (
            round(fm, 2)
            if fm is not None
            else None
        )
    }


def main():

    local = load_players()
    remote = fetch_all_players()

    indexed = []

    for item in remote:

        st = best_stat_block(item)

        p = item.get("player") or {}

        team = (
            st.get("team") or {}
        ).get("name", "")

        indexed.append(
            (
                p.get("name", ""),
                team,
                st,
                p.get("id")
            )
        )

    matched = 0

    for lp in local:

        best = None
        best_score = 0

        for (
            api_name,
            api_team,
            st,
            api_id
        ) in indexed:

            s = similarity(
                lp.get("name", ""),
                api_name,
                lp.get("team", ""),
                api_team
            )

            if s > best_score:
                best_score = s

                best = (
                    api_name,
                    api_team,
                    st,
                    api_id
                )

        if best and best_score >= 0.82:

            vals = derive_values(best[2])

            if vals:

                lp.update(vals)

                lp["stats_source"] = "api-football"
                lp["api_id"] = best[3]

                matched += 1

    save_players(local)

    print(
        f"Updated {matched}/{len(local)} "
        "players from API-Football"
    )


if __name__ == "__main__":
    main()
