// Observed samples only. Repeated occurrences stay separate in tactical mode.
export function tacticalPaths(proofs,traces,fullRound=false){
 const windows=fullRound?[...new Map(proofs.map(p=>[p.sequence_id,p])).values()]:proofs;
 const paths=[];
 for(const proof of windows){let chunk=[],previous=null;
  for(const p of traces.get(proof.sequence_id).track){
   const valid=(fullRound||p.t>=proof.start&&p.t<=proof.end)&&(proof.region===undefined||p.region===proof.region)&&p.alive&&p.valid&&p.region&&p.region!=='UNKNOWN'&&Number.isFinite(p.x)&&Number.isFinite(p.y);
   if(!valid||previous!==null&&p.t-previous>.75){if(chunk.length)paths.push(chunk);chunk=[]}
   if(valid){chunk.push([p.x,p.y]);previous=p.t}else previous=null;
  }
  if(chunk.length)paths.push(chunk);
 }
 return paths;
}

// Use the observed end of HOLD, not the later confirmation timestamp.
export function holdPaths(proofs,traces){
 const windows=proofs.flatMap(proof=>(proof.events||[])
  .filter(event=>event.action==='HOLD'&&event.region&&Number.isFinite(event.seconds)&&Number.isFinite(event.end_seconds))
  .map(event=>({sequence_id:proof.sequence_id,start:event.seconds,end:event.end_seconds,region:event.region})));
 return tacticalPaths(windows,traces);
}
