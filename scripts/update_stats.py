#!/usr/bin/env python3
"""Daily API-Football snapshot. Never rewrites the player list or its UI code.

API reference: https://www.api-football.com/documentation-v3
The existing API_FOOTBALL_KEY GitHub Actions secret is used server-side only.
"""
import collections
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'data' / 'stats.json'
LEAGUE = 135


class SyncError(Exception):
    pass


def declaration(text, name):
    m = re.search(r'\bconst\s+' + re.escape(name) + r'\s*=\s*', text)
    if not m:
        raise SyncError(f'{name}: dichiarazione assente nel listone')
    try:
        return json.JSONDecoder().raw_decode(text[m.end():])[0]
    except (ValueError, TypeError) as exc:
        raise SyncError(f'{name}: JSON non valido') from exc


def load_players():
    text = (ROOT / 'players.js').read_text(encoding='utf-8')
    players = declaration(text, 'PLAYERS')
    meta = declaration(text, 'PLAYERS_META')
    if not isinstance(players, list) or not players:
        raise SyncError('Listone vuoto')
    if len({str(p['id']) for p in players}) != len(players):
        raise SyncError('ID duplicati nel listone')
    return players, meta


def norm(text):
    text = str(text or '').replace('ı', 'i').replace('ø', 'o').replace('ß', 'ss').replace('ð', 'd').replace('þ', 'th').replace('ł', 'l').replace('æ', 'ae').replace('œ', 'oe')
    text = ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', text.lower())).strip()


TEAM_ALIASES = {'internazionale': 'inter', 'inter milan': 'inter', 'ac milan': 'milan',
                'as roma': 'roma', 'hellas verona': 'verona', 'ssc napoli': 'napoli'}


def team_key(name):
    n = norm(name)
    return TEAM_ALIASES.get(n, n)


def name_score(local, player):
    local = norm(local)
    a = local.split()
    names = [norm(player.get('name')), norm(player.get('lastname')),
             norm(f"{player.get('firstname', '')} {player.get('lastname', '')}")]
    score = 0
    for name in names:
        b = name.split()
        if not b:
            continue
        if local == name or sorted(a) == sorted(b):
            score = max(score, 100)
        elif len(a) == 1 and a[0] in b and len(a[0]) > 2:
            score = max(score, 80)
        elif len(a) > 1:
            full = [x for x in a if len(x) > 1]
            initials = [x for x in a if len(x) == 1]
            if full and all(x in b for x in full):
                remaining = list(b)
                for x in full:
                    remaining.remove(x)
                if initials and all(any(y.startswith(x) for y in remaining) for x in initials):
                    score = max(score, 95)
    return score


class Api:
    def __init__(self, key, interval=7.0):
        self.key, self.interval, self.last = key, interval, 0

    def get(self, endpoint, **params):
        url = 'https://v3.football.api-sports.io/' + endpoint + '?' + urllib.parse.urlencode(params)
        for attempt in range(3):
            time.sleep(max(0, self.interval - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            req = urllib.request.Request(url, headers={'x-apisports-key': self.key, 'Accept': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    data = json.load(response)
            except urllib.error.HTTPError as exc:
                if exc.code in (429, 500, 502, 503, 504) and attempt < 2:
                    time.sleep(10 * (attempt + 1))
                    continue
                raise SyncError(f'API-Football HTTP {exc.code}: verificare accesso e quota del servizio') from None
            except (OSError, ValueError) as exc:
                if attempt < 2:
                    continue
                raise SyncError('API-Football non raggiungibile o risposta non valida') from exc
            if not isinstance(data, dict):
                raise SyncError('Formato API-Football non valido')
            if data.get('errors'):
                detail = json.dumps(data['errors'], ensure_ascii=False).replace(self.key, '[redacted]')[:400]
                raise SyncError('API-Football: ' + detail)
            if not isinstance(data.get('response'), list):
                raise SyncError('Risposta API-Football priva dei dati attesi')
            return data
        raise SyncError('API-Football non disponibile')


def fetch_players(api, season):
    rows = []
    page, expected = 1, None
    while True:
        data = api.get('players', league=LEAGUE, season=season, page=page)
        paging = data.get('paging') or {}
        total = int(paging.get('total') or 0)
        if total < 1 or total > 80 or int(paging.get('current') or 0) != page:
            raise SyncError('Paginazione del servizio non valida')
        if expected is not None and expected != total:
            raise SyncError('Paginazione cambiata durante la lettura: riprovare')
        expected = total
        if not data['response']:
            raise SyncError('Pagina statistiche vuota; dati precedenti conservati')
        rows.extend(data['response'])
        print(f'Statistiche: pagina {page}/{total}', flush=True)
        if page == total:
            break
        page += 1
    return rows


def count_games(fixtures, season):
    counts = collections.Counter()
    seen = set()
    for item in fixtures:
        fixture, league = item.get('fixture') or {}, item.get('league') or {}
        if league.get('id') != LEAGUE or league.get('season') != season:
            continue
        if (fixture.get('status') or {}).get('short') not in ('FT', 'AET', 'PEN'):
            continue
        if not fixture.get('id') or fixture['id'] in seen:
            continue
        seen.add(fixture['id'])
        for team in (item.get('teams') or {}).values():
            if team.get('id'):
                counts[team['id']] += 1
    return counts


def make_index(remote, season):
    # A transferred player can appear in more than one row/page.
    indexed = {}
    for item in remote:
        person = item.get('player') or {}
        api_id = person.get('id')
        if not api_id:
            continue
        for st in item.get('statistics') or []:
            league, team = st.get('league') or {}, st.get('team') or {}
            if league.get('id') != LEAGUE or league.get('season') != season or not team.get('id'):
                continue
            if 'appearences' not in (st.get('games') or {}):
                continue
            record = indexed.setdefault(api_id, {'person': person, 'blocks': {}})
            record['blocks'][team['id']] = st
    return list(indexed.values())


def match_player(local, indexed, mappings):
    explicit = mappings.get(str(local['id'])) or local.get('api_id')
    candidates = []
    for row in indexed:
        if not any(team_key((st.get('team') or {}).get('name')) == team_key(local['team']) for st in row['blocks'].values()):
            continue
        if explicit and str(row['person']['id']) == str(explicit):
            return row
        score = name_score(local['name'], row['person'])
        if score >= 80:
            candidates.append((score, row))
    candidates.sort(key=lambda x: x[0], reverse=True)
    if candidates and (len(candidates) == 1 or candidates[0][0] > candidates[1][0]):
        return candidates[0][1]
    return None


def number(value):
    try:
        n = float(value)
        return n if n == n and abs(n) != float('inf') else None
    except (TypeError, ValueError):
        return None


def values(row, local, season, updated):
    totals = collections.Counter()
    rating_total = rating_apps = 0
    for st in row['blocks'].values():
        games, goals, cards, penalties = (st.get(k) or {} for k in ('games', 'goals', 'cards', 'penalty'))
        apps = max(0, int(games.get('appearences') or 0))
        for key, value in {'pv': apps, 'minutes': games.get('minutes'), 'starts': games.get('lineups'),
                           'goals': goals.get('total'), 'assists': goals.get('assists'),
                           'yellow': cards.get('yellow'), 'red': cards.get('red'),
                           'conceded': goals.get('conceded'), 'penaltySaved': penalties.get('saved'),
                           'penaltyMissed': penalties.get('missed')}.items():
            totals[key] += max(0, int(value or 0))
        rating = number(games.get('rating'))
        if rating is not None and apps and 0 <= rating <= 10:
            rating_total += rating * apps
            rating_apps += apps
    apps = totals['pv']
    rating = rating_total / rating_apps if rating_apps else None
    # These are internal indices, explicitly labelled estimates in the UI.
    mv = max(4.5, min(7.5, 6 + (rating - 6.8) * .70)) if rating is not None else None
    fm = None
    if mv is not None and apps:
        bonus = 3 * totals['goals'] + totals['assists'] - .5 * totals['yellow'] - totals['red'] - 3 * totals['penaltyMissed']
        if local['role'] == 'P':
            bonus += 3 * totals['penaltySaved'] - totals['conceded']
        fm = max(2, min(12, mv + bonus / apps))
    return dict(totals, id=local['id'], name=local['name'], team=local['team'], api_id=row['person']['id'],
                rating=round(rating, 2) if rating is not None else None,
                mv=round(mv, 2) if mv is not None else None, fm=round(fm, 2) if fm is not None else None,
                stats_season=season, stats_source='api-football', stats_estimated=True, stats_updated_at=updated)


def build_snapshot(players, meta, remote, fixtures, season, updated, mappings=None):
    games = count_games(fixtures, season)
    matchday = max(games.values(), default=0)
    if not matchday:
        raise SyncError('Nessuna partita conclusa della stagione richiesta: nessun dato sostituito')
    index = make_index(remote, season)
    matched, unmatched, assigned = [], [], set()
    for player in players:
        row = match_player(player, index, mappings or {})
        if row is None or row['person']['id'] in assigned:
            unmatched.append({'id': player['id'], 'name': player['name'], 'team': player['team']})
            continue
        assigned.add(row['person']['id'])
        matched.append(values(row, player, season, updated))
    if len(matched) < max(1, len(players) * .35):
        raise SyncError(f'Copertura insufficiente ({len(matched)}/{len(players)}): snapshot precedente conservato')
    if not any(p['pv'] > 0 and p['fm'] is not None for p in matched):
        raise SyncError('Nessuna statistica utile nella stagione corrente')
    return {'schemaVersion': 1, 'season': season, 'source': 'api-football', 'status': 'ok',
            'lastAttemptAt': updated, 'lastSuccessAt': updated, 'error': None, 'matchday': matchday,
            'matched': len(matched), 'total': len(players), 'unmatched': unmatched, 'players': matched,
            'estimatedAverages': True}


def save_snapshot(data):
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    temp = SNAPSHOT.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(SNAPSHOT)


def main():
    updated = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    try:
        players, meta = load_players()
        season = int(os.environ.get('SERIE_A_SEASON') or str(meta['season']).split('/')[0])
        if season != int(str(meta['season']).split('/')[0]):
            raise SyncError('Stagione API diversa dal listone: aggiornare SERIE_A_SEASON')
        key = os.environ.get('API_FOOTBALL_KEY', '').strip()
        if not key:
            raise SyncError('API_FOOTBALL_KEY assente nei secret GitHub Actions')
        api = Api(key)
        fixtures = api.get('fixtures', league=LEAGUE, season=season)['response']
        remote = fetch_players(api, season)
        mapping_path = ROOT / 'data' / 'player-mappings.json'
        mappings = json.loads(mapping_path.read_text()) if mapping_path.exists() else {}
        snapshot = build_snapshot(players, meta, remote, fixtures, season, updated, mappings)
        save_snapshot(snapshot)
        print(f"Sincronizzazione riuscita: {snapshot['matched']}/{snapshot['total']} giocatori, giornata {snapshot['matchday']}")
        return 0
    except Exception as exc:
        try:
            previous = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            previous = {'schemaVersion': 1, 'players': [], 'lastSuccessAt': None}
        message = str(exc)
        key = os.environ.get('API_FOOTBALL_KEY', '').strip()
        if key:
            message = message.replace(key, '[redacted]')
        previous.update(status='error', lastAttemptAt=updated, error=message[:500])
        save_snapshot(previous)
        print('Sincronizzazione fallita: ' + message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
