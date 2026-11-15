"""Unchanged bounded miners + two simple, match-grouped CS2 LR controls."""
import bisect,collections,functools,hashlib,json,math,time
import numpy as np
import pyarrow.parquet as pq
from .config import DATA_DIR
ROOT=DATA_DIR
from .mining import bounded_prefixspan,bounded_gsp,parse_support
from .spatial import MAPPING_VERSION
GAP='__UNOBSERVED_BOUNDARY__'

@functools.lru_cache(maxsize=1)
def data_fingerprint():
    digest=hashlib.sha256(MAPPING_VERSION.encode())
    for name in ['sequences.jsonl','snapshot_features.parquet','round_metadata.parquet','assets/native_footprints_train_v2.json']:
        with (ROOT/name).open('rb') as f:digest.update(hashlib.file_digest(f,'sha256').digest())
    return digest.hexdigest()

def mining_actions(seq):
    """One DB row per player-round, with a non-action boundary between segments."""
    result=[];previous=None
    for e in seq['events']:
        segment=e.get('continuity_segment',0)
        if previous is not None and segment!=previous:result.append(GAP)
        result.append(e['label']);previous=segment
    return result

def valid_window(seq,i,n):
    events=seq['events'][i:i+n]
    return len(events)==n and len({e.get('continuity_segment',0) for e in events})==1

def dump(p,x):
    p.parent.mkdir(exist_ok=True,parents=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')

@functools.lru_cache(maxsize=1)
def sequences():
    return [json.loads(line) for file in sorted((ROOT/'demos').glob('*/sequences.jsonl')) for line in file.open(encoding='utf-8')]

@functools.lru_cache(maxsize=1)
def metadata():return pq.read_table(ROOT/'round_metadata.parquet').to_pylist()

def completion_phase(t):return '0_15' if t<15 else '15_30' if t<30 else '30_60' if t<60 else '60_90' if t<90 else '90_plus'

def occurrence_ticks(seq,pattern):
    n=len(pattern);a=seq['actions'];return [seq['events'][i+n-1]['available_tick'] for i in range(len(a)-n+1) if a[i:i+n]==pattern and valid_window(seq,i,n)]

def outcomes(patterns,mapname,side):
    meta={r['round_id']:r for r in metadata() if r['map']==mapname}
    seqs=[s for s in sequences() if s['map']==mapname and s['side']==side and s['split'] in ['train','validation']]
    result=[]
    for pattern in patterns:
        matched=collections.defaultdict(set)
        for s in seqs:
            m=meta[s['round_id']]
            for tick in occurrence_ticks(s,pattern['actions']):
                phase=completion_phase((tick-m['start_tick'])/m['tick_rate']);matched[s['split'],phase].add(s['round_id'])
        stats={}
        for phase,start in [('0_15',0),('15_30',15),('30_60',30),('60_90',60),('90_plus',90)]:
            phase_stats={}
            for split in ['train','validation']:
                ids=matched[split,phase];wins=sum(meta[r]['winner']==side for r in ids)
                base=[r for r in meta.values() if r['split']==split and (r['end_tick']-r['start_tick'])/r['tick_rate']>start]
                rate=wins/len(ids) if ids else None
                if ids:
                    z=1.96;n=len(ids);den=1+z*z/n;mid=(rate+z*z/(2*n))/den;delta=z*math.sqrt(rate*(1-rate)/n+z*z/(4*n*n))/den;ci=[max(0,mid-delta),min(1,mid+delta)]
                else:ci=None
                reference=sum(r['winner']==side for r in base)/len(base) if base else None
                phase_stats[split]=dict(rounds=len(ids),wins=wins,win_rate=rate,ci95=ci,baseline_rounds=len(base),baseline_win_rate=reference,delta_pp=(rate-reference)*100 if rate is not None and reference is not None else None)
            stats[phase]=phase_stats
        result.append(dict(pattern,outcomes=stats))
    return result

@functools.lru_cache(maxsize=24)
def mine(mapname,bp=200,algorithm='prefixspan'):
    if mapname not in ['de_mirage','de_inferno','de_dust2'] or algorithm not in ['prefixspan','gsp']:raise ValueError('Unsupported map/algorithm')
    if not 100<=bp<=10000:raise ValueError('min_sup must be 1–100%')
    path=ROOT/'mining'/f'{MAPPING_VERSION}_{data_fingerprint()[:16]}_{mapname}_{algorithm}_{bp}.json'
    if path.exists():return json.loads(path.read_text(encoding='utf-8'))
    all_patterns=[];stats={}
    for side in ['CT','T']:
        db=[mining_actions(s) for s in sequences() if s['map']==mapname and s['side']==side and s['split']=='train']
        assert db
        count=math.ceil(len(db)*bp/10000)
        found=(bounded_prefixspan if algorithm=='prefixspan' else bounded_gsp)(db,count,time.monotonic()+45)
        eligible=sorted([(p,c) for p,c in found.items() if len(p)>=2 and GAP not in p],key=lambda pc:(-pc[1],-len(pc[0]),pc[0]))
        ps=[dict(id=f'CS2_{mapname}_{bp}_{side}_{i:04}',map=mapname,side=side,scope='global',actions=list(p),support_count=c,
                 sequence_count=len(db),support=c/len(db),interactive=True,feature_in_model=False,match_mode='contiguous_move',max_gap=0) for i,(p,c) in enumerate(eligible)]
        all_patterns.extend(outcomes(ps,mapname,side));stats[side]=dict(sequences=len(db),min_count=count,eligible_patterns=len(ps))
    result=dict(map=mapname,algorithm=algorithm,min_sup_percent=bp/100,patterns=all_patterns,all_patterns=all_patterns,stats=stats,
                source_split='train',support_unit='player-round',max_length=5,max_gap=0,representation='cs2_move_v2',mapping_version=MAPPING_VERSION,
                continuity_policy='Boundary tokens are internal only, excluded from published patterns; denominator includes all player-round sequences')
    dump(path,result);return result
