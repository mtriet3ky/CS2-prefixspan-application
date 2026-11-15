// Plot geometry uses only observations available at the selected replay frame.
export function winrateHistory(predictions,tick,seconds,width=400){
 const points=predictions.filter(p=>p.tick<=tick&&p.seconds<=seconds&&Number.isFinite(p.p_t_win)).sort((a,b)=>a.seconds-b.seconds);
 const horizon=Math.max(30,Math.ceil(seconds/30)*30),left=52,right=Math.max(left+20,width-12);
 const x=t=>left+t/horizon*(right-left),y=p=>90-p*76,segments=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(b.seconds-a.seconds>1.5)continue;
  const start={x:x(a.seconds),y:y(a.p_t_win)},end={x:x(b.seconds),y:y(b.p_t_win)};
  const side=p=>p>=.5?'T':'CT';
  if((a.p_t_win-.5)*(b.p_t_win-.5)<0){
   const ratio=(.5-a.p_t_win)/(b.p_t_win-a.p_t_win),cross={x:start.x+ratio*(end.x-start.x),y:y(.5)};
   segments.push({from:start,to:cross,side:side(a.p_t_win)},{from:cross,to:end,side:side(b.p_t_win)});
  }else segments.push({from:start,to:end,side:side((a.p_t_win+b.p_t_win)/2)});
 }
 return {points,segments,horizon,left,right,x,y,mid:y(.5)};
}
