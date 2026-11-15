// A chronological display of confirmed observations, independent of mining/model inputs.
export function replayActions(round){
 const events=[];
 for(const s of round.move_exploration?.sequences||[]){
  for(const e of s.events)events.push({...e,action:'MOVE',player_id:s.player_id,side:s.side,basis:'confirmed_move'});
 }
 // Legacy utility events use the thrower's region at throwTick. Displaying a
 // throw here avoids presenting a grenade endpoint/destroyTick as throw time.
 for(const e of round.events||[]){
  const action=e.label.split('_')[0];
  if(['SMOKE','FLASH','MOLOTOV','HE'].includes(action))events.push({...e,action,basis:'thrower_at_throw'});
 }
 for(const e of round.move_exploration?.auxiliary_events||[]){
  if(['KILL','PLANT'].includes(e.action))events.push({...e,basis:e.location_basis});
 }
 return events.sort((a,b)=>a.available_tick-b.available_tick||a.event_id.localeCompare(b.event_id));
}
export function observedActions(events,tick){return events.filter(e=>e.available_tick<=tick);}
export function matchedActions(player,events,tick){
 const first=player.matched_events[0]?.available_tick,last=player.matched_events.at(-1)?.available_tick;
 if(first===undefined||last===undefined)return [];
 const moves=player.route_events.filter(e=>e.available_tick<=tick).map(e=>({...e,action:'MOVE'}));
 const extra=observedActions(events,tick).filter(e=>e.player_id===player.player_id&&e.action!=='MOVE'&&e.available_tick>=first&&e.available_tick<=last);
 return [...moves,...extra].sort((a,b)=>a.available_tick-b.available_tick||a.event_id.localeCompare(b.event_id));
}
export function actionText(event,regionNames={},names={}){
 const region=event.region||event.label.slice(event.action.length+1);
 const place=regionNames[region]||region.replaceAll('_',' ');
 if(event.action==='MOVE')return 'Di chuyển → '+place;
 if(event.action==='KILL')return 'Hạ '+(names[event.victim_id]||'đối thủ')+' · '+place;
 if(event.action==='PLANT')return 'Đặt bom · '+place;
 return 'Ném '+({SMOKE:'Smoke',FLASH:'Flash',MOLOTOV:'Molotov',HE:'HE'}[event.action]||event.action)+' · '+place;
}
