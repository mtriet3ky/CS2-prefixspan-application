// Presentation only: original rows, event references, support, and mining are immutable.
export const rowKey=row=>row.pattern.id+':'+row.player.player_id;
const chronological=(a,b)=>a.completed-b.completed||a.start-b.start||rowKey(a).localeCompare(rowKey(b));
function containsOccurrence(parent,child){
 if(parent.player.player_id!==child.player.player_id||parent.pattern.side!==child.pattern.side)return false;
 if((parent.pattern.scope||'global')!==(child.pattern.scope||'global'))return false;
 const a=parent.player.event_ids,b=child.player.event_ids;
 if(a.length<=b.length)return false;
 return a.some((_,i)=>i+b.length<=a.length&&b.every((id,j)=>a[i+j]===id));
}
export function groupRelated(rows){
 const ranked=[...rows].sort((a,b)=>b.pattern.actions.length-a.pattern.actions.length||b.pattern.support-a.pattern.support||chronological(a,b));
 const groups=[];
 for(const row of ranked){
  const parent=groups.find(g=>containsOccurrence(g.row,row));
  if(parent)parent.related.push(row);
  else groups.push({key:rowKey(row),row,related:[]});
 }
 for(const g of groups)g.related.sort(chronological);
 return groups.sort((a,b)=>chronological(a.row,b.row));
}
export function featuredGroups(groups,limit=8,activeKey=null){
 const ranked=[...groups].sort((a,b)=>b.row.pattern.actions.length-a.row.pattern.actions.length||b.row.pattern.support-a.row.pattern.support||chronological(a.row,b.row));
 const ids=new Set(),distinct=[];
 for(const g of ranked)if(!ids.has(g.row.pattern.id)){ids.add(g.row.pattern.id);distinct.push(g);}
 const preferred=[...distinct,...ranked.filter(g=>!distinct.includes(g))];
 const chosen=[];
 // A balanced shortlist, when both sides have matches; fill spare slots globally.
 for(const side of ['CT','T']){
  const sideGroups=distinct.filter(g=>g.row.pattern.side===side),quota=Math.floor(limit/2);
  for(const scope of ['global','personal'])chosen.push(...sideGroups.filter(g=>(g.row.pattern.scope||'global')===scope).slice(0,Math.floor(quota/2)));
  for(const g of sideGroups)if(chosen.filter(g=>g.row.pattern.side===side).length<quota&&!chosen.includes(g))chosen.push(g);
 }
 for(const g of preferred)if(chosen.length<limit&&!chosen.includes(g))chosen.push(g);
 const active=activeKey&&groups.find(g=>g.key===activeKey||g.related.some(r=>rowKey(r)===activeKey));
 if(active&&!chosen.includes(active)){
  const replace=chosen.findLastIndex(g=>g.row.pattern.side===active.row.pattern.side);
  if(chosen.length>=limit)chosen.splice(replace>=0?replace:chosen.length-1,1);
  chosen.push(active);
 }
 return chosen.sort((a,b)=>chronological(a.row,b.row));
}

export function replayPatternOrder(groups,sideView,showAll,activeKey){
 const matchesSide=g=>sideView==='all'||g.row.pattern.side===sideView;
 const ordered=groups.filter(matchesSide).sort((a,b)=>chronological(a.row,b.row));
 let visible=ordered;
 if(!showAll&&ordered.length>8){
  const recent=sideView==='all'
   ?['CT','T'].flatMap(side=>ordered.filter(g=>g.row.pattern.side===side).slice(-4))
   :ordered.slice(-8);
  const shown=new Set(recent);
  for(let i=ordered.length-1;shown.size<8;i--)shown.add(ordered[i]);
  const active=activeKey&&ordered.find(g=>g.key===activeKey||g.related.some(r=>rowKey(r)===activeKey));
  if(active&&!shown.has(active)){
   const oldest=ordered.find(g=>shown.has(g)&&g.row.pattern.side===active.row.pattern.side);
   shown.delete(oldest||ordered.find(g=>shown.has(g)));
   shown.add(active);
  }
  visible=ordered.filter(g=>shown.has(g));
 }
 if(sideView!=='all'||visible.length===0)return visible;
 const firstSide=visible[0].row.pattern.side;
 const first=visible.filter(g=>g.row.pattern.side===firstSide);
 const second=visible.filter(g=>g.row.pattern.side!==firstSide);
 const interleaved=[];
 for(let i=0;i<Math.max(first.length,second.length);i++){
  if(first[i])interleaved.push(first[i]);
  if(second[i])interleaved.push(second[i]);
 }
 return interleaved;
}
