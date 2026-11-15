"""Normalize callout labels for the replay UI."""
import re

MAPPING_VERSION = "cs2_spatial_v2"

def token(name):
    aliases={'BombsiteA':'A_SITE','BombsiteB':'B_SITE','CTSpawn':'CT_SPAWN','TSpawn':'T_SPAWN','TRamp':'T_RAMP','TopofMid':'TOP_OF_MID','Mid':'MIDDLE','A Site':'A_SITE','B Site':'B_SITE','A':'A_SITE','B':'B_SITE','Top Mid':'TOP_OF_MID'}
    if not isinstance(name,str) or not name.strip():return 'UNKNOWN'
    if name.strip().casefold() in ['unknown','nav_unnamed','unnamed','none','null']:return 'UNKNOWN'
    if name in aliases:return aliases[name]
    name=re.sub(r'([A-Z]+)([A-Z][a-z])',r'\1_\2',name)
    return re.sub('[^A-Z0-9]+','_',re.sub(r'([a-z0-9])([A-Z])',r'\1_\2',name).upper()).strip('_') or 'UNKNOWN'
