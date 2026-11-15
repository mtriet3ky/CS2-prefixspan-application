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

function observedPoint(p){
 return p.alive&&p.valid&&p.region&&p.region!=='UNKNOWN'&&Number.isFinite(p.x)&&Number.isFinite(p.y);
}

export function hasVisibleMovement(points){
 if(points.length<2)return false;
 const [x,y]=points[0];
 return points.some(([px,py])=>Math.hypot(px-x,py-y)>=2);
}

// Keep visible HOLD paths. For a stationary hold, show the continuous approach
// when it was observed within six seconds of the first sample in the hold.
export function holdPaths(proofs,traces){
 const paths=[];
 for(const proof of proofs){
  const track=traces.get(proof.sequence_id).track;
  for(const event of proof.events||[]){
   const {seconds:start,end_seconds:end,region}=event;
   if(event.action!=='HOLD'||!region||!Number.isFinite(start)||!Number.isFinite(end))continue;
   const chunks=tacticalPaths([{sequence_id:proof.sequence_id,start,end,region}],traces);
   if(!chunks.length)continue;
   if(!chunks.some(hasVisibleMovement)){
    const anchor=track.findIndex(p=>p.t>=start&&p.t<=end&&p.region===region&&observedPoint(p));
    if(anchor>=0&&track[anchor].t-start<=.75){
     let first=anchor;
     while(first>0){
      const p=track[first-1];
      if(p.t<start-6||p.t>=start||!observedPoint(p)||track[first].t-p.t>.75)break;
      first--;
     }
     const approach=track.slice(first,anchor+1).map(p=>[p.x,p.y]);
     if(hasVisibleMovement(approach))paths.push(approach);
    }
   }
   paths.push(...chunks);
  }
 }
 return paths;
}

// Highlight only observed segments inside a named area during a matched occurrence.
export function locationSegments(keys,aliases,proofs,traces,holdTracks){
 const areas=keys.map(key=>new Set([key,...(aliases[key]||[])]));
 const edge=(a,b)=>`${a[0]},${a[1]} ${b[0]},${b[1]}`;
 const segments=new Map();
 for(const proof of proofs){
  const track=traces.get(proof.sequence_id).track;
  const paths=holdTracks?.get(proof);
  const drawn=paths&&new Set(paths.filter(hasVisibleMovement).flatMap(path=>
   path.slice(1).map((b,i)=>edge(path[i],b))));
  if(drawn&&!drawn.size)continue;
  for(let i=1;i<track.length;i++){
   const a=track[i-1],b=track[i];
   if(a.t<proof.start||b.t>proof.end||b.t-a.t>.75||!observedPoint(a)||!observedPoint(b))continue;
   const inArea=(area,p)=>area.has(p.region)||area.has(`MACRO_${p.macro_zone}`);
   if(!areas.some(area=>inArea(area,a)&&inArea(area,b)))continue;
   const start=[a.x,a.y],end=[b.x,b.y];
   if(a.x===b.x&&a.y===b.y)continue;
   const key=edge(start,end);
   if(!drawn||drawn.has(key))segments.set(key,[start,end]);
  }
 }
 return [...segments.values()];
}
