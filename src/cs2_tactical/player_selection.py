"""Team-aware player selection using observed round rosters and SteamIDs."""
from collections import Counter, defaultdict
from functools import lru_cache
import json
import math
import time

from .identifiers import team_key
from .learning import ROOT, GAP, bounded_prefixspan, mining_actions, valid_window
from . import tactical_analysis as analysis


# Confirmed by the Mirage roster and donk's 4-16 K/D at IEM Rio 2026.
# https://www.hltv.org/stats/matches/mapstatsid/226560/spirit-vs-falcons
PROFILE_IDENTITIES = {
    ('cs2_2393226-de_mirage', '76561198018303780'): '76561198386265483',
}


def profile_identity(sequence):
    raw = sequence['player_id']
    return PROFILE_IDENTITIES.get((sequence['demo_id'], raw), raw)


@lru_cache(maxsize=1)
def roster_context():
    data = analysis.dataset()
    metadata = {row['round_id']: row for row in data['rounds']}
    teams = {}
    plan = json.loads((ROOT/'download_plan.json').read_text(encoding='utf-8'))
    for demo in plan['demos']:
        for name in (demo['team1'], demo['team2']):
            teams[team_key(name)] = name
    memberships = {}
    players = {}
    for sequence in data['sequences']:
        meta = metadata[sequence['round_id']]
        team = team_key(meta[sequence['side'].lower()+'_team'])
        memberships[sequence['round_id'], sequence['player_id']] = team
        player = players.setdefault(profile_identity(sequence), dict(names=Counter(), groups={}))
        name = str(sequence['player_name'] or sequence['player_id']).strip()
        player['names'][name] += 1
        key = (team, sequence['map'], sequence['side'], sequence['weapon_group'])
        group = player['groups'].setdefault(key, dict(rounds=0, demos=set()))
        group['rounds'] += 1
        group['demos'].add(sequence['demo_id'])
    return teams, memberships, players


@lru_cache(maxsize=1)
def catalog():
    original = analysis.catalog()
    teams, _, observed = roster_context()
    players = []
    for player_id, player in observed.items():
        contexts = [dict(team_id=team, map=mapname, side=side, weapon=weapon,
                         rounds=counts['rounds'], demo_ids=sorted(counts['demos']))
                    for (team, mapname, side, weapon), counts in player['groups'].items()]
        players.append(dict(id=player_id, name=player['names'].most_common(1)[0][0],
                            rounds=sum(context['rounds'] for context in contexts),
                            maps=sorted({context['map'] for context in contexts}),
                            aliases=sorted(player['names']), contexts=contexts,
                            team_ids=sorted({context['team_id'] for context in contexts})))
    return dict(original, players=sorted(players, key=lambda p: -p['rounds']), teams=[dict(id=key, name=name)
                                                  for key, name in sorted(teams.items(), key=lambda item: item[1])])


@lru_cache(maxsize=24)
def profile(player, mapname, side, weapon='all', split='all', bp=200, team='all'):
    teams, memberships, _ = roster_context()
    if team != 'all' and team not in teams:
        raise ValueError('Đội tuyển không hợp lệ')
    if mapname not in analysis.MAPS or side not in ('CT', 'T') or split not in ('all', 'train', 'validation', 'test'):
        raise ValueError('Bộ lọc không hợp lệ')
    if weapon not in ('all', 'Rifle', 'AWP', 'SMG', 'Pistol', 'Other', 'Unknown') or not 100 <= bp <= 10000:
        raise ValueError('Bộ lọc không hợp lệ')
    data = analysis.dataset()
    sequences = [s for s in data['sequences']
                 if profile_identity(s) == player and s['map'] == mapname and s['side'] == side
                 and (team == 'all' or memberships[s['round_id'], s['player_id']] == team)
                 and (weapon == 'all' or s['weapon_group'] == weapon)
                 and (split == 'all' or s['split'] == split)]
    total = len(sequences)
    patterns = []
    if total:
        with analysis.LOCK:
            found = bounded_prefixspan([mining_actions(s) for s in sequences],
                                       max(1, math.ceil(total*bp/10000)), time.monotonic()+45)
        for actions, count in sorted(found.items(), key=lambda item: (-item[1], -len(item[0]), item[0])):
            if len(actions) < 2 or GAP in actions:
                continue
            proofs = []
            for sequence in sequences:
                for index in range(len(sequence['events'])-len(actions)+1):
                    window = sequence['events'][index:index+len(actions)]
                    if tuple(event['label'] for event in window) == actions and valid_window(sequence, index, len(actions)):
                        proofs.append(analysis.evidence(sequence, index, index+len(actions)-1))
                        break
            assert count == len(proofs)
            patterns.append(dict(actions=actions, support_count=count, total_sequences=total,
                                 support=count/total, matches=len({row['demo_id'] for row in proofs}), evidence=proofs))
    return dict(player_id=player, team_id=team, team_name=teams.get(team), map=mapname, side=side,
                weapon=weapon, split=split, sequences=total,
                matches=len({s['demo_id'] for s in sequences}), min_sup=bp/100,
                patterns=patterns, roles=analysis.location_roles(sequences, data['detections'], mapname, side),
                role_excluded=sum(s['role_zone']=='INSUFFICIENT' for s in sequences),
                weapon_counts=dict(Counter(s['weapon_group'] for s in sequences)),
                support_unit='player-round', descriptive_only=True)
