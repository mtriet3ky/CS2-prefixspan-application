export function completionPhase(seconds){return seconds<15?'0_15':seconds<30?'15_30':seconds<60?'30_60':seconds<90?'60_90':'90_plus';}
export const phaseLabels={'0_15':'0–15s','15_30':'15–30s','30_60':'30–60s','60_90':'60–90s','90_plus':'≥90s'};
export const percent=value=>value==null?'—':(100*value).toFixed(1)+'%';
export function candidatePatterns(globalData,personalData,map,minSup,scope='all',player='all',roster=[]){
 const people=new Map(roster.map(p=>[p.player_id,p.side]));
 const common=globalData?.map===map?globalData.patterns:[];
 const personal=personalData?.map===map?personalData.patterns.filter(p=>people.get(p.player_id)===p.side&&p.support_count>=Math.max(10,Math.ceil(p.sequence_count*minSup/100))):[];
 return [...common,...personal].filter(p=>(scope==='all'||(p.scope||'global')===scope)&&(player==='all'||!p.player_id||p.player_id===player));
}
