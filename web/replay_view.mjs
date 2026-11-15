export function chronologicalMatches(matches,patterns,tick){
 const byId=new Map(patterns.map(p=>[p.id,p])),rows=[];
 matches.forEach((match,matchIndex)=>{
  const pattern=byId.get(match.pattern_id);if(!pattern)return;
  match.players.forEach((player,playerIndex)=>{
   const first=player.matched_events[0],last=player.matched_events.at(-1);
   if(first&&last&&last.available_tick<=tick)rows.push({pattern,player,matchIndex,playerIndex,start:first.available_tick,completed:last.available_tick});
  });
 });
 return rows.sort((a,b)=>a.completed-b.completed||a.start-b.start||a.player.player_id.localeCompare(b.player.player_id)||a.pattern.id.localeCompare(b.pattern.id));
}
export function lastObservedFrame(frames,tick){return frames.findLast(f=>f.tick<=tick);}
export function eliminationRound(round){
 const {metadata,terminal}=round;
 switch(terminal.winner){
  case 'CT': return metadata.game==='CS2'?metadata.reason_code===8:terminal.reason==='CTWin'||terminal.reason==='CTsWin';
  case 'T': return metadata.game==='CS2'?metadata.reason_code===9:terminal.reason==='TerroristsWin';
  default: return false;
 }
}

export function terminalRoster(round,frame){
 const end=round.terminal.tick;
 const eliminated=eliminationRound(round);
 const events=round.metadata.game==='CS2'?round.events:round.move_exploration?.auxiliary_events;
 const victims=new Map();
 for(const event of events??[]){
  if(event.action!=='KILL'||!event.victim_id||!Number.isFinite(event.tick)||event.tick<frame.tick||event.tick>end)continue;
  const id=String(event.victim_id);
  if(!victims.has(id)||victims.get(id).tick<event.tick)victims.set(id,event);
 }
 return {...frame,players:frame.players.map(player=>{
  const victim=victims.get(String(player.player_id));
  const lostByElimination=eliminated&&['CT','T'].includes(player.side)&&player.side!==round.terminal.winner;
  if(!player.is_alive||(!victim&&!lostByElimination))return player;
  const position=victim&&[victim.x,victim.y,victim.z].every(Number.isFinite)?{x:victim.x,y:victim.y,z:victim.z}:{};
  return {...player,...position,health:0,armor:0,is_alive:false,is_defusing:false,has_defuse_kit:false,weapon:null,inventory:[]};
 })};
}

export function routeSegments(frames,pid,from,to,cutoff,rate,meta,{connectedTail=false}={}){
 const segments=[];let previous=null;
 for(const frame of frames){
  if(frame.tick<from||frame.tick>Math.min(to,cutoff))continue;
  const p=frame.players.find(p=>p.player_id===pid);
  if(!p?.is_alive||![p.x,p.y,p.z].every(Number.isFinite)){
   if(connectedTail)segments.length=0;
   previous=null;
   continue;
  }
  const current={tick:frame.tick,x:(p.x-meta.x)/meta.scale,y:(meta.y-p.y)/meta.scale,world:p};
  if(previous){
   const dt=(current.tick-previous.tick)/rate;
   const distance=Math.hypot(p.x-previous.world.x,p.y-previous.world.y,p.z-previous.world.z);
   if(dt<=0||dt>1.5||distance/dt>350){
    if(connectedTail)segments.length=0;
   }else if(distance>0){
    const fade=t=>.08+.92*Math.max(0,Math.min(1,(t-from)/Math.max(1,to-from)));
    segments.push({from:previous,to:current,startOpacity:fade(previous.tick),endOpacity:fade(current.tick)});
   }
  }
  previous=current;
 }
 return segments;
}
