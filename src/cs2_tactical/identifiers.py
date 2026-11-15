"""Canonical team identifiers shared by replay and tactical analysis."""
import re

def team_key(value):
    key=re.sub(r'[^a-z0-9]','',str(value).casefold())
    return {'teamvitality':'vitality','g2esports':'g2','navi':'natusvincere','teamspirit':'spirit','futesports':'fut',
            'fazeclan':'faze','falconsesports':'falcons','teamfalcons':'falcons','auroragaming':'aurora','b8esports':'b8',
            'mongolz':'themongolz','mnglz':'themongolz','flc':'falcons','lgcy':'legacy','mousesports':'mouz','furiaesports':'furia','teamliquid':'liquid'}.get(key,key)
