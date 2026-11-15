// Observed samples only. Repeated occurrences stay separate in tactical mode.
export function tacticalPaths(proofs,traces,fullRound=false){
 const windows=fullRound?[...new Map(proofs.map(p=>[p.sequence_id,p])).values()]:proofs;
 const paths=[];
 for(const proof of windows){let chunk=[],previous=null;
  for(const p of traces.get(proof.sequence_id).track){
   const valid=(fullRound||p.t>=proof.start&&p.t<=proof.end)&&p.alive&&p.valid&&p.region&&p.region!=='UNKNOWN'&&Number.isFinite(p.x)&&Number.isFinite(p.y);
   if(!valid||previous!==null&&p.t-previous>.75){if(chunk.length)paths.push(chunk);chunk=[]}
   if(valid){chunk.push([p.x,p.y]);previous=p.t}else previous=null;
  }
  if(chunk.length)paths.push(chunk);
 }
 return paths;
}

// Show up to eight observed seconds leading into each HOLD. Keep only the
// continuous track attached to that hold and suppress stationary fragments.
export function holdPaths(proofs,traces){
 const paths=[];
 for(const proof of proofs){
  const track=traces.get(proof.sequence_id).track;
  for(const event of proof.events||[]){
   const {seconds:start,end_seconds:end,region}=event;
   if(event.action!=='HOLD'||!region||!Number.isFinite(start)||!Number.isFinite(end))continue;
   const valid=p=>p.alive&&p.valid&&p.region&&p.region!=='UNKNOWN'&&Number.isFinite(p.x)&&Number.isFinite(p.y);
   const anchor=track.findIndex(p=>p.t>=start&&p.t<=end&&p.region===region&&valid(p));
   if(anchor<0||track[anchor].t-start>.75)continue;
   let first=anchor,last=anchor;
   while(first>0){
    const p=track[first-1];
    if(p.t<start-8||!valid(p)||track[first].t-p.t>.75||(p.t>=start&&p.region!==region))break;
    first--;
   }
   while(last+1<track.length){
    const p=track[last+1];
    if(p.t>end||!valid(p)||p.region!==region||p.t-track[last].t>.75)break;
    last++;
   }
   const points=track.slice(first,last+1).map(p=>[p.x,p.y]);
   const [x,y]=points[0];
   if(points.some(([px,py])=>Math.hypot(px-x,py-y)>=2))paths.push(points);
  }
 }
 return paths;
}
