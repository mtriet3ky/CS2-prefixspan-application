// Pure matching of a single player's MOVE projection. Support is supplied by train mining.
export function observedMoves(sequence,tick){
 const out=[];
 for(const e of [...sequence.events].sort((a,b)=>a.available_tick-b.available_tick||a.event_id.localeCompare(b.event_id))){
  if(e.available_tick>tick||!e.label.startsWith('MOVE_')||['MOVE_UNKNOWN','MOVE_NAV_UNNAMED'].includes(e.label))continue;
  if(out.at(-1)?.label!==e.label||out.at(-1)?.continuity_segment!==e.continuity_segment)out.push(e);
 }
 return out;
}
export function moveMatches(exploration,patterns,tick){
 if(!exploration)return [];
 const matches=[];
 for(const pattern of patterns){
  const players=[];
  for(const s of exploration.sequences){
   if(s.side!==pattern.side||(pattern.player_id&&pattern.player_id!==s.player_id))continue;
   const moves=observedMoves(s,tick),n=pattern.actions.length;
   if(!n)continue;
   // A route can start anywhere, but cannot skip another MOVE inside it.
   const start=moves.findIndex((_,i)=>i+n<=moves.length&&pattern.actions.every((a,j)=>moves[i+j].label===a&&(moves[i+j].continuity_segment??0)===(moves[i].continuity_segment??0)));
   if(start<0)continue;
   const indices=Array.from({length:n},(_,j)=>start+j);
   const first=indices[0],last=indices.at(-1),from=moves[first].available_tick,to=moves[last].available_tick;
   const next=moves[last+1]?.available_tick??Infinity;
   const auxiliary=(exploration.auxiliary_events||[]).filter(e=>e.player_id===s.player_id&&e.available_tick<=tick);
   players.push({player_id:s.player_id,event_ids:indices.map(i=>moves[i].event_id),
    matched_events:indices.map(i=>moves[i]),route_events:moves.slice(first,last+1),
    intermediate_count:last-first+1-indices.length,
    auxiliary:auxiliary.filter(e=>e.available_tick>=from&&e.available_tick<=to),
    after_route:auxiliary.filter(e=>e.available_tick>to&&e.available_tick<next)});
  }
  if(players.length)matches.push({pattern_id:pattern.id,players});
 }
 return matches;
}
