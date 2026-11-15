"""Team-specific view; never pool one team's rounds with its opponents."""
from collections import Counter,defaultdict
from .identifiers import team_key
from .learning import metadata
from . import tactical_analysis as analysis


def teams():
    names=defaultdict(Counter);counts=Counter()
    for r in metadata():
        for side in ['CT','T']:
            name=r[side.lower()+'_team'];key=team_key(name)
            names[key][name]+=1;counts[key]+=1
    return [dict(id=k,name=names[k].most_common(1)[0][0],rounds=n) for k,n in counts.most_common()]


def plays(mapname,side,split,team):
    key=team_key(team);catalog={t['id']:t for t in teams()}
    if key not in catalog:raise ValueError('Chọn một đội hợp lệ')
    if mapname not in analysis.MAPS or side not in ['CT','T'] or split not in ['all','train','validation','test']:raise ValueError('Bộ lọc không hợp lệ')
    rows=[r for r in metadata() if r['map']==mapname and (split=='all' or r['split']==split)
          and team_key(r[side.lower()+'_team'])==key]
    ids={r['round_id'] for r in rows};grouped=defaultdict(list)
    for d in analysis.dataset()['detections']:
        if d['round_id'] in ids and d['side']==side:grouped[d['label']].append(d)
    patterns=[]
    for label,ds in sorted(grouped.items(),key=lambda kv:-len({d['round_id'] for d in kv[1]})):
        count=len({d['round_id'] for d in ds})
        patterns.append(dict(label=label,title=ds[0]['title'],side=side,layer=ds[0]['layer'],team=key,
            count=count,total=len(ids),frequency=count/len(ids),rule=ds[0]['rule'],evidence=ds))
    return dict(team=key,team_name=catalog[key]['name'],map=mapname,side=side,split=split,
                rounds=len(ids),demos=len({r['demo_id'] for r in rows}),matches=len({r['match_id'] for r in rows}),
                support_unit='selected-team-side-round',patterns=patterns,rules=analysis.RULES)
