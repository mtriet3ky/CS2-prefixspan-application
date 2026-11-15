"""Descriptive route profiles and conservative, auditable team movement rules.

No model fitting, labels or source data are modified. One DB row is one
player-round. Team frequencies use one side-round, not player-round support.
"""
from collections import Counter, defaultdict
from pathlib import Path
import functools
import hashlib
import json
import math
import time
import threading
import sqlite3

import pyarrow.parquet as pq
from .learning import ROOT, GAP, bounded_prefixspan, mining_actions, valid_window, metadata

VERSION = 'tactical_macro_rotate_v7_disk_tracks'
LOCK = threading.Lock()
MAPS = {
    'de_mirage': {
        'A': 'A_SITE TETRIS STAIRS JUNGLE SHADOWS FIREBOX DEFAULT TRIPLE_BOX NINJA SANDWICH',
        'B': 'B_SITE BENCH VAN B_PLAT',
        'MID': 'MIDDLE TOP_OF_MID MID_BOXES CATWALK CONNECTOR SNIPER_S_NEST SNIPERS_NEST WINDOW',
        'rush': [('A_RUSH_RAMP', 'A Ramp → A', 'A_RAMP TETRIS', 'A'),
                 ('A_RUSH_PALACE', 'Palace → A', 'PALACE_INTERIOR PALACE PILLARS', 'A'),
                 ('B_RUSH_APPS', 'B Apartments → B', 'B_APARTMENTS APARTMENTS', 'B')],
        'push': [('MID_WINDOW_PUSH', 'Window → Mid', 'SNIPER_S_NEST SNIPERS_NEST WINDOW', 'MIDDLE'),
                 ('MID_CONNECTOR_PUSH', 'Connector → Mid', 'CONNECTOR', 'MIDDLE'),
                 ('TOP_MID_PUSH', 'Mid → Top Mid', 'MIDDLE', 'TOP_OF_MID'),
                 ('UNDERPASS_PUSH', 'Mid → Underpass', 'MIDDLE', 'UNDERPASS'),
                 ('A_RAMP_PUSH', 'A Site → A Ramp', 'A_SITE TETRIS', 'A_RAMP'),
                 ('A_PALACE_PUSH', 'A Site → Palace', 'A_SITE SHADOWS', 'PALACE_INTERIOR PALACE'),
                 ('B_SHORT_PUSH', 'B Short → Catwalk', 'B_SITE B_SHORT', 'CATWALK'),
                 ('B_APPS_PUSH', 'B Site → B Apartments', 'B_SITE VAN', 'B_APARTMENTS')],
        'hold': [('B_APPS_HOLD', 'Giữ B Apartments', 'B_APARTMENTS'), ('MID_FORWARD_HOLD', 'Giữ vị trí phía trước tại Mid', 'MIDDLE CONNECTOR SNIPER_S_NEST SNIPERS_NEST WINDOW'), ('VAN_HOLD', 'Giữ Van', 'TRUCK VAN')],
        'control': [('MID_TAKE', 'Tiến chiếm Mid từ Top Mid', 'MIDDLE TOP_OF_MID MID_BOXES'),
                    ('CONNECTOR_TAKE', 'Tiến chiếm Connector từ Mid', 'CONNECTOR'),
                    ('SHORT_TAKE', 'Tiến chiếm Short từ Mid', 'CATWALK B_SHORT'),
                    ('UNDERPASS_TAKE', 'Underpass → Mid / Connector', 'MIDDLE CONNECTOR')],
        'control_origins': {'MID_TAKE':'T_SPAWN TOP_OF_MID', 'CONNECTOR_TAKE':'MIDDLE TOP_OF_MID',
                            'SHORT_TAKE':'MIDDLE TOP_OF_MID','UNDERPASS_TAKE':'UNDERPASS'},
    },
    'de_inferno': {
        'A': 'A_SITE BACK_SITE_A PIT CEMETERY BALCONY GRILL TRUCK PATIO QUAD',
        'B': 'B_SITE FOUNTAIN COFFINS DARK 1ST 2ND',
        'MID': 'MIDDLE TOP_OF_MID A_SHORT A_LONG ARCH BOILER',
        'rush': [('B_RUSH_BANANA', 'Banana → B', 'BANANA CAR SAND_BAGS_B', 'B'),
                 ('A_RUSH_APPS', 'Apartments → A', 'APARTMENTS CT_APARTMENTS CLOSE_APARTMENTS BALCONY', 'A'),
                 ('A_RUSH_SHORT', 'Mid / Short → A', 'TOP_OF_MID A_SHORT', 'A')],
        'push': [('BANANA_PUSH', 'B Site / Car → Banana', 'B_SITE COFFINS CAR', 'BANANA'),
                 ('MID_PUSH', 'Top Mid → Mid', 'TOP_OF_MID A_SHORT', 'MIDDLE LOWER_MID'),
                 ('APPS_PUSH', 'A Site / Balcony → Apartments', 'A_SITE PIT BALCONY', 'APARTMENTS CT_APARTMENTS')],
        'hold': [('BANANA_HOLD', 'Giữ Banana', 'BANANA CAR SAND_BAGS_B'), ('APPS_HOLD', 'Giữ Apartments', 'APARTMENTS CT_APARTMENTS CLOSE_APARTMENTS')],
        'control_origins': {'BANANA_TAKE':'T_RAMP LOWER_MID BOTTOM_MID', 'TOP_MID_TAKE':'LOWER_MID MIDDLE BOTTOM_MID',
                            'APPS_TAKE':'SECOND_MID T_APARTMENTS SECOND_MID_STAIRS'},
        'control': [('BANANA_TAKE', 'Tiến chiếm Banana từ T Ramp / Lower Mid', 'BANANA CAR SAND_BAGS_B'),
                    ('TOP_MID_TAKE', 'Tiến chiếm Top Mid từ Lower Mid', 'TOP_OF_MID'),
                    ('APPS_TAKE', 'Tiến chiếm Apartments từ Second Mid', 'APARTMENTS CT_APARTMENTS CLOSE_APARTMENTS')],
    },
    'de_dust2': {
        'A': 'A_SITE A_PLATFORM A_DEFAULT_PLANT GOOSE A_RAMP EXTENDED_A',
        'B': 'B_SITE B_PLAT BACK_PLAT B_BACK_SITE B_CAR B_DEFAULT_PLANT B_CLOSET',
        'MID': 'MIDDLE TOP_OF_MID MID_DOORS CT_MID XBOX',
        'rush': [('A_RUSH_LONG', 'Long → A', 'LONG_DOORS A_LONG LONG_A A_CROSS', 'A'),
                 ('A_RUSH_SHORT', 'Short → A', 'CATWALK A_SHORT SHORT_STAIRS', 'A'),
                 ('B_RUSH_TUNNELS', 'Upper Tunnels → B', 'UPPER_TUNNEL UPPER_B_TUNNELS', 'B')],
        'push': [('LONG_PUSH', 'A Long → Long Doors', 'A_LONG LONG_A A_CROSS', 'LONG_DOORS OUTSIDE_LONG'),
                 ('TUNNELS_PUSH', 'B Site → Upper Tunnels', 'B_SITE B_PLAT', 'UPPER_TUNNEL UPPER_B_TUNNELS'),
                 ('MID_PUSH', 'CT Mid → Mid', 'CT_MID MID_DOORS', 'MIDDLE TOP_OF_MID')],
        'hold': [('LONG_HOLD', 'Giữ Long', 'A_LONG LONG_A LONG_DOORS'), ('MID_HOLD', 'Giữ Mid', 'CT_MID MID_DOORS MIDDLE')],
        'control_origins': {'MID_TAKE':'T_SPAWN SUICIDE', 'LONG_TAKE':'OUTSIDE_LONG T_SPAWN'},
        'control': [('MID_TAKE', 'Tiến chiếm Mid từ T Spawn / Suicide', 'MIDDLE TOP_OF_MID XBOX'),
                    ('LONG_TAKE', 'Tiến chiếm Long từ Outside Long', 'A_LONG LONG_A LONG_DOORS')],
    },
}
RULES = {
    'rush': {'players': 3, 'entry_before_seconds': 35, 'route_max_seconds': 20,
             'entry_spread_seconds': 8, 'minimum_sampled_move_speed': 140},
    'take': {'players': 2, 'presence_seconds_per_player': 5, 'overlap_seconds': 3,
             'before_seconds': 45, 'requires_named_approach_route': True},
    'entry': {'following_teammate_seconds': 8, 'site_regions': ['A_SITE','B_SITE'],
              'meaning': 'First observed T entering site, followed by >=1 teammate; not entry-frag role. Exclude simultaneous first entries and entries after plant.'},
    'push': {'route_max_seconds': 20},
    'hold': {'minimum_observed_hold_seconds': 3, 'source': 'Existing validated HOLD event; not inferred from MOVE'},
    'rotate': {'earliest_departure_seconds': 15, 'route_max_seconds': 40},
    'role': {'window_seconds': [10, 35], 'minimum_known_seconds': 10,
             'minimum_zone_seconds': 8, 'minimum_zone_share': .5,
             'minimum_rounds_for_description': 10},
    'continuity': 'No route spans a continuity_segment boundary. Presence uses alive, valid samples with dt <= 0.75s.',
}


def words(s): return set(s.split())


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as stream:
        json.dump(obj, stream, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    tmp.replace(path)


def weapon_group(inventory):
    """Opening owned primary, not the knife currently being held."""
    names = [i.get('weaponName', '').lower() for i in inventory]
    if 'awp' in names: return 'AWP'
    if any(n in ['ssg 08', 'scar-20', 'g3sg1'] for n in names): return 'Other'
    classes = {i.get('weaponClass', '') for i in inventory}
    for source, target in [('Rifle', 'Rifle'), ('SMG', 'SMG')]:
        if source in classes: return target
    if any(c in classes for c in ['Heavy', 'Shotgun', 'Machine Gun', 'Machinegun']): return 'Other'
    # Unknown primary must not silently become a pistol-only round.
    if 'Unknown' in classes: return 'Unknown'
    return 'Pistol' if 'Pistols' in classes else 'Unknown'


def runs(track, regions, begin=0, end=9999):
    result = []; current = None; previous = None
    for p in track:
        valid = p['alive'] and p['valid'] and p['region'] in regions and begin <= p['t'] <= end
        if valid:
            if current is not None and previous is not None and 0 < p['t'] - previous <= .75:
                current[1] = p['t']
            else:
                current = [p['t'], p['t']]; result.append(current)
            previous = p['t']
        else: current = None; previous = None
    return [r for r in result if r[1] > r[0]]


def route_hit(events, origins, destinations, max_seconds, after=0, before=9999,validator=None):
    for i, first in enumerate(events):
        if first['region'] not in origins or first['seconds'] < after: continue
        for j in range(i + 1, len(events)):
            last = events[j]
            if last.get('continuity_segment', 0) != first.get('continuity_segment', 0): break
            if last['seconds'] - first['seconds'] > max_seconds: break
            if last['region'] in destinations and last['available_seconds'] <= before:
                if validator is not None and not validator(last):continue
                return i, j
    return None


def evidence(seq, i=0, j=None):
    ev = seq['events'][i:(j + 1 if j is not None else len(seq['events']))]
    return dict(sequence_id=seq['sequence_id'], round_id=seq['round_id'], player_id=seq['player_id'],
                player_name=seq['player_name'], round_num=seq['round_num'], demo_id=seq['demo_id'],
                start=ev[0]['seconds'] if ev else 0, end=ev[-1]['available_seconds'] if ev else 0,
                events=ev)


def macro_rotate(track,origin,target):
    previous=None;origin_start=None;last_origin=None;target_start=None
    for p in track:
        valid=p['alive'] and p['valid'] and p['region'] and p['region']!='UNKNOWN'
        if not valid or previous is not None and p['t']-previous>.75:
            origin_start=last_origin=target_start=None
        if not valid:previous=None;continue
        zone=p.get('macro_zone')
        if zone==origin and p['t']>=15:
            if origin_start is None:origin_start=p['t']
            if p['t']-origin_start>=.5:last_origin=p['t']
            target_start=None
        else:
            origin_start=None
            if zone==target and last_origin is not None and p['t']-last_origin<=40:
                if target_start is None:target_start=p['t']
                if p['t']-target_start>=.5:return last_origin,p['t']
            else:target_start=None
        previous=p['t']
    return None


def team_events(seqs, tracks, raw_events, meta):
    from .tactical_regions import observed_destination
    config = MAPS[meta['map']]; result = []
    def emit(side, suffix, title, layer, proof, note):
        result.append(dict(label=f"{side}_{meta['map'][3:].upper()}_{suffix}", title=title,
            side=side, layer=layer, round_id=meta['round_id'], round_num=meta['round_num'],
            start=min(p['start'] for p in proof), end=max(p['end'] for p in proof),
            participants=proof, rule=note, status='rule_candidate'))
    for code, title, origin, site in config['rush']:
        hits = []
        for s in seqs:
            if s['side'] != 'T': continue
            h = route_hit(s['events'], words(origin), words(config[site]), 20, before=35)
            if h:
                ev = s['events'][h[0]:h[1]+1]
                # Every MOVE in the route has measured displacement statistics.
                duration = sum(e.get('duration_seconds', 0) for e in ev)
                speed = sum(e.get('path_distance', 0) for e in ev) / duration if duration else 0
                if speed >= 140: hits.append(evidence(s, *h))
        hits.sort(key=lambda p:p['end'])
        for k, first in enumerate(hits):
            group = [p for p in hits[k:] if p['end'] - first['end'] <= 8]
            if len(group) >= 3:
                emit('T', code, 'Dấu hiệu Rush: '+title, 3, group,
                     '≥3 T; vào vùng site ≤35s; cửa sổ đến 8s; tuyến ≤20s; tốc độ MOVE đo được ≥140 units/s.'); break
    for side in ['T', 'CT']:
        if side == 'T':
            for code, title, region in config['control']:
                intervals = [(a,b,s) for s in seqs if s['side']=='T'
                             for a,b in runs(tracks[s['sequence_id']], words(region), end=45) if b-a>=5
                             and route_hit(s['events'],words(config['control_origins'][code]),words(region),30,before=b+.8)]
                found = False
                for i,(a,b,s) in enumerate(intervals):
                    for c,d,other in intervals[i+1:]:
                        if s['player_id']==other['player_id'] or min(b,d)-max(a,c)<3: continue
                        proof=[]
                        for x,start,end in [(s,a,b),(other,c,d)]:
                            p=evidence(x);p.update(start=start,end=end,events=[]);proof.append(p)
                        emit('T',code,title,2,proof,'Tuyến tiếp cận đúng hướng; ≥2 T hiện diện liên tục ≥5s mỗi người, chồng lấp ≥3s trong 45s đầu. Hiện diện không chứng minh kiểm soát hoàn toàn.');found=True;break
                    if found: break
        else:
            for code,title,regions in config['hold']:
                for s in seqs:
                    if s['side']!='CT':continue
                    e=next((e for e in raw_events if e['player_id']==s['player_id'] and e['action']=='HOLD' and e['region'] in words(regions) and e.get('duration_seconds',0)>=3),None)
                    if e:
                        p=evidence(s);p.update(start=e['seconds'],end=e['available_seconds'],events=[e])
                        region=canonical_hold_region(meta['map'],e['region']);title=region_title(region)
                        emit('CT','HOLD_'+region,'Giữ '+title,2,[p],'HOLD đã được bộ tiền xử lý xác nhận, kéo dài ≥3s tại '+title+'; không suy từ tuyến MOVE.')
            for code,title,origin,target in config['push']:
                proof=[]
                for s in seqs:
                    if s['side']!='CT': continue
                    h=route_hit(s['events'],words(origin),words(target),20,
                                validator=lambda last:observed_destination(meta['map'],tracks[s['sequence_id']],last,words(target)))
                    if h: proof.append(evidence(s,*h))
                # Solo push and coordinated push are not conflated: one detection per player.
                for p in proof:emit('CT',code,'Đẩy: '+title,2,[p],'CT đi đúng hướng trong ≤20s, cùng continuity segment; ít nhất 2 mẫu liên tiếp nằm trong polygon callout vùng đích. Không suy ra phối hợp đội.')
            for a,b in [('A','B'),('B','A')]:
                for s in seqs:
                    if s['side']!='CT':continue
                    h=macro_rotate(tracks[s['sequence_id']],a,b)
                    if h:
                        p=evidence(s);p.update(start=h[0],end=h[1],events=[])
                        emit('CT',f'ROTATE_{a}_{b}',f'Rotate {a} → {b}',4,[p],'Rời vùng NAV tổng thể sau giây 15, vào vùng NAV site kia trong ≤40s; cần ≥2 mẫu tại mỗi đầu và không vượt UNKNOWN, chết hoặc khoảng trống >0.75s.')
    # First observable entry, with an actual following teammate. Ties at 2Hz
    # cannot establish order and are deliberately left unlabelled.
    plant=min((e['seconds'] for e in raw_events if e['action']=='PLANT'),default=math.inf)
    for site in ['A','B']:
        entrants=[]
        for s in seqs:
            if s['side']!='T':continue
            previous=None
            for p in tracks[s['sequence_id']]:
                valid=p['alive'] and p['valid'] and p['region'] and p['region']!='UNKNOWN'
                if valid and previous and 0<p['t']-previous['t']<=.75 and previous['region']!=site+'_SITE' and p['region']==site+'_SITE' and p['t']<plant:
                    entrants.append((p['t'],s));break
                previous=p if valid else None
        entrants.sort(key=lambda x:(x[0],x[1]['player_id']))
        if len(entrants)>=2 and 0<entrants[1][0]-entrants[0][0]<=8:
            second,leader=entrants[0]
            proof=evidence(leader);proof.update(start=max(0,second-4),end=second,events=[])
            emit('T','ENTRY_'+site,'Đi đầu vào '+site+' Site',4,[proof],
                 'Người T đầu tiên quan sát vào vùng '+site+'_SITE, có đồng đội vào theo trong ≤8s, trước plant; không gắn entry fragger, bỏ trường hợp đồng thời.')
    for e in raw_events:
        if e['action']!='PLANT': continue
        s=next((s for s in seqs if s['player_id']==e['player_id']),None)
        if s:
            p=evidence(s);p.update(start=e['seconds'],end=e['seconds'],events=[e])
            emit('T','PLANT_'+str(e.get('bomb_site') or e['region']), 'Đặt bom '+str(e.get('bomb_site') or e['region']),4,[p],'Sự kiện bomb_planted quan sát trực tiếp, không suy từ đường đi.')
    return sorted(result,key=lambda x:(x['end'],x['label']))


def source_fingerprint():
    h=hashlib.sha256(Path(__file__).read_bytes())
    for name in ['round_metadata.parquet','sequences.jsonl','assets/macro_regions_v1.json']:
        p=ROOT/name
        with p.open('rb') as f:h.update(hashlib.file_digest(f,'sha256').digest())
    for p in sorted((ROOT/'demos').glob('*/player_states.parquet')):
        h.update(str((p.parent.name,p.stat().st_size,p.stat().st_mtime_ns)).encode())
    for p in sorted((ROOT/'demos').glob('*/events.jsonl')):
        h.update(str((p.parent.name,p.stat().st_size,p.stat().st_mtime_ns)).encode())
    return h.hexdigest()


@functools.lru_cache(maxsize=1)
def dataset():
    fingerprint=source_fingerprint();path=ROOT/'analysis'/f'{VERSION}_{fingerprint[:16]}.json'
    if path.exists():return json.loads(path.read_text(encoding='utf-8'))
    from .macro_regions import load as load_macros
    macro=load_macros()['maps']
    zone_ids={m:{aid:z for z,g in zones.items() for aid in g['area_ids']} for m,zones in macro.items()}
    world_maps=json.loads((ROOT/'assets/map_data.json').read_text());allseq=[];summaries=[];detections=[];metas=metadata();bydemo=defaultdict(list)
    disk_tracks=len({m['demo_id'] for m in metas})>40
    track_store=None
    if disk_tracks:
        track_path=ROOT/'analysis'/('tracks_'+fingerprint[:16]+'.sqlite')
        track_path.parent.mkdir(parents=True,exist_ok=True)
        track_store=sqlite3.connect(track_path)
        track_store.execute('CREATE TABLE IF NOT EXISTS tracks (sequence_id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    for m in metas:bydemo[m['demo_id']].append(m)
    for demo, ms in bydemo.items():
        folder=ROOT/'demos'/demo
        seqs=[json.loads(line) for line in (folder/'sequences.jsonl').open(encoding='utf-8')]
        groups=defaultdict(list);states=defaultdict(list);events=defaultdict(list)
        for s in seqs:groups[s['round_id']].append(s)
        columns=['round_id','player_id','elapsed_seconds','is_alive','valid_snapshot','region','x','y','radar_x','radar_y','inventory_json','nav_area_id']
        for p in pq.read_table(folder/'player_states.parquet',columns=columns).to_pylist():
            states[(p['round_id'],p['player_id'])].append(p)
        for line in (folder/'events.jsonl').open(encoding='utf-8'):
            e=json.loads(line);events[e['round_id']].append(e)
        for m in ms:
            tracks={};local=[];world=world_maps[m['map']]
            for s in groups[m['round_id']]:
                rows=sorted(states[m['round_id'],s['player_id']],key=lambda p:p['elapsed_seconds'])
                track=[dict(t=p['elapsed_seconds'],region=p['region'],alive=p['is_alive'],valid=p['valid_snapshot'],
                            macro_zone=zone_ids[m['map']].get(p['nav_area_id']),nav_area_id=p['nav_area_id'],
                            x=(p['x']-world['pos_x'])/world['scale'],y=(world['pos_y']-p['y'])/world['scale']) for p in rows]
                # Retain full 2Hz samples; no interpolation across UNKNOWN/death/gaps.
                tracks[s['sequence_id']]=track
                opening=rows[0] if rows and rows[0]['elapsed_seconds']<=1 else None
                group=weapon_group(json.loads(opening['inventory_json'])) if opening else 'Unknown'
                ev=[{k:e.get(k) for k in ['label','region','seconds','end_seconds','available_seconds','continuity_segment','duration_seconds','path_distance','x','y']} for e in s['events']]
                compact={k:s[k] for k in ['sequence_id','round_id','round_num','demo_id','match_id','player_id','player_name','map','side','split']}
                holds=[e for e in events[m['round_id']] if e['player_id']==s['player_id'] and e['action']=='HOLD' and e.get('duration_seconds',0)>=3
                       and e['region'] and e['region'] not in ['UNKNOWN','CT_SPAWN','T_SPAWN']]
                compact.update(events=ev,weapon_group=group,opening_inventory=json.loads(opening['inventory_json']) if opening else [],track=track,holds=holds)
                known=sum(b-a for a,b in runs(track,{p['region'] for p in track if p['region'] and p['region']!='UNKNOWN'},10,35))
                macro_track=[dict(p,region=p['macro_zone'] if p['region'] and p['region']!='UNKNOWN' else None) for p in track]
                zones={z:sum(b-a for a,b in runs(macro_track,{z},10,35)) for z in ['A','B','MID']}
                best=max(zones,key=zones.get);role=best if known>=10 and zones[best]>=8 and zones[best]/known>=.5 else ('MIXED' if known>=10 else 'INSUFFICIENT')
                compact.update(role_zone=role,known_role_seconds=known,zone_seconds=zones)
                local.append(compact)
            ds=team_events(local,tracks,events[m['round_id']],m)
            for s in local:s['behaviors']=sorted({d['label'] for d in ds if any(p['player_id']==s['player_id'] for p in d['participants'])})
            detections.extend(ds);summaries.append(m)
            for compact in local:
                if track_store is not None:
                    track_store.execute('INSERT OR REPLACE INTO tracks VALUES (?,?)',
                        (compact['sequence_id'],json.dumps(compact.pop('track'),separators=(',',':'))))
                    compact['track_store']=track_path.name
                allseq.append(compact)
        if track_store is not None:
            track_store.commit()
            print('TACTICAL',demo,len(summaries),'rounds',flush=True)
    if track_store is not None:track_store.close()
    data=dict(version=VERSION,fingerprint=fingerprint,sequences=allseq,rounds=summaries,detections=detections,rules=RULES)
    dump(path,data);return data


def catalog():
    data=dataset();players={}
    for s in data['sequences']:
        p=players.setdefault(s['player_id'],dict(id=s['player_id'],name=s['player_name'],rounds=0,maps=set()))
        p['rounds']+=1;p['maps'].add(s['map'])
    return dict(version=VERSION,fingerprint=data['fingerprint'],players=[dict(p,maps=sorted(p['maps'])) for p in sorted(players.values(),key=lambda x:-x['rounds'])],
                maps=sorted({s['map'] for s in data['sequences']}),rules=RULES,
                round_count=len(data['rounds']),demo_count=len({r['demo_id'] for r in data['rounds']}),
                scope='Verified corpus currently loaded by replay; background collection is not automatically included.')


@functools.lru_cache(maxsize=24)
def profile(player,mapname,side,weapon='all',split='all',bp=200):
    data=dataset()
    if mapname not in MAPS or side not in ['CT','T'] or split not in ['all','train','validation','test'] or weapon not in ['all','Rifle','AWP','SMG','Pistol','Other','Unknown']:raise ValueError('Bộ lọc không hợp lệ')
    seqs=[s for s in data['sequences'] if s['player_id']==player and s['map']==mapname and s['side']==side and (weapon=='all' or s['weapon_group']==weapon) and (split=='all' or s['split']==split)]
    n=len(seqs);patterns=[]
    if n:
        with LOCK:found=bounded_prefixspan([mining_actions(s) for s in seqs],max(1,math.ceil(n*bp/10000)),time.monotonic()+45)
        for p,count in sorted(found.items(),key=lambda x:(-x[1],-len(x[0]),x[0])):
            if len(p)<2 or GAP in p:continue
            proofs=[]
            for s in seqs:
                for i in range(len(s['events'])-len(p)+1):
                    if tuple(e['label'] for e in s['events'][i:i+len(p)])==p and valid_window(s,i,len(p)):
                        proofs.append(evidence(s,i,i+len(p)-1));break
            assert count==len(proofs)
            patterns.append(dict(actions=p,support_count=count,total_sequences=n,support=count/n,
                                 matches=len({s['demo_id'] for s in proofs}),evidence=proofs))
    roles=location_roles(seqs,data['detections'],mapname,side)
    return dict(player_id=player,map=mapname,side=side,weapon=weapon,split=split,sequences=n,matches=len({s['demo_id'] for s in seqs}),
                min_sup=bp/100,patterns=patterns,roles=roles,role_excluded=sum(s['role_zone']=='INSUFFICIENT' for s in seqs),
                weapon_counts=dict(Counter(s['weapon_group'] for s in seqs)),support_unit='player-round',descriptive_only=True)


def canonical_hold_region(mapname,region):
    return 'VAN' if mapname=='de_mirage' and region=='TRUCK' else region


def region_title(region):
    aliases={'SNIPER_S_NEST':'Window','SNIPERS_NEST':'Window','MIDDLE':'Mid','TOP_OF_MID':'Top Mid',
             'CT_APARTMENTS':'CT Apartments','A_SITE':'A Site','B_SITE':'B Site'}
    return aliases.get(region,region.replace('_',' ').title())


def location_roles(seqs,detections,mapname,side):
    """One row per named route/location. No anonymous PUSH/HOLD buckets."""
    byid={s['sequence_id']:s for s in seqs};groups={};n=len(seqs)
    def add(code,title,category,route,proof,definition):
        g=groups.setdefault(code,dict(code=code,label=title,category=category,route=route,definition=definition,proofs={}))
        g['proofs'].setdefault(proof['sequence_id'],proof)
    for d in detections:
        if d['side']!=side:continue
        code=d['label'];title=d['title'];category=None;route=''
        if code.endswith('_PUSH'):
            route=title.removeprefix('Đẩy: ');origin,target=route.split(' → ')
            title=f'Đẩy {target} từ {origin}';category='Đẩy chủ động'
        elif '_ROTATE_' in code:category='Rotate';route=title.removeprefix('Rotate ')
        elif code.endswith('_TAKE'):category='Tiến chiếm';route=title.removeprefix('Tiến chiếm ')
        elif '_ENTRY_' in code:category='Entry';site=code.rsplit('_',1)[-1];title=f'Entry {site} Site · đi đầu';route=site+' Site'
        elif '_RUSH_' in code:category='Rush';route=title.removeprefix('Dấu hiệu Rush: ');title='Rush '+route
        if not category:continue
        for p in d['participants']:
            if p['sequence_id'] in byid:add(code,title,category,route,p,d['rule'])
    # Holds are split by exact mapped region, even when a team rule groups Mid areas.
    for s in seqs:
        for e in s['holds']:
            title=region_title(canonical_hold_region(mapname,e['region']));p=evidence(s);p.update(start=e['seconds'],end=e['available_seconds'],events=[e])
            add(f'{side}_{mapname[3:].upper()}_HOLD_{title.upper().replace(" ","_")}','Giữ '+title,'Giữ vị trí',title,p,
                'HOLD quan sát ≥3s tại '+title+'; mỗi player-round chỉ đếm một lần cho khu vực này.')
    if side=='CT':
        for zone,title in [('A','Triển khai quanh A Site'),('B','Triển khai quanh B Site'),('MID','Triển khai tại Mid')]:
            for s in seqs:
                if s['role_zone']==zone:
                    p=evidence(s);p.update(start=10,end=35,events=[])
                    add(f'CT_{mapname[3:].upper()}_DEPLOY_{zone}',title,'Triển khai đầu round',zone,p,
                        'Vùng NAV tổng thể chiếm ≥50% thời gian đã biết, ≥8s trong giây 10–35; cần ≥10s quan sát. Các ô NAV được gán bằng nhãn khu vực gốc, ≥3 mẫu và ≥60% đồng thuận; ô mơ hồ bị loại. Mẫu số là toàn bộ round qua bộ lọc.')
    result=[]
    for g in groups.values():
        proofs=list(g.pop('proofs').values());paths=[]
        for p in proofs:
            s=byid[p['sequence_id']];chunk=[];previous=None
            for v in sequence_track(s):
                valid=v['alive'] and v['valid'] and v['region'] and v['region']!='UNKNOWN'
                if not valid or previous is not None and v['t']-previous>.75:
                    if chunk:paths.append(chunk)
                    chunk=[]
                if valid:chunk.append([v['x'],v['y']]);previous=v['t']
                else:previous=None
            if chunk:paths.append(chunk)
        count=len(proofs)
        result.append(dict(g,count=count,total=n,share=count/n if n else None,sufficient=n>=10,
                           evidence=[p['sequence_id'] for p in proofs],rounds=proofs,map_paths=paths))
    return sorted(result,key=lambda r:(-r['count'],r['category'],r['label']))


def plays(mapname,side='all',split='all'):
    if mapname not in MAPS or side not in ['all','CT','T'] or split not in ['all','train','validation','test']:raise ValueError('Bộ lọc không hợp lệ')
    data=dataset();rounds=[r for r in data['rounds'] if r['map']==mapname and (split=='all' or r['split']==split)];ids={r['round_id'] for r in rounds}
    grouped=defaultdict(list)
    for d in data['detections']:
        if d['round_id'] in ids and (side=='all' or d['side']==side):grouped[d['label']].append(d)
    return dict(rounds=len(rounds),support_unit='side-round',patterns=[dict(label=k,title=v[0]['title'],side=v[0]['side'],layer=v[0]['layer'],
        count=len({d['round_id'] for d in v}),total=len(rounds),frequency=len({d['round_id'] for d in v})/len(rounds) if rounds else 0,
        rule=v[0]['rule'],evidence=v) for k,v in sorted(grouped.items(),key=lambda kv:-len({d['round_id'] for d in kv[1]}))],
        rules=RULES,classification='Rule-based interpretation; not labels discovered or predicted by PrefixSpan.')


@functools.lru_cache(maxsize=128)
def stored_track(filename,sequence_id):
    path=(ROOT/'analysis'/filename).resolve()
    assert path.parent==(ROOT/'analysis').resolve()
    with sqlite3.connect(str(path)) as connection:
        row=connection.execute('SELECT payload FROM tracks WHERE sequence_id=?',(sequence_id,)).fetchone()
    if row is None:raise ValueError('Track is missing for '+sequence_id)
    return json.loads(row[0])

def sequence_track(sequence):
    return sequence['track'] if 'track' in sequence else stored_track(sequence['track_store'],sequence['sequence_id'])

def trace(sequence_id):
    s=next((s for s in dataset()['sequences'] if s['sequence_id']==sequence_id),None)
    if s is None:raise ValueError('Unknown sequence')
    m=next(r for r in dataset()['rounds'] if r['round_id']==s['round_id'])
    return dict(sequence=dict(s,track=sequence_track(s)),metadata=m)


if __name__=='__main__':
    start=time.monotonic();d=dataset()
    print(json.dumps(dict(version=VERSION,rounds=len(d['rounds']),sequences=len(d['sequences']),detections=len(d['detections']),seconds=round(time.monotonic()-start,2))))
