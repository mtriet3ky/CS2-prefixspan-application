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

// One observed marker per area for each matched occurrence.
export function locationMarkers(keys,aliases,proofs,traces,holdTracks){
 const areas=new Map();
 for(const key of keys){
  const regions=new Set([key,...(aliases[key]||[])]);
  const signature=[...regions].sort().join('|');
  if(!areas.has(signature))areas.set(signature,{key,regions});
 }
 const coordinate=([x,y])=>`${x},${y}`;
 const seen=new Set(),markers=[];
 for(const proof of proofs){
  const id=JSON.stringify([proof.sequence_id,proof.start,proof.end]);
  if(seen.has(id))continue;
  seen.add(id);
  const track=traces.get(proof.sequence_id).track;
  const paths=holdTracks?.get(proof);
  const visible=paths?.filter(hasVisibleMovement);
  const eligible=paths&&new Set((visible.length?visible:paths).flat().map(coordinate));
  for(const {key,regions} of areas.values()){
   const point=track.find(p=>p.t>=proof.start&&p.t<=proof.end&&observedPoint(p)&&
    (regions.has(p.region)||regions.has(`MACRO_${p.macro_zone}`))&&
    (!eligible||eligible.has(coordinate([p.x,p.y]))));
   if(point)markers.push({key,x:point.x,y:point.y});
  }
 }
 return markers;
}

// Keep the representative point on an observed route, even when points overlap.
export function clusterLocationMarkers(markers,distance){
 const clusters=[];
 for(const marker of markers){
  const cluster=clusters.find(p=>p.key===marker.key&&Math.hypot(p.x-marker.x,p.y-marker.y)<=distance);
  if(cluster)cluster.count++;
  else clusters.push({...marker,count:1});
 }
 return clusters;
}
