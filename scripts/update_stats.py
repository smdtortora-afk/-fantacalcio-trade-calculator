#!/usr/bin/env python3
"""Free daily statistics from Fantacalcio's public Serie A table.

No API key, account or paid subscription. Two public requests per daily run.
Keep the last successful snapshot on source/network/validation errors.
"""
import datetime as dt
import html
import json
from pathlib import Path
import re
import sys
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'data' / 'stats.json'
SOURCE = 'fantacalcio.it/italia'


def declaration(text, name):
    m = re.search(r'\bconst\s+' + re.escape(name) + r'\s*=\s*', text)
    if not m:
        raise ValueError('Dichiarazione assente: ' + name)
    return json.JSONDecoder().raw_decode(text[m.end():])[0]


def norm(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', str(value)) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', value.lower())


def clean(value):
    return html.unescape(re.sub(r'<[^>]*>', '', value)).strip()


def download(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Fantascam/10.6 (daily public statistics)', 'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read(8_000_001)
        if len(data) > 8_000_000:
            raise ValueError('Risposta troppo grande')
        return data.decode('utf-8')


def check_season(page, season):
    title = re.search(r'<title[^>]*>(.*?)</title>', page, re.S | re.I)
    if not title or not re.search(str(season) + r'\s*[/\-]\s*(?:' + str(season + 1) + '|' + str(season + 1)[-2:] + r')\b', clean(title[1])):
        raise ValueError('La fonte non conferma la stagione richiesta')


def numeric(value, integer=False):
    if value.strip() in ('', '-', '–', '—', 's.v.', 'SV'):
        return None
    number = float(value.replace(',', '.'))
    if not 0 <= number <= 1000 or (integer and not number.is_integer()):
        raise ValueError('Valore statistico non valido')
    return int(number) if integer else number


def parse_stats(page, season):
    check_season(page, season)
    table = re.search(r'<table\b[^>]*\bid="stats"[^>]*>(.*?)</table>', page, re.S)
    if not table:
        raise ValueError('Tabella statistiche non trovata')
    result = {}
    for row in re.findall(r'<tr\b[^>]*\bclass="player-row"[^>]*>(.*?)</tr>', table[1], re.S):
        link = re.search(r'href="https://www\.fantacalcio\.it/serie-a/squadre/([^/]+)/[^/]+/(\d+)/' + str(season) + '-' + str(season + 1)[-2:] + r'/italia"', row)
        name = re.search(r'<th\b[^>]*class="player-name"[^>]*>(.*?)</th>', row, re.S)
        if not link or not name:
            raise ValueError('Identita o stagione calciatore non riconosciuta')
        cells = dict((key, clean(val)) for key, val in re.findall(r'<td\b[^>]*data-col-key="([^"]+)"[^>]*>(.*?)</td>', row, re.S))
        fields = {'pg': 'pv', 'mv': 'mv', 'mfv': 'fm', 'gol': 'goals', 'gs': 'conceded', 'rp': 'penaltySaved', 'ass': 'assists', 'amm': 'yellow', 'esp': 'red'}
        if not all(key in cells for key in fields):
            raise ValueError('Colonne statistiche incomplete')
        values = {field: numeric(cells[key], field not in ('mv', 'fm')) for key, field in fields.items()}
        if values['pv'] is None or values['pv'] > 38:
            raise ValueError('Partite a voto non valide')
        if values['pv'] == 0:
            values['mv'] = values['fm'] = None
        elif values['mv'] is None or values['fm'] is None or not 0 <= values['mv'] <= 10 or not 0 <= values['fm'] <= 30:
            raise ValueError('Medie mancanti o non valide')
        identifier = link[2]
        if identifier in result:
            raise ValueError('Calciatore duplicato nella fonte')
        result[identifier] = dict(values, name=clean(name[1]), team=link[1])
    if len(result) < 300:
        raise ValueError('Tabella incompleta: meno di 300 calciatori')
    return result


def parse_matchday(page, season):
    seasons = set(re.findall(r'href="https://www\.fantacalcio\.it/serie-a/calendario/\d+/(\d{4}-\d{2})/', page))
    if seasons != {f'{season}-{str(season+1)[-2:]}'}:
        raise ValueError('Stagione della classifica non confermata')
    table = re.search(r'<table\b[^>]*class="serie-a-table[^\"]*"[^>]*>(.*?)</table>', page, re.S)
    if not table:
        raise ValueError('Classifica assente')
    teams = {}
    for name, row in re.findall(r'<tr\b[^>]*data-name="([^"]+)"[^>]*>(.*?)</tr>', table[1], re.S):
        played = re.search(r'<td\b[^>]*class="played\b[^\"]*"[^>]*>(.*?)</td>', row, re.S)
        if played:
            teams[norm(html.unescape(name))] = numeric(clean(played[1]), True)
    if len(teams) != 20 or any(n is None or not 0 <= n <= 38 for n in teams.values()):
        raise ValueError('Classifica incompleta o partite non valide')
    return max(teams.values()), teams


def build_snapshot(players, season, stats_page, table_page, updated):
    remote = parse_stats(stats_page, season)
    matchday, teams = parse_matchday(table_page, season)
    matched, unmatched = [], []
    for player in players:
        row = remote.get(str(player['id']))
        if not row or norm(row['name']) != norm(player['name']) or norm(row['team']) != norm(player['team']):
            unmatched.append({k: player[k] for k in ('id', 'name', 'team')})
            continue
        if norm(row['team']) not in teams or row['pv'] > matchday:
            raise ValueError('Statistiche e classifica non coerenti')
        matched.append(dict(row, id=player['id'], name=player['name'], team=player['team'], stats_season=season,
                            stats_source=SOURCE, stats_estimated=False, stats_updated_at=updated))
    if len(matched) < len(players) * .70 or not any(p['pv'] > 0 for p in matched):
        raise ValueError(f'Copertura insufficiente: {len(matched)}/{len(players)}')
    return {'schemaVersion': 1, 'season': season, 'source': SOURCE, 'status': 'ok',
            'sourceUrl': f'https://www.fantacalcio.it/statistiche-serie-a/{season}-{str(season+1)[-2:]}/italia',
            'lastAttemptAt': updated, 'lastSuccessAt': updated, 'error': None, 'matchday': matchday,
            'matched': len(matched), 'total': len(players), 'players': matched, 'unmatched': unmatched,
            'estimatedAverages': False}


def save_snapshot(data):
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    tmp = SNAPSHOT.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(SNAPSHOT)


def main():
    updated = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    try:
        text = (ROOT / 'players.js').read_text(encoding='utf-8')
        players, meta = declaration(text, 'PLAYERS'), declaration(text, 'PLAYERS_META')
        if not players or len({str(p['id']) for p in players}) != len(players):
            raise ValueError('Listone vuoto o ID duplicati')
        season = int(str(meta['season']).split('/')[0])
        url = f'https://www.fantacalcio.it/statistiche-serie-a/{season}-{str(season+1)[-2:]}/italia'
        snapshot = build_snapshot(players, season, download(url), download('https://www.fantacalcio.it/serie-a/classifica'), updated)
        save_snapshot(snapshot)
        print(f"Statistiche gratuite: {snapshot['matched']}/{snapshot['total']} calciatori, giornata {snapshot['matchday']}")
        return 0
    except Exception as exc:
        try:
            previous = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            previous = {'schemaVersion': 1, 'players': [], 'lastSuccessAt': None}
        previous.update(status='error', lastAttemptAt=updated, error=str(exc)[:500])
        save_snapshot(previous)
        print('Aggiornamento fallito; ultimi dati validi conservati: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
