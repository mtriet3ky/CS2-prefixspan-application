"""Existing contiguous miners; algorithm bodies preserved verbatim."""
import re, time
from decimal import Decimal
from collections import defaultdict

def parse_support(value):
 value=value.replace(',','.').strip()
 if not re.fullmatch(r'\d{1,3}(?:\.\d{1,2})?',value):raise ValueError('min_sup phải là số từ 1 đến 100%, tối đa 2 chữ số thập phân')
 bp=int(Decimal(value)*100)
 if not 100<=bp<=10000:raise ValueError('min_sup phải nằm trong 1–100%')
 return bp

def bounded_prefixspan(db,min_count,deadline):
 result={}
 def grow(prefix,projection):
  if time.monotonic()>deadline:raise ValueError('Khai phá vượt giới hạn 45 giây; hãy tăng min_sup')
  ex=defaultdict(list)
  for sid,start in projection:
   # Keep every occurrence, and extend at the immediately following MOVE only.
   # Keeping just the earliest occurrence would miss later contiguous matches.
   if start<len(db[sid]):ex[db[sid][start]].append((sid,start+1))
  for item,pr in sorted(ex.items()):
   support=len({sid for sid,_ in pr})
   if support<min_count:continue
   p=prefix+(item,);result[p]=support
   if len(result)>100000:raise ValueError('Quá 100.000 mẫu; hãy tăng min_sup')
   if len(p)<5:grow(p,pr)
 grow((),[(sid,i) for sid,s in enumerate(db) for i in range(len(s))]);return result

def bounded_gsp(db,min_count,deadline):
 # GSP breadth-first join/prune under max_gap=0, retaining ALL ending positions.
 positions=defaultdict(dict)
 for sid,s in enumerate(db):
  for i,a in enumerate(s):positions[a].setdefault(sid,set()).add(i)
 level={(a,):len(ids) for a,ids in positions.items() if len(ids)>=min_count};result=dict(level)
 endings={(a,):positions[a] for a, in level}
 while level and len(next(iter(level)))<5:
  joins=defaultdict(list)
  for p in level:joins[p[:-1]].append(p[-1])
  candidates=set()
  for p in level:
   for a in joins.get(p[1:],[]):
    c=p+(a,)
    # Only prefix/suffix pruning is valid for contiguous support. Removing an
    # interior item creates a gap and can wrongly prune a frequent route.
    if c[:-1] in level and c[1:] in level:candidates.add(c)
    if len(candidates)>100000:raise ValueError('GSP vượt 100.000 ứng viên; hãy tăng min_sup')
  nxt={};next_endings={}
  for p in sorted(candidates):
   if time.monotonic()>deadline:raise ValueError('Khai phá vượt giới hạn 45 giây; hãy tăng min_sup')
   ends={};item_positions=positions[p[-1]]
   for sid,previous_ends in endings[p[:-1]].items():
    ps=item_positions.get(sid)
    if ps:
     following={end+1 for end in previous_ends if end+1 in ps}
     if following:ends[sid]=following
   if len(ends)>=min_count:nxt[p]=len(ends);next_endings[p]=ends
  result.update(nxt);level=nxt;endings=next_endings
  if len(result)>100000:raise ValueError('Quá 100.000 mẫu; hãy tăng min_sup')
 return result
