"""Actual registered callout outlines in native radar pixels (inverse affine)."""
import json
import functools
from .learning import ROOT
from .spatial import token
from .tactical_analysis import MAPS


@functools.lru_cache(maxsize=3)
def regions(mapname):
    if mapname not in MAPS:raise ValueError('Unsupported map')
    config=json.loads((ROOT/'assets'/mapname/'registration.json').read_text())
    (a,b,c),(d,e,f)=config['matrix'];det=a*e-b*d
    if abs(det)<1e-10:raise ValueError('Invalid callout registration')
    polygons=[]
    for p in config['polygons']:
        points=[[(e*(x-c)-b*(y-f))/det,(-d*(x-c)+a*(y-f))/det] for x,y in p['polygon']]
        polygons.append(dict(region=token(p['name']),name=p['name'],points=points))
    aliases={'WINDOW':['SNIPER_S_NEST','SNIPERS_NEST','WINDOW'],
             'SNIPERS_NEST':['SNIPER_S_NEST','SNIPERS_NEST'],
             'PALACE_INTERIOR':['PALACE'],'MID':['MIDDLE'],'TOP_MID':['TOP_OF_MID']}
    # Missing callouts use their own observed NAV place, never a guessed neighbour.
    native_path=ROOT/'assets/native_place_regions_v1.json'
    if native_path.exists():
        native=json.loads(native_path.read_text())['maps'][mapname]
        available={p['region'] for p in polygons}
        for name,tiles in native.items():
            key=token(name)
            if key in available or any(k in available for k in aliases.get(key,[])):continue
            for points in tiles:polygons.append(dict(region=key,name=name,points=points,kind='native_nav'))
            available.add(key)
    cfg=MAPS[mapname];labels={};prefix=mapname[3:].upper()
    for side in ['CT','T']:
        for p in polygons:labels[f'{side}_{prefix}_HOLD_{p["name"].upper().replace(" ","_")}']=[p['region']]
        for site in ['A','B']:
            labels[f'{side}_{prefix}_ENTRY_{site}']=[site+'_SITE']
            labels[f'{side}_{prefix}_PLANT_{site}']=[site+'_SITE']
    for code,_,origin,target in cfg['push']:labels['CT_'+prefix+'_'+code]=(origin+' '+target).split()
    for code,_,origin,site in cfg['rush']:labels['T_'+prefix+'_'+code]=(origin+' '+cfg[site]).split()
    for code,_,target in cfg['control']:labels['T_'+prefix+'_'+code]=(cfg['control_origins'][code]+' '+target).split()
    from .macro_regions import load as load_macros
    macros=load_macros()['maps'][mapname]
    for zone in ['A','B','MID']:
        key='MACRO_'+zone
        name={'A':'Vùng phòng thủ A','B':'Vùng phòng thủ B','MID':'Vùng Mid'}[zone]
        for points in macros[zone]['polygons']:polygons.append(dict(region=key,name=name,points=points,kind='macro_nav'))
        labels[f'CT_{prefix}_DEPLOY_{zone}']=[key]
    for x,y in [('A','B'),('B','A')]:labels[f'CT_{prefix}_ROTATE_{x}_{y}']=['MACRO_'+x,'MACRO_'+y]
    targets={}
    for code,_,_,target in cfg['push']:targets['CT_'+prefix+'_'+code]=target.split()
    for code,_,_,site in cfg['rush']:targets['T_'+prefix+'_'+code]=cfg[site].split()
    for code,_,target in cfg['control']:targets['T_'+prefix+'_'+code]=target.split()
    for x,y in [('A','B'),('B','A')]:targets[f'CT_{prefix}_ROTATE_{x}_{y}']=['MACRO_'+y]
    display_aliases=dict(aliases,A_SITE=['MACRO_A'],B_SITE=['MACRO_B'],MIDDLE=['MACRO_MID'],MID=['MACRO_MID'])
    if mapname=='de_mirage':
        display_aliases.update(TRUCK=['VAN','TRUCK'],VAN=['VAN','TRUCK'])
        for p in polygons:
            if p['region']=='TRUCK':p['name']='Van'
    display_labels={k:list(v) for k,v in labels.items()}
    # Site-level tactics use the full operational zone, including Rush's destination.
    for code,_,origin,site in cfg['rush']:
        display_labels['T_'+prefix+'_'+code]=origin.split()+['MACRO_'+site]
    for code,keys in display_labels.items():
        for site in ['A','B']:
            if site+'_SITE' in keys:
                keys[:]=[k for k in keys if k not in cfg[site].split()]+['MACRO_'+site]
    return dict(map=mapname,coordinate_space='native_radar_1024',polygons=polygons,labels=labels,targets=targets,
                aliases=aliases,display_aliases=display_aliases,display_labels=display_labels)


def contains(point, polygon):
    x,y=point;inside=False
    for (a,b),(c,d) in zip(polygon,polygon[1:]+polygon[:1]):
        if (b>y)!=(d>y) and x<(c-a)*(y-b)/(d-b)+a:inside=not inside
    return inside


def observed_destination(mapname,track,event,targets):
    geometry=regions(mapname);wanted=set(targets)
    for key in list(wanted):wanted.update(geometry['aliases'].get(key,[]))
    polygons=[p['points'] for p in geometry['polygons'] if p['region'] in wanted and p.get('kind')!='native_nav']
    if not polygons:return False
    previous=None
    for p in track:
        valid=(event['seconds']<=p['t']<=event['end_seconds'] and p['alive'] and p['valid']
               and p['region'] and p['region']!='UNKNOWN' and any(contains([p['x'],p['y']],poly) for poly in polygons))
        if valid and previous is not None and 0<p['t']-previous<=.75:return True
        previous=p['t'] if valid else None
    return False
