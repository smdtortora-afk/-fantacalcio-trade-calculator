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

CURRENT_SEASON = 2026
PREVIOUS_SEASON = 2025

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


def fetch_all_players(season):
    out = []
    page = 1

    while True:
        data = api_get(
            "players",
            {
                "league": LEAGUE_ID,
                "season": season,
                "page": page
            }
        )

        errors = data.get("errors")

        if errors:
            print(
                f"API warning season {season}: "
                f"{errors}"
            )

        out.extend(data.get("response", []))

        paging = data.get("paging") or {}

        if page >= int(paging.get("total") or 1):
            break

        page += 1

    print(
        f"API season {season}: "
        f"{len(out)} player records"
    )

    return out


def best_stat_block(item):
    stats = item.get("statistics") or []

    for st in stats:
        league = (st.get("league") or {}).get("id")

        if league == LEAGUE_ID:
            return st

    return stats[0] if stats else {}


def similarity(
    local,
    api_name,
    local_team="",
    api_team=""
):
    a = norm(local)
    b = norm(api_name)

    score = SequenceMatcher(
        None,
        a,
        b
    ).ratio()

    if surname(a) and surname(a) == surname(b):
        score += 0.25

    if (
        local_team
        and api_team
        and norm(local_team) == norm(api_team)
    ):
        score += 0.20

    return score


def make_index(remote):
    indexed = []

    for item in remote:
        st = best_stat_block(item)

        p = item.get("player") or {}

        team = (
            st.get("team") or {}
        ).get("name", "")

        indexed.append(
            {
                "name": p.get("name", ""),
                "team": team,
                "stats": st,
                "api_id": p.get("id")
            }
        )

    return indexed


def find_best(lp, indexed):
    best = None
    best_score = 0

    for item in indexed:
        score = similarity(
            lp.get("name", ""),
            item["name"],
            lp.get("team", ""),
            item["team"]
        )

        if score > best_score:
            best_score = score
            best = item

    if best_score >= 0.82:
        return best, best_score

    return None, best_score


def extract_raw_stats(st):
    games = st.get("games") or {}
    goals = st.get("goals") or {}
    cards = st.get("cards") or {}

    apps = int(
        games.get("appearences") or 0
    )

    minutes = int(
        games.get("minutes") or 0
    )

    starts = int(
        games.get("lineups") or 0
    )

    rating_raw = games.get("rating")

    try:
        rating = (
            float(rating_raw)
            if rating_raw is not None
            else None
        )
    except:
        rating = None

    return {
        "apps": apps,
        "minutes": minutes,
        "starts": starts,
        "rating": rating,
        "goals": int(
            goals.get("total") or 0
        ),
        "assists": int(
            goals.get("assists") or 0
        ),
        "yellow": int(
            cards.get("yellow") or 0
        ),
        "red": int(
            cards.get("red") or 0
        ),
        "conceded": int(
            goals.get("conceded") or 0
        ),
        "position": norm(
            games.get("position") or ""
        )
    }


def internal_mv(raw):
    rating = raw["rating"]

    if rating is None:
        return None

    return max(
        4.5,
        min(
            7.5,
            6.0 + (rating - 6.8) * 0.70
        )
    )


def internal_fm(raw, mv):
    if mv is None:
        return None

    apps = max(1, raw["apps"])

    fm = mv

    fm += (
        3.0 * raw["goals"]
        + 1.0 * raw["assists"]
        - 0.5 * raw["yellow"]
        - 1.0 * raw["red"]
    ) / apps

    if "goalkeeper" in raw["position"]:
        fm -= min(
            0.45,
            raw["conceded"]
            / apps
            * 0.08
        )

    return max(
        4.0,
        min(9.5, fm)
    )


def season_weight(current_apps):
    # Prime giornate: affidabilità ridotta.
    if current_apps <= 0:
        return 0.0

    if current_apps == 1:
        return 0.10

    if current_apps == 2:
        return 0.18

    if current_apps == 3:
        return 0.28

    if current_apps == 4:
        return 0.40

    if current_apps == 5:
        return 0.52

    if current_apps == 6:
        return 0.63

    if current_apps == 7:
        return 0.73

    if current_apps == 8:
        return 0.82

    if current_apps == 9:
        return 0.90

    return 1.0


def blend_number(
    previous,
    current,
    weight
):
    if current is None:
        return previous

    if previous is None:
        return current

    return (
        previous * (1 - weight)
        + current * weight
    )


def build_values(
    current_stats,
    previous_stats
):
    current_raw = (
        extract_raw_stats(current_stats)
        if current_stats
        else None
    )

    previous_raw = (
        extract_raw_stats(previous_stats)
        if previous_stats
        else None
    )

    current_apps = (
        current_raw["apps"]
        if current_raw
        else 0
    )

    weight = season_weight(
        current_apps
    )

    current_mv = (
        internal_mv(current_raw)
        if current_raw
        else None
    )

    previous_mv = (
        internal_mv(previous_raw)
        if previous_raw
        else None
    )

    current_fm = (
        internal_fm(
            current_raw,
            current_mv
        )
        if current_raw
        else None
    )

    previous_fm = (
        internal_fm(
            previous_raw,
            previous_mv
        )
        if previous_raw
        else None
    )

    mv = blend_number(
        previous_mv,
        current_mv,
        weight
    )

    fm = blend_number(
        previous_fm,
        current_fm,
        weight
    )

    minutes = (
        current_raw["minutes"]
        if current_raw
        else 0
    )

    starts = (
        current_raw["starts"]
        if current_raw
        else 0
    )

    if current_apps > 0:
        stats_season = CURRENT_SEASON

    elif previous_raw:
        stats_season = PREVIOUS_SEASON

    else:
        stats_season = None

    return {
        "pv": current_apps,
        "minutes": minutes,
        "starts": starts,
        "mv": (
            round(mv, 2)
            if mv is not None
            else None
        ),
        "fm": (
            round(fm, 2)
            if fm is not None
            else None
        ),
        "current_weight": round(
            weight,
            2
        ),
        "stats_season": stats_season
    }


def main():
    local = load_players()

    print(
        "Loading API-Football "
        "Serie A seasons..."
    )

    current_remote = fetch_all_players(
        CURRENT_SEASON
    )

    previous_remote = fetch_all_players(
        PREVIOUS_SEASON
    )

    current_index = make_index(
        current_remote
    )

    previous_index = make_index(
        previous_remote
    )

    updated = 0
    current_matches = 0
    previous_matches = 0

    for lp in local:
        current_best, current_score = (
            find_best(
                lp,
                current_index
            )
        )

        previous_best, previous_score = (
            find_best(
                lp,
                previous_index
            )
        )

        if current_best:
            current_matches += 1

        if previous_best:
            previous_matches += 1

        current_stats = (
            current_best["stats"]
            if current_best
            else None
        )

        previous_stats = (
            previous_best["stats"]
            if previous_best
            else None
        )

        if (
            current_stats is None
            and previous_stats is None
        ):
            continue

        vals = build_values(
            current_stats,
            previous_stats
        )

        lp.update(vals)

        lp["stats_source"] = (
            "api-football"
        )

        if current_best:
            lp["api_id"] = (
                current_best["api_id"]
            )

        elif previous_best:
            lp["api_id"] = (
                previous_best["api_id"]
            )

        updated += 1

    save_players(local)

    print(
        f"Matched current season: "
        f"{current_matches}/{len(local)}"
    )

    print(
        f"Matched previous season: "
        f"{previous_matches}/{len(local)}"
    )

    print(
        f"Updated total: "
        f"{updated}/{len(local)}"
    )


if __name__ == "__main__":
    main()
