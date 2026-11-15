"""Separate CS2 data/API on localhost; reuses the existing replay UI/miners."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlparse,parse_qs,quote
import collections,functools,json,math
import pyarrow.parquet as pq
from .learning import mine,parse_support,metadata,ROOT,data_fingerprint
from .spatial import token
from . import tactical_analysis as analysis
from .tactical_regions import regions as tactical_regions
from . import team_analysis
from . import player_selection
from .identifiers import team_key
from .config import WEB_DIR
DIST=WEB_DIR

@functools.lru_cache(maxsize=1)
def model_directory():
    base=(ROOT/'models').resolve()
    pointer=base/'active_experiment.json'
    if not pointer.exists():return base
    selected=json.loads(pointer.read_text(encoding='utf-8'))
    folder=(base/selected['folder']).resolve()
    if folder.parent!=base:raise ValueError('Invalid model directory')
    ready=json.loads((folder/'READY.json').read_text(encoding='utf-8'))
    if ready.get('status')!='PASS':raise ValueError('Model experiment has not passed verification')
    return folder

@functools.lru_cache(maxsize=1)
def model_info():return json.loads((model_directory()/'model_info.json').read_text(encoding='utf-8'))

@functools.lru_cache(maxsize=1)
def plan():return {'cs2_'+d['row_id']:d for d in json.loads((ROOT/'download_plan.json').read_text())['demos']}

@functools.lru_cache(maxsize=1)
def rounds():
    rows=[]
    for m in metadata():
        d=plan()[m['demo_id']]
        rows.append(dict(m,teams=[dict(id=team_key(name),name=name) for name in [d['team1'],d['team2']]],file='api/round?id='+quote(m['round_id']),display_label=f"{d['team1']} vs {d['team2']} · {m['event']} · {(m['match_date'][:10] if m.get('match_date') else 'Ngày chưa xác định')} · R{m['round_num']}"))
    return sorted(rows,key=lambda r:({'de_inferno':0,'de_mirage':1,'de_dust2':2}[r['map']],(r.get('match_date') or ''),r['demo_id'],r['round_num']))

@functools.lru_cache(maxsize=1)
def prediction_index():
    rows=pq.read_table(model_directory()/'predictions.parquet').to_pylist();result=collections.defaultdict(list)
    for row in rows:result[row['round_id']].append(row)
    return result

@functools.lru_cache(maxsize=8)
def replay(rid):
    meta=next((r for r in metadata() if r['round_id']==rid),None)
    if meta is None:raise KeyError('Unknown round')
    folder=ROOT/'demos'/meta['demo_id'];states=pq.read_table(folder/'player_states.parquet',filters=[('round_id','=',rid)]).to_pylist()
    snapshots=pq.read_table(ROOT/'snapshot_features.parquet',filters=[('round_id','=',rid)]).to_pylist();snap={r['tick']:r for r in snapshots}
    frames={}
    for raw in states:
        tick=raw['tick'];second=raw['elapsed_seconds']
        if tick not in snap:continue
        row=snap[tick];feature=json.loads(row['features_json']);clock=max(0,int(math.ceil(feature['clock_seconds'])))
        # Networked m_iRoundTime is an integer; the sampled remainder can be fractional.
        frame=frames.setdefault(tick,dict(tick=tick,elapsed_seconds=second,requested_seconds=int(row['seconds']),players=[],bomb_planted=bool(feature['bomb_planted']),
            clock_time=f'{clock//60:02}:{clock%60:02}',bomb_context=json.loads(row['bomb_context_json'])))
        p={k:v for k,v in raw.items() if k not in ['round_id','elapsed_seconds','inventory_json']};p['inventory']=json.loads(raw['inventory_json']);frame['players'].append(p)
    assert all(len(f['players'])==10 for f in frames.values())
    seq=[json.loads(s) for s in (folder/'sequences.jsonl').open(encoding='utf-8') if json.loads(s)['round_id']==rid]
    events=[json.loads(s) for s in (folder/'events.jsonl').open(encoding='utf-8') if json.loads(s)['round_id']==rid]
    predictions=[dict(p) for p in prediction_index()[rid]]
    info=model_info()
    return dict(metadata=meta,frames=sorted(frames.values(),key=lambda r:r['tick']),predictions=predictions,events=events,
        inference_mode='observed_cs2_frame',prediction_models=dict(active=info['chosen_family'],baseline='A_state',pattern=info['primary_comparison']['with_pattern']['id']),
        terminal=dict(tick=meta['end_tick'],seconds=(meta['end_tick']-meta['start_tick'])/meta['tick_rate'],winner=meta['winner'],reason='source round result'),
        move_exploration=dict(version='cs2_move_v2',match_mode='contiguous_move',max_gap=0,sequences=seq,
            auxiliary_events=[e for e in events if e['action'] in ['SMOKE','FLASH','MOLOTOV','HE','KILL','PLANT']]),
        decision_threshold=.5,evaluation_scope=info['evaluation_scope'])

def geometry(mapname):
    if mapname not in ['de_inferno','de_mirage','de_dust2']:raise ValueError('Unsupported map')
    world=json.loads((ROOT/'assets/map_data.json').read_text())[mapname];config=json.loads((ROOT/'assets'/mapname/'registration.json').read_text())
    points={token(c['name']):dict(name=c['name']) for c in config['polygons']}
    return dict(world_to_radar=dict(x=world['pos_x'],y=world['pos_y'],scale=world['scale']),points=points)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(DIST),**kwargs)
    def send_json(self,x):
        payload=json.dumps(x,ensure_ascii=False,allow_nan=False).encode();self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
    def do_GET(self):
        parsed=urlparse(self.path);q=parse_qs(parsed.query);path=parsed.path
        try:
            if path in ['/','/intelligence.html']:
                html=(DIST/'intelligence.html').read_text(encoding='utf-8').replace('CS:GO Tactical Intelligence','CS2 Tactical Replay')
                html=html.replace('<button data-tab="evaluation">Model Evaluation</button>', '<a class="replay-nav-link" href="tactical.html">Khai phá chiến thuật</a>', 1)
                html=html.replace('full-actions-20261114','cs2-major-20261114').replace('<option value="personal">','<option value="personal" disabled>').replace('<option value="all">Xem cả hai nguồn','<option value="all" disabled>Xem cả hai nguồn')
                payload=html.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload);return
            if path=='/api/rounds':return self.send_json(rounds())
            if path=='/api/analysis/catalog':return self.send_json(player_selection.catalog())
            if path=='/api/analysis/regions':return self.send_json(tactical_regions(q.get('map',[''])[0]))
            if path=='/api/analysis/profile':return self.send_json(player_selection.profile(q.get('player',[''])[0],q.get('map',[''])[0],q.get('side',['CT'])[0],q.get('weapon',['all'])[0],q.get('split',['all'])[0],parse_support(q.get('min_sup',['2'])[0]),q.get('team',['all'])[0]))
            if path=='/api/analysis/teams':return self.send_json(team_analysis.teams())
            if path=='/api/analysis/plays':return self.send_json(team_analysis.plays(q.get('map',[''])[0],q.get('side',['CT'])[0],q.get('split',['all'])[0],q.get('team',[''])[0]))
            if path=='/api/analysis/trace':return self.send_json(analysis.trace(q.get('id',[''])[0]))
            if path=='/api/model':return self.send_json(model_info())
            if path=='/api/patterns':return self.send_json(json.loads((ROOT/'models/pattern_dictionary.json').read_text()))
            if path=='/api/round':return self.send_json(replay(q.get('id',[''])[0]))
            if path=='/api/mine':return self.send_json(mine(q.get('map',[''])[0],parse_support(q.get('min_sup',['2'])[0]),q.get('algorithm',['prefixspan'])[0]))
            if path=='/api/player-patterns':return self.send_json(dict(map=q.get('map',[''])[0],profiles=[],patterns=[]))
            if path=='/intelligence/registry.json':
                default=next((r['file'] for r in rounds() if r['match_id']=='2393241' and r['map']=='de_dust2' and r['round_num']==1),None)
                return self.send_json(dict(dataset='CS2 2026',default_map='de_dust2',default_round=default,rounds=rounds(),patterns=[],evaluation=model_info()['evaluation'],coefficients=model_info()['coefficients']))
            if path.startswith('/data/') and path.endswith('_geometry.json'):return self.send_json(geometry(Path(path).name.removesuffix('_geometry.json')))
            if path in ['/assets/de_mirage.png','/assets/de_inferno.png','/assets/de_dust2.png']:
                payload=(ROOT/'assets/radars'/Path(path).name).read_bytes();self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload);return
            return super().do_GET()
        except (ValueError,KeyError) as e:self.send_error(400,str(e))
        except Exception as e:
            import traceback;traceback.print_exc();self.send_error(500,str(e))

def main(port=8767):
    assert (model_directory()/'model_info.json').exists(),'Complete verified CS2 training before starting the demo'
    assert model_info().get('mapping_version')=='cs2_spatial_v2','Refit LR on the spatial v2 data; do not mix a v1 model with v2 mapping'
    assert model_info().get('data_fingerprint')==data_fingerprint(),'Dataset changed; rebuild mining/model outputs before serving'
    print(f'http://127.0.0.1:{port}/intelligence.html',flush=True);ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
