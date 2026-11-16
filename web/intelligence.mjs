import {createRosterPicker} from './roster_picker.mjs?v=2';
import {enableWheelZoom,enableDragPan} from './wheel_zoom.mjs?v=2';
import {replayUtility, utilityControls, renderUtility} from './replay_utility.mjs?v=tick-lifetime-3';
import {plantedBomb, renderBomb} from './replay_bomb.mjs';
let utilityEffects=null, bombMarker=null;
const activeRouteFlashes=new Map();
let nextFlashId=0;
const presentationRouteDuration=1300;
const presentationRouteGap=350;
let routeBatchTimer=null, nextRouteFlashAt=0;
import {modelComparisonView} from './model_comparison.mjs?v=site-coord-1';
import {candidatePatterns,completionPhase,phaseLabels,percent} from './pattern_outcomes.mjs';
import {groupRelated,replayPatternOrder,rowKey} from './pattern_cards.mjs';
import {chronologicalMatches,lastObservedFrame,routeSegments,eliminationRound,terminalRoster} from './replay_view.mjs?v=terminal-roster-1';
import {winrateHistory} from './winrate_history.mjs';
import {replayActions,actionText,matchedActions} from './replay_actions.mjs';
import {moveMatches} from './move_matching.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tacticalLink=$('nav a[href="tactical.html"]');
if(tacticalLink){
 tacticalLink.textContent='Khai phá chiến thuật';
 tacticalLink.removeAttribute('style');
 tacticalLink.classList.add('replay-nav-link');
 $('nav [data-tab="evaluation"]')?.remove();
}
const replayLink=new URLSearchParams(location.search);let pendingReplayLink=true;
let actionEvents=[],regionNames={},playerNames={},personalData=null;
let patternSideView="all";
const teamAccent={CT:"#65d5ff",T:"#ffb361"};
let showAllPatterns=false;const relatedOpen=new Set();
let registry,round,meta,timer=null,loadVersion=0,miningVersion=0,customMining=null,activeProof=null,highlight=new Set();
const get=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json()};
const replayMedia={teams:{},players:{}};
let replayMatchTeams=new Map();
const replayTeamPicker=createRosterPicker($('#replay-team'),id=>replayMedia.teams[id],{showSelectedMedia:true});
const replayMatchPicker=createRosterPicker($('#replay-match'),id=>(replayMatchTeams.get(id)||[]).map(team=>({url:replayMedia.teams[team.id],label:team.name})),{showSelectedMedia:true});
const replayPlayerPicker=createRosterPicker($('#pattern-player'),id=>replayMedia.players[id],{showSelectedMedia:true});
get('assets/roster-media.json').then(media=>{
 Object.assign(replayMedia,media);
 replayTeamPicker.refresh();replayMatchPicker.refresh();replayPlayerPicker.refresh();
}).catch(()=>{});
function options(el,values){el.innerHTML=values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}
function replayTeams(row){
 return row.teams||[row.ct_team,row.t_team].filter(Boolean).map(name=>({id:name.toLowerCase().replace(/[^a-z0-9]/g,''),name}));
}
function matchId(row){return String(row.match_id||row.demo_id);}
function clearReplaySelection(){
 ++loadVersion;clearInterval(timer);timer=null;round=null;activeProof=null;highlight.clear();
 $('#play').textContent='▶ Phát';utilityEffects=null;utilityControls(null,null);renderUtility(null);bombMarker=null;renderBomb(null);
 clearCurrent('Không có round cho lựa chọn này.');
 $('#status').textContent='Không có trận phù hợp.';
}
function rounds(){
 const selectedTeam=$('#replay-team').value||'all';
 const available=registry.rounds.filter(r=>selectedTeam==='all'||replayTeams(r).some(t=>t.id===selectedTeam));
 const matches=new Map();
 for(const row of available)if(!matches.has(matchId(row)))matches.set(matchId(row),row);
 replayMatchTeams=new Map([...matches].map(([id,row])=>[id,replayTeams(row)]));
 const oldMatch=$('#replay-match').value,oldMap=$('#map').value,oldRound=$('#round').value;
 const preferred=pendingReplayLink&&available.find(r=>r.round_id===replayLink.get('round_id'));
 const initial=available.find(r=>r.file===registry.default_round);
 const ordered=[...matches].sort(([a],[b])=>b.localeCompare(a,undefined,{numeric:true}));
 $('#replay-match').innerHTML=ordered.map(([id,row])=>{
  const teams=replayTeams(row).map(t=>t.name).join(' vs ')||row.group_key||id;
  const date=row.match_date?row.match_date.slice(0,10):'#'+id;
  const label=[teams,row.event,date].filter(Boolean).join(' · ');
  return '<option value="'+esc(id)+'">'+esc(label)+'</option>';
 }).join('');
 if(preferred)$('#replay-match').value=matchId(preferred);
 else if(matches.has(oldMatch))$('#replay-match').value=oldMatch;
 else if(initial)$('#replay-match').value=matchId(initial);
 const matchRows=available.filter(r=>matchId(r)===$('#replay-match').value);
 const maps=[...new Set(matchRows.map(r=>r.map))];
 options($('#map'),maps);
 if(preferred&&maps.includes(preferred.map))$('#map').value=preferred.map;
 else if(maps.includes(oldMap))$('#map').value=oldMap;
 else if(maps.includes(registry.default_map))$('#map').value=registry.default_map;
 const rs=matchRows.filter(r=>r.map===$('#map').value).sort((a,b)=>a.round_num-b.round_num);
 $('#round').innerHTML=rs.map(r=>'<option value="'+esc(r.file)+'">Round '+r.round_num+'</option>').join('');
 if(preferred)$('#round').value=preferred.file;
 else if(rs.some(r=>r.file===oldRound))$('#round').value=oldRound;
 else if(rs.some(r=>r.file===registry.default_round))$('#round').value=registry.default_round;
 $('#replay-match').disabled=!ordered.length;
 replayTeamPicker.refresh();
 replayMatchPicker.refresh();
 $('#map').disabled=!maps.length;
 $('#round').disabled=!rs.length;
 if(rs.length)loadRound();else clearReplaySelection();
 if(oldMap&&$('#map').value&&oldMap!==$('#map').value){
  miningVersion++;customMining=null;
  registry.patterns=registry.patterns.filter(p=>!p.interactive);
  $('#mining-status').textContent='Đang tải các tuyến hành động…';
  runMining();
 }
}
function setupReplayTeams(){
 const teams=new Map();
 for(const row of registry.rounds)for(const team of replayTeams(row))teams.set(team.id,team.name);
 $('#replay-team').innerHTML='<option value="all">Tất cả đội</option>'+[...teams].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
 $('#replay-team').onchange=rounds;
 $('#replay-match').onchange=rounds;
}
async function loadRoundImpl(){const version=++loadVersion;resetPatternView();clearInterval(timer);timer=null;$('#play').textContent='▶ Phát';round=null;personalData=null;utilityEffects=null;utilityControls(null,null);renderUtility(null);bombMarker=null;renderBomb(null);clearCurrent('Đang đọc round và tính dự đoán từng giây…');$('#status').textContent='Đang tải dữ liệu thật của round…';const file=$('#round').value;const loaded=await get(file.startsWith('api/')?file:'intelligence/'+file);const geometry=await get('data/'+loaded.metadata.map+'_geometry.json');if(version!==loadVersion)return;round=loaded;bombMarker=plantedBomb(round);loadUtility(loaded,version);$('#prediction-model').disabled=!round.prediction_models;applyPredictionModel(false);regionNames=Object.fromEntries(Object.entries(geometry.points||{}).map(([key,p])=>[key,p.name]));actionEvents=replayActions(round);const initial=round.frames[0]?.players||[];playerNames=Object.fromEntries(initial.map(p=>[p.player_id,p.name]));$('#pattern-player').innerHTML='<option value="all">Cả 10 người</option>'+initial.map(p=>`<option value="${esc(p.player_id)}">${esc(p.side+' · '+p.name)}</option>`).join('');replayPlayerPicker.refresh();$('#personal-status').textContent='Đang đọc hồ sơ player…';loadPersonal(initial,version);const slots=new Map(['CT','T'].flatMap(side=>initial.filter(p=>p.side===side)).map((p,i)=>[p.player_id,i]));for(const frame of round.frames)frame.players.sort((a,b)=>(slots.get(a.player_id)??99)-(slots.get(b.player_id)??99));meta=geometry.world_to_radar;$('#background').setAttribute('href','assets/'+round.metadata.map+'.png');$('#time').max=Math.ceil((round.metadata.end_tick-round.metadata.start_tick)/round.metadata.tick_rate);$('#time').value=round.frames[0]?.requested_seconds||0;$('#seek-second').max=$('#time').max;if(pendingReplayLink&&round.metadata.round_id===replayLink.get('round_id')){const second=Number(replayLink.get('second'));if(Number.isFinite(second))$('#time').value=Math.max(0,Math.min(Number($('#time').max),second));pendingReplayLink=false;}setReplaySecond(+$('#time').value);highlight.clear();activeProof=null;clearRoute();$('#status').textContent=`${round.metadata.map} · ${round.metadata.ct_team||'CT'} (CT) vs ${round.metadata.t_team||'T'} (T)${round.metadata.game==='CS2'?' · '+round.metadata.event+' · '+(round.metadata.match_date?round.metadata.match_date.slice(0,10):'Ngày chưa xác định'):''}`;render()}
// The map replays observed player frames each second. Effects use the same
// playhead at fractional seconds so its recorded tick boundaries stay intact.
let replaySecond=0, replayClockStart=0, replayClockSecond=0;
function setReplaySecond(seconds){
 replaySecond=seconds;
 replayClockSecond=seconds;
 replayClockStart=performance.now();
 $('#time').value=Math.floor(seconds);
}
function drawReplayEffects(){
 if(!round)return;
 renderUtility(utilityEffects,round.metadata,meta,replaySecond);
 renderBomb(bombMarker,round.metadata,meta,replaySecond);
}
function advanceReplay(speed){
 if(!round)return;
 const previous=+$('#time').value;
 const limit=+$('#time').max;
 replaySecond=Math.min(limit,replayClockSecond+(performance.now()-replayClockStart)*speed/1000);
 const current=Math.floor(replaySecond);
 if(current!==previous){
  $('#time').value=current;
  if(!activeProof)highlight.clear();
  render(previous);
 }else drawReplayEffects();
 if(replaySecond>=limit&&timer){clearInterval(timer);timer=null;$('#play').textContent='\u25b6 Phát';}
}
function render(previousSecond=null){if(!round)return;const requested=+$('#time').value;drawReplayEffects();$('#seek-second').value=requested;$('#clock').textContent=requested+' giây';if(round.terminal&&requested>=round.terminal.seconds){renderTerminal(previousSecond);return;}const fr=round.frames.findLast(f=>f.requested_seconds<=requested);if(!fr||requested-fr.elapsed_seconds>.75){clearCurrent('Không có frame hợp lệ trong 0,75 giây trước thời điểm đã chọn.');return;}validateProof(fr.tick);renderRoster(fr);drawProbabilityTimeline(fr.tick,requested);
const pred=round.inference_mode?round.predictions.find(p=>p.tick===fr.tick):round.predictions.filter(p=>p.tick<=fr.tick).at(-1);if(!pred){$('#probbar').style.opacity='.15';$('#probbar').style.width='50%';$('#ctprob').textContent='CT —';$('#tprob').textContent='T —';$('#prediction-note').textContent='Không có dự đoán hợp lệ cho frame đang xem.';setPatternCards('');clearRouteFlashes();clearRoute();return}$('#probbar').style.opacity='1';$('#tprob').textContent='T '+formatProbability(pred.p_t_win);$('#ctprob').textContent='CT '+formatProbability(1-pred.p_t_win);$('#probbar').style.width=(100*(1-pred.p_t_win))+'%';$('#prediction-note').textContent=`Giây ${requested} · ${Number.isFinite(fr.bomb_context?.bomb_seconds_remaining)?`Bom ${fr.bomb_context.bomb_site||''} · còn ${fr.bomb_context.bomb_seconds_remaining.toFixed(1)}s`:`Đồng hồ ${fr.clock_time||'—'}`}${round.prediction_models?' · '+($('#prediction-model').value==='pattern'?'LR có pattern':$('#prediction-model').value==='baseline'?'LR baseline':round.prediction_models.active==='A_state'?'LR baseline':round.prediction_models.active==='D_state_site_compact'?'LR + phối hợp site':'LR có pattern'):''}`;const visibleMatches=customMining?.map===round.metadata.map?customMatches(fr.tick):[];setPatternCards(patternCards(visibleMatches,fr.tick));
bindMoveProof(visibleMatches,fr);updateRouteFlashes(fr.tick);flashNewRoutes(visibleMatches,fr.tick,previousSecond);}

function evaluation(){renderModelComparison();$('#evaluation-scope').textContent=registry.model_info?.version?.startsWith('cs2_lr_')?registry.model_info.evaluation_scope:['bomb_v2','move_hierarchical_v1','move_tuned_v2'].includes(registry.model_info?.version)?`Đánh giá trên snapshot mỗi 5 giây và mỗi giây khi đồng hồ bom ≤10s. Cấu hình chọn bằng validation; test giữ nguyên nhóm trận.${registry.model_info?.version==='move_tuned_v2'?' Accuracy dùng ngưỡng phân loại đã chọn trên validation; đường xác suất vẫn có mốc 0.5.':''}`:'Các chỉ số chỉ đánh giá tại 15/30/45/60 giây; các giây khác là bản thử.';const es=registry.evaluation;$('#metrics').innerHTML=Object.entries(es).map(([sp,e])=>`<h3>${sp}: ${e.rounds} round / ${e.snapshots} snapshot</h3><table><tr>${['accuracy','precision','recall','f1','roc_auc','log_loss','brier_score'].map(k=>`<th>${k}</th>`).join('')}</tr><tr>${['accuracy','precision','recall','f1','roc_auc','log_loss','brier_score'].map(k=>`<td>${e[k].toFixed(4)}</td>`).join('')}</tr></table><p>Confusion matrix (hàng: nhãn thật CT/T; cột: dự đoán CT/T): ${esc(JSON.stringify(e.confusion_matrix))}</p><p>Brier theo mốc: ${Object.entries(e.by_seconds).map(([t,x])=>`${t}s: ${x.brier_score.toFixed(4)} (n=${x.n})`).join(' · ')}</p>`).join('');const cal=es.test.calibration;$('#calibration').innerHTML='<path d="M40 220L360 20M40 20V220H360" fill="none" stroke="#7d8a96"/><text x="100" y="252" fill="white">Xác suất dự đoán (0 → 1)</text><text x="45" y="16" fill="white">Tỷ lệ T thắng quan sát</text>'+cal.predicted.map((x,i)=>`<circle cx="${40+x*320}" cy="${220-cal.observed[i]*200}" r="5" fill="#58d2ce"/>`).join('');$('#coefficients').innerHTML='<table>'+[...registry.coefficients.slice(0,15),...registry.coefficients.filter(c=>c.pattern).slice(0,10)].map(c=>`<tr><td>${esc(c.feature)}</td><td>${c.coefficient.toFixed(3)}</td><td>${c.pattern?'PrefixSpan':'Trạng thái'}</td></tr>`).join('')+'</table>'}
document.querySelectorAll('[data-pattern-side]').forEach(b=>b.onclick=()=>setPatternSide(b.dataset.patternSide));
window.addEventListener('resize',fitReplayLayout);
const replayLayoutObserver=new ResizeObserver(fitReplayLayout);
document.querySelectorAll('#status, #replay > .selectors').forEach(el=>replayLayoutObserver.observe(el));
fitReplayLayout();
try{registry=await get('intelligence/registry.json');try{registry.rounds=await get('api/rounds');registry.patterns=await get('api/patterns');registry.model_info=await get('api/model');registry.evaluation=registry.model_info.evaluation;registry.coefficients=registry.model_info.coefficients}catch{}options($('#map'),[...new Set(registry.rounds.map(r=>r.map))]);setupReplayTeams();if(registry.default_map)$('#map').value=registry.default_map;const linkedRound=registry.rounds.find(r=>r.round_id===replayLink.get('round_id'));if(linkedRound){$('#map').value=linkedRound.map;}$('#map').onchange=()=>{miningVersion++;customMining=null;registry.patterns=registry.patterns.filter(p=>!p.interactive);$('#mining-status').textContent='Đang tải các tuyến hành động…';activeProof=null;rounds();runMining()};$('#prediction-model').onchange=()=>applyPredictionModel();$('#pattern-scope').onchange=$('#pattern-player').onchange=()=>{resetPatternView();activeProof=null;highlight.clear();render()};$('#run-mining').onclick=runMining;$('#mining-algorithm').onchange=runMining;$('#run-mining').disabled=false;$('#split').onchange=rounds;$('#round').onchange=loadRound;$('#time').oninput=()=>{setReplaySecond(+$('#time').value);clearRouteFlashes();if(!activeProof)highlight.clear();render()};$('#seek-second').onchange=()=>{const n=Number($('#seek-second').value);if(Number.isInteger(n)&&n>=0&&n<=+$('#time').max){setReplaySecond(n);clearRouteFlashes();if(!activeProof)highlight.clear();render()}};$('#seek-second').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#seek-second').onchange();}};$('#zoom').oninput=fitRadar;enableWheelZoom($('.center-map .viewport'),$('#zoom'),$('#radar'));enableDragPan($('.center-map .viewport'));$('#clear-pattern').onclick=()=>{activeProof=null;highlight.clear();render()};$('#presentation-toggle').onclick=()=>{const active=document.body.classList.toggle('presenting');clearRouteFlashes();activeProof=null;highlight.clear();clearRoute();$('#presentation-toggle').textContent=active?'Thoát trình chiếu':'Trình chiếu';$('#presentation-toggle').setAttribute('aria-pressed',String(active));requestAnimationFrame(()=>{fitReplayLayout();fitRadar();if(round)render()})};if(replayLink.get('present')==='1')$('#presentation-toggle').click();const radarObserver=new ResizeObserver(()=>{fitRadar();if(round)render()});radarObserver.observe($('.map-and-teams'));radarObserver.observe($('.center-map .viewport'));$('#play').onclick=()=>{if(timer){clearInterval(timer);timer=null;$('#play').textContent='▶ Phát';return}$('#play').textContent='⏸ Dừng';replayClockSecond=replaySecond;replayClockStart=performance.now();const speed=+$('#speed').value;timer=setInterval(()=>advanceReplay(speed),16)};$('#speed').onchange=()=>{if(timer){$('#play').onclick();$('#play').onclick();}};document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>['replay','evaluation'].forEach(id=>$('#'+id).hidden=id!==b.dataset.tab));evaluation();rounds();runMining()}catch(e){$('#status').textContent='Chưa tải được dữ liệu: '+e.message}

async function loadRound(){try{return await loadRoundImpl()}catch(e){round=null;$('#status').textContent='Không tải được round: '+e.message}}

function clearCurrent(message){clearRouteFlashes();clearRoute();$('#prob-timeline').innerHTML='';$('#markers').innerHTML='';distributeHUD('');setPatternCards('');$('#ctprob').textContent='CT —';$('#tprob').textContent='T —';$('#probbar').style.opacity='.15';$('#prediction-note').textContent=message;}
function drawProbabilityTimeline(tick,seconds){
 const svg=$('#prob-timeline'),width=Math.max(260,svg.getBoundingClientRect().width||400);
 const h=winrateHistory(round.predictions,tick,seconds,width);
 svg.setAttribute('viewBox',`0 0 ${width} 116`);
 svg.innerHTML=`<path d="M${h.left} 14V90H${h.right}" fill="none" stroke="#526b7d"/><path class="prob-midline" d="M${h.left} ${h.mid}H${h.right}" stroke="#a2b1be" stroke-width="1" stroke-dasharray="5 4"/><text x="2" y="18" fill="#adbdca" font-size="10">100%</text><text x="2" y="${h.mid+4}" fill="#d0dce4" font-size="10">0.5</text><text x="12" y="91" fill="#adbdca" font-size="10">0%</text>`+
 h.segments.map(s=>`<path class="winrate-line ${s.side.toLowerCase()}" d="M${s.from.x} ${s.from.y}L${s.to.x} ${s.to.y}" fill="none" stroke="${teamAccent[s.side]}" stroke-width="2.5" stroke-linecap="round" pointer-events="none"/>`).join('')+
 [0,h.horizon/2,h.horizon].map(t=>`<text x="${h.x(t)}" y="108" text-anchor="${t===0?'start':t===h.horizon?'end':'middle'}" fill="#a7bbc9" font-size="10">${t}s</text>`).join('')+
 `<path d="M${h.x(seconds)} 14V90" stroke="#9ab2c2" stroke-width="1" opacity=".45"/>`+
 h.points.map(p=>`<g data-seconds="${p.seconds}" style="cursor:pointer"><rect x="${h.x(p.seconds)-Math.max(1.5,(h.right-h.left)/h.horizon/2)}" y="14" width="${Math.max(3,(h.right-h.left)/h.horizon)}" height="76" fill="transparent"/><title>${p.seconds}s · T ${(p.p_t_win*100).toFixed(1)}% · CT ${((1-p.p_t_win)*100).toFixed(1)}%</title></g>`).join('');
 svg.querySelectorAll('[data-seconds]').forEach(e=>e.onclick=()=>{setReplaySecond(+e.dataset.seconds);clearRouteFlashes();if(!activeProof)highlight.clear();render()});
}
function fitRadar(){
 const viewport=$('.center-map .viewport');if(!viewport)return;
 const stage=viewport.closest('.map-and-teams');
 const layout=getComputedStyle(stage);
 const px=property=>parseFloat(layout.getPropertyValue(property))||0;
 const height=stage.clientHeight-px('padding-top')-px('padding-bottom');
 const mapPadding=px('padding-left')+px('padding-right');
 const replay=stage.closest('.tactical-layout');
 if(window.matchMedia('(min-width:1300px)').matches&&height>0){
  const centerWidth=stage.closest('.tactical-center').clientWidth;
  const replayGap=parseFloat(getComputedStyle(replay).columnGap)||0;
  const mapWidth=height+2*(px('--roster-preferred')+px('column-gap'));
  const mapInsets=centerWidth-stage.clientWidth+mapPadding;
  const remaining=replay.clientWidth-replayGap-mapInsets-mapWidth;
  const patternWidth=Math.round(Math.max(390,Math.min(remaining,860,replay.clientWidth*.46)))+'px';
  if(replay.style.getPropertyValue('--pattern-width')!==patternWidth){
   replay.style.setProperty('--pattern-width',patternWidth);
  }
 }else if(replay.style.getPropertyValue('--pattern-width')){
  replay.style.removeProperty('--pattern-width');
 }
 const available=stage.clientWidth-mapPadding-2*(px('--roster-min')+px('column-gap'));
 // Size the center track to the unzoomed square. Share the leftover width between CT and T.
 const column=Math.max(0,Math.min(height,available))+'px';
 if(stage.style.getPropertyValue('--radar-column')!==column)stage.style.setProperty('--radar-column',column);
 const size=Math.min(viewport.clientWidth,viewport.clientHeight);
 if(size<=0)return;
 const scaled=size*Number($('#zoom').value||1);
 $('#radar').style.width=scaled+'px';$('#radar').style.height=scaled+'px';
}

function resetPatternView(){showAllPatterns=false;relatedOpen.clear();clearRouteFlashes();}
function patternCards(matches,tick){
 const rows=chronologicalMatches(matches,visiblePatterns(),tick).filter(r=>patternSideView==='all'||r.pattern.side===patternSideView);
 const groups=groupRelated(rows);
 const activeKey=activeProof?activeProof.pattern_id+':'+activeProof.player_id:null;
 const visible=replayPatternOrder(groups,patternSideView,showAllPatterns,activeKey);
 const selectedGroup=groups.find(g=>g.related.some(r=>rowKey(r)===activeKey));
 if(selectedGroup)relatedOpen.add(selectedGroup.key);
 const counts=['CT','T'].filter(side=>patternSideView==='all'||side===patternSideView).map(side=>{
  const count=rows.filter(row=>row.pattern.side===side).length;
  return `<span class="pattern-feed-count ${side.toLowerCase()}">${side} · ${count} lần khớp</span>`;
 }).join('');
 const cards=visible.map(g=>`<div class="pattern-group ${g.row.pattern.side.toLowerCase()}">${patternCard(g.row,tick,g.related)}</div>`).join('');
 const more=groups.length>8?`<button class="pattern-more" data-show-patterns="${showAllPatterns?'less':'all'}">${showAllPatterns?'Thu gọn':'Xem thêm'}<span>${showAllPatterns?'8 pattern gần nhất':`${visible.length}/${groups.length} pattern chính`}</span></button>`:'';
 return `<div class="pattern-feed-summary">${counts}</div>${cards||'<p class="muted">Chưa có pattern khớp tại mốc này.</p>'}${more}`;
}
function patternCard(row,tick,related=[]){
 const {pattern:p,player,matchIndex,playerIndex,start,completed}=row,key=rowKey(row);
 const sec=t=>((t-round.metadata.start_tick)/round.metadata.tick_rate).toFixed(1);
 const name=playerNames[player.player_id]||player.player_id,events=matchedActions(player,actionEvents,tick);
 const active=activeProof?.pattern_id===p.id&&activeProof?.player_id===player.player_id;
 const token=e=>{const region=e.region||e.label.slice(e.action.length+1),place=regionNames[region]||region.replaceAll('_',' ');return `<span class="pattern-event ${e.action==='MOVE'?'event-move':'event-extra'}" title="${esc(actionText(e,regionNames,playerNames))}"><span>${esc(e.action+' '+place)}</span><time>${sec(e.available_tick)}s</time></span>`};
 const relatedMarkup=related.length?relatedDisclosure(key,related,tick):null;
 const supportCount=`${p.support_count.toLocaleString('en-US')}/${p.sequence_count.toLocaleString('en-US')}`;
 return `<article class="pattern-card ${p.side.toLowerCase()} ${active?'is-selected':''}" data-pattern-key="${esc(key)}" data-completed="${completed}" data-support-count="${p.support_count}" data-total-sequences="${p.sequence_count}">
  <button class="pattern-select" data-match="${matchIndex}" data-player="${playerIndex}" aria-pressed="${active}" title="${esc(p.id)} · SteamID ${esc(player.player_id)} · Highlight trên map">
   <span class="pattern-card-header"><span class="pattern-identity"><span class="pattern-side-badge">${p.side}</span><strong>${esc(name)}</strong></span><time>${sec(start)}–${sec(completed)}s</time></span>
   <span class="pattern-events-preview">${events.map((e,i)=>(i?'<span class="event-arrow">→</span>':'')+token(e)).join('')}</span>
  </button>
  <div class="pattern-card-footer"><span class="pattern-support" title="Pattern Support · Support Count / Total Sequences trên train">Support <b>${(p.support*100).toFixed(2)}%</b> <small>${supportCount}</small></span>${patternWinRate(p,completed)}${relatedMarkup?.button??''}</div>
  ${relatedMarkup?.content??''}
 </article>`;
}

function renderTerminal(previousSecond){
 const t=round.terminal,last=lastObservedFrame(round.frames,t.tick);
 clearInterval(timer);timer=null;$('#play').textContent='▶ Phát';
 validateProof(t.tick);if(last)renderRoster(terminalRoster(round,last));
 $('#clock').textContent=t.seconds.toFixed(2)+' giây · KẾT THÚC';
 $('#ctprob').textContent=t.winner==='CT'?'CT THẮNG':'CT THUA';$('#tprob').textContent=t.winner==='T'?'T THẮNG':'T THUA';
 $('#probbar').style.opacity='.15';drawProbabilityTimeline(t.tick,t.seconds);
 $('#prediction-note').textContent='Kết thúc · '+(eliminationRound(round)?'Đội thua bị loại hết':(t.reason||'Không có thông tin'))+(last?' · Vị trí cập nhật theo dữ liệu quan sát':'');
 const matches=customMining?.map===round.metadata.map?customMatches(t.tick):[];
 setPatternCards(patternCards(matches,t.tick));if(last)bindMoveProof(matches,{...last,tick:t.tick});
 if(last){
  updateRouteFlashes(last.tick);
  flashNewRoutes(matches,t.tick,previousSecond,last.tick);
 }
}

function formatProbability(p){return p>=.999?'>99.9%':p<=.001?'<0.1%':(100*p).toFixed(1)+'%';}

function customMatches(tick){const player=$('#pattern-player').value;return moveMatches(round.move_exploration,visiblePatterns(),tick).map(m=>({...m,players:m.players.filter(p=>player==='all'||p.player_id===player)})).filter(m=>m.players.length);}
function visiblePatterns(){return candidatePatterns(customMining,personalData,round?.metadata.map,customMining?.min_sup_percent??2,$('#pattern-scope').value,$('#pattern-player').value,round?.frames[0]?.players||[]);}
async function loadPersonal(initial,version){try{const data=await get('api/player-patterns?map='+encodeURIComponent(round.metadata.map)+'&players='+initial.map(p=>p.player_id).join(','));if(version!==loadVersion)return;personalData=data;const eligible=data.profiles.filter(p=>p.eligible&&initial.some(q=>q.player_id===p.player_id&&q.side===p.side));$('#personal-status').textContent=`${eligible.length}/10 người đủ dữ liệu thống kê riêng.`;$('#personal-status').title='Cá nhân: ≥100 sequence train, ≥5 demo; mỗi pattern ≥10 lần. Dictionary cá nhân khai phá bằng PrefixSpan trên train.';render();}catch(e){if(version===loadVersion)$('#personal-status').textContent='Chưa tải được pattern cá nhân: '+e.message;}}

async function runMining(){
 const value=$('#min-sup').value;const n=Number(value);if(!value||!Number.isFinite(n)||n<1||n>100||Math.abs(n*100-Math.round(n*100))>1e-7){$('#mining-status').textContent='Nhập min_sup từ 1 đến 100%, tối đa 2 chữ số thập phân.';return;}
 const map=$('#map').value,algorithm=$('#mining-algorithm').value,version=++miningVersion;$('#run-mining').disabled=true;$('#mining-status').textContent='Đang tìm các chuỗi hành động…';
 try{const response=await fetch('api/mine?map='+encodeURIComponent(map)+'&min_sup='+encodeURIComponent(value)+'&algorithm='+encodeURIComponent(algorithm));const data=await response.json();if(!response.ok)throw Error(data.error||'Không khai phá được');if(version!==miningVersion||map!==$('#map').value)return;resetPatternView();customMining={...data,patterns:data.all_patterns||data.patterns};registry.patterns=registry.patterns.filter(p=>!p.interactive).concat(customMining.patterns);$('#mining-status').textContent=`${data.algorithm==='gsp'?'GSP':'PrefixSpan'} · min_sup ${data.min_sup_percent}%`;if(!activeProof)highlight.clear();render();}
 catch(e){if(version===miningVersion)$('#mining-status').textContent='Không áp dụng min_sup mới: '+e.message;}
 finally{$('#run-mining').disabled=false;}
}


const equipmentIcons={"AK-47":"ak47","AUG":"aug","AWP":"awp","PP-Bizon":"bizon","C4":"c4","Desert Eagle":"deagle","Decoy Grenade":"decoy","Dual Berettas":"elite","FAMAS":"famas","Five-SeveN":"fiveseven","Flashbang":"flashbang","G3SG1":"g3sg1","Galil AR":"galilar","Glock-18":"glock","HE Grenade":"hegrenade","P2000":"hkp2000","Incendiary Grenade":"incgrenade","M249":"m249","M4A4":"m4a1","MAC-10":"mac10","MAG-7":"mag7","Molotov":"molotov","MP7":"mp7","MP5-SD":"mp5sd","MP9":"mp9","Negev":"negev","Nova":"nova","P250":"p250","P90":"p90","Sawed-Off":"sawedoff","SCAR-20":"scar20","SG 553":"sg556","Smoke Grenade":"smokegrenade","SSG 08":"ssg08","Zeus x27":"taser","Tec-9":"tec9","UMP-45":"ump45","XM1014":"xm1014","M4A1":"m4a1_silencer","M4A1-S":"m4a1_silencer","CZ75 Auto":"cz75a","CZ75-Auto":"cz75a","USP-S":"usp_silencer","R8 Revolver":"revolver","Kevlar Vest":"kevlar","Kevlar + Helmet":"assaultsuit","Defuse Kit":"defuser","Knife":"knife"};
function renderPlayerHUD(fr){
 const utilities=[['smoke','SMK',['Smoke Grenade']],['flash','FL',['Flashbang']],['fire','FIRE',['Molotov','Incendiary Grenade']],['he','HE',['HE Grenade']]];
 distributeHUD(['CT','T'].map(side=>{const team=side==='CT'?round.metadata.ct_team:round.metadata.t_team;const players=fr.players.filter(p=>p.side===side);
 return `<section class="hud-team ${side.toLowerCase()}"><div class="hud-team-heading"><strong>${esc(team||side)}</strong><span>${side} · ${players.filter(p=>p.is_alive).length}/5 còn sống</span><small class="hud-team-total">${players.filter(p=>p.is_alive).reduce((n,p)=>n+p.health,0)} HP · ${players.filter(p=>p.is_alive).reduce((n,p)=>n+p.armor,0)} AR</small></div><div class="hud-lineup">${players.map(p=>{const number=fr.players.indexOf(p)+1,hp=Number.isFinite(p.health)?p.health:null;const inventory=Array.isArray(p.inventory)?p.inventory:null;
 return `<div class="hud-player ${p.is_alive?'':'is-dead'} ${highlight.has(p.player_id)?'is-highlighted':''}" data-player-id="${esc(p.player_id)}" aria-label="${esc(p.name)} · ${side} · ${hp??'—'} HP · ${p.is_alive?'Còn sống':'Đã bị loại'}"><div class="hud-player-top"><span class="hud-number">${number}</span><span class="hud-state">${p.is_defusing?'ĐANG GỠ':p.is_alive?side:'ĐÃ BỊ LOẠI'}</span>${p.has_defuse_kit&&side==='CT'?'<span class="hud-kit" title="Có bộ gỡ bom">KIT</span>':''}</div><div class="hud-name" title="${esc(p.name)}">${esc(p.name||p.player_id)}</div><div class="hud-health"><strong>${hp??'—'}<small>HP</small></strong><span title="Giáp">${p.armor??'—'} AR</span></div><div class="hud-hp-track" role="meter" aria-label="Máu ${esc(p.name)}" aria-valuemin="0" aria-valuemax="100" ${hp===null?'':`aria-valuenow="${hp}"`}><i style="width:${hp===null?0:Math.max(0,Math.min(100,hp))}%"></i></div><div class="hud-weapon" title="Súng đang cầm: ${esc(p.weapon||'Không có dữ liệu')}">${weaponGlyph(p.weapon,p.side)}<span>${esc(p.weapon||'—')}</span></div><div class="hud-utility" aria-label="Utility còn lại">${inventory?utilities.map(([key,label,names])=>{const count=inventory.filter(w=>names.includes(w.weaponName)).reduce((n,w)=>n+Math.max(1,w.ammoInMagazine||0),0);return `<span class="hud-grenade ${count?'has-utility':''}" title="${names.join(' / ')}: ${count}">${weaponGlyph(names.find(name=>inventory.some(w=>w.weaponName===name))||((key==='fire'&&p.side==='CT')?'Incendiary Grenade':names[0]),p.side)}<small>${key==='fire'&&(names.find(name=>inventory.some(w=>w.weaponName===name))||(p.side==='CT'?'Incendiary Grenade':'Molotov'))==='Incendiary Grenade'?'INC':label}</small><b>${count}</b></span>`}).join(''):'<span class="hud-unknown">Utility: chưa có dữ liệu</span>'}</div></div>`;}).join('')}</div></section>`;
 }).join(''));
}

function weaponGlyph(name,side){
 const base=/knife|bayonet|karambit|daggers/i.test(name||'')?'Knife':name;
 const icon=base==='Knife'&&side==='T'?'knife_t':equipmentIcons[base];
 if(!icon)return '';
 return `<img class="equipment-icon" src="assets/equipment/${icon}.svg" alt="" aria-hidden="true" loading="eager">`;
}

function splitPanels(markup,prefix,selector){const template=document.createElement('template');template.innerHTML=markup;for(const side of ['ct','t'])$('#'+side+'-'+prefix).innerHTML=template.content.querySelector(selector+'.'+side)?.outerHTML||'';}
function distributeHUD(markup){splitPanels(markup,'players','.hud-team');}
function setPatternCards(markup){
 const panel=$('.pattern-panel-body'),top=panel.scrollTop;
 const follow=!activeProof&&panel.scrollHeight-panel.clientHeight-top<28;
 panel.innerHTML=markup;
 panel.scrollTop=follow?panel.scrollHeight:top;
}
function fitReplayLayout(){
 const layout=$('.tactical-layout');if(!layout||$('#replay').hidden)return;
 layout.style.setProperty('--replay-height',Math.max(380,window.innerHeight-layout.getBoundingClientRect().top-12)+'px');
}
function setPatternSide(side){
 patternSideView=side;resetPatternView();activeProof=null;highlight.clear();
 document.querySelectorAll('[data-pattern-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.patternSide===side)));
 render();$('.pattern-panel-body').scrollTop=0;
}

function clearRouteFlashes(){
 clearTimeout(routeBatchTimer);
 routeBatchTimer=null;
 nextRouteFlashAt=0;
 for(const [route,flash] of activeRouteFlashes){
  flash.animation.cancel();
  route.remove();
 }
 activeRouteFlashes.clear();
}

function routeMarkup(segments,color,prefix,label){
 const gradients=segments.map(({from,to,startOpacity,endOpacity},i)=>
  `<linearGradient id="${prefix}-${i}" gradientUnits="userSpaceOnUse" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"><stop offset="0" stop-color="${color}" stop-opacity="${startOpacity}"/><stop offset="1" stop-color="${color}" stop-opacity="${endOpacity}"/></linearGradient>`
 ).join('');
 const paths=segments.map((segment,i)=>{
  const {from,to}=segment;
  const title=label?'<title>'+esc(label(segment))+'</title>':'';
  return `<path class="route-trail" d="M${from.x} ${from.y}L${to.x} ${to.y}" stroke="url(#${prefix}-${i})" stroke-width="6" stroke-linecap="round" fill="none">${title}</path>`;
 }).join('');
 return '<defs>'+gradients+'</defs>'+paths;
}

function flashRouteMarkup(flash,tick){
 const segments=routeSegments(round.frames,flash.playerId,flash.from,tick,tick,round.metadata.tick_rate,meta,{connectedTail:true});
 if(!segments.length||segments[0].from.tick>flash.completed)return '';
 return routeMarkup(segments,flash.color,flash.id);
}

function updateRouteFlashes(tick){
 for(const [route,flash] of activeRouteFlashes)route.innerHTML=flashRouteMarkup(flash,tick);
}

function flashNewRoutes(matches,tick,previousSecond,displayTick=tick){
 if(previousSecond===null||activeProof||!document.body.classList.contains('presenting'))return;
 if(routeBatchTimer!==null||performance.now()<nextRouteFlashAt)return;
 const previousTick=round.frames.findLast(f=>f.requested_seconds<=previousSecond)?.tick??round.metadata.start_tick-1;
 const visible=chronologicalMatches(matches,visiblePatterns(),tick)
  .filter(row=>row.completed>previousTick&&(patternSideView==='all'||row.pattern.side===patternSideView));
 const flashed=new Set();
 for(const {player,pattern,completed} of visible.sort((a,b)=>b.player.matched_events.length-a.player.matched_events.length||b.completed-a.completed)){
  if(flashed.has(player.player_id))continue;
  const first=player.matched_events[0];
  const flash={id:'route-flash-'+nextFlashId++,playerId:player.player_id,completed,from:first.tick??first.available_tick,color:teamAccent[pattern.side]};
  const markup=flashRouteMarkup(flash,displayTick);
  if(!markup)continue;
  flashed.add(player.player_id);
  const route=document.createElementNS('http://www.w3.org/2000/svg','g');
  const name=playerNames[player.player_id]||player.player_id;
  route.setAttribute('data-player-id',player.player_id);
  route.setAttribute('aria-label',name);
  route.innerHTML=markup;
  $('#route-flashes').append(route);
  const frames=window.matchMedia('(prefers-reduced-motion: reduce)').matches
   ?[{opacity:1},{opacity:0}] : [{opacity:1},{opacity:.35,offset:.22},{opacity:1,offset:.42},{opacity:0}];
  flash.animation=route.animate(frames,{duration:presentationRouteDuration,easing:'ease-out'});
  activeRouteFlashes.set(route,flash);
 }
 if(flashed.size){
  routeBatchTimer=setTimeout(()=>{
   clearRouteFlashes();
   nextRouteFlashAt=performance.now()+presentationRouteGap;
  },presentationRouteDuration);
 }
}

function clearRoute(){
 $('#route-layer').innerHTML='';$('.pattern-timeline-wrap').hidden=true;$('#pattern-timeline').innerHTML='';
}
function showMoveProof(match,player,fr){
 const name=fr.players.find(p=>p.player_id===player.player_id)?.name||player.player_id;
 const seconds=t=>((t-round.metadata.start_tick)/round.metadata.tick_rate).toFixed(2);
 const first=player.matched_events[0],last=player.matched_events.at(-1);
 const from=first.tick??first.available_tick,to=last.available_tick;
 const side=fr.players.find(p=>p.player_id===player.player_id)?.side,color=teamAccent[side]||teamAccent.CT;
 const segments=routeSegments(round.frames,player.player_id,from,to,fr.tick,round.metadata.tick_rate,meta);
 $('#route-layer').innerHTML=routeMarkup(segments,color,'route-fade',s=>name+' · '+seconds(s.from.tick)+'–'+seconds(s.to.tick)+'s')+`<g pointer-events="none"><rect x="16" y="14" width="420" height="54" rx="5" fill="#07121d" opacity=".9"/><text x="28" y="37" fill="${color}" font-size="18">${esc(name)} · ${seconds(from)}–${seconds(to)}s</text><text x="28" y="57" fill="#b8cad6" font-size="14">Cũ mờ → mới sáng · đường nối vị trí ghi nhận</text></g>`;

 drawPatternTimestamps(player,fr.tick,color);

}

function bindMoveProof(matches,fr){
 document.querySelectorAll('.pattern-panel-body button[data-match]').forEach(b=>b.onclick=()=>{
  const m=matches[+b.dataset.match],player=m.players[+b.dataset.player];
  const proof={pattern_id:m.pattern_id,player_id:player.player_id};
  clearRouteFlashes();activeProof=proof;highlight=new Set([player.player_id]);render();
  if(document.body.classList.contains('presenting')){
   setTimeout(()=>{
    if(activeProof!==proof)return;
    activeProof=null;highlight.clear();clearRoute();render();
   },presentationRouteDuration);
  }
 });
 document.querySelectorAll('[data-show-patterns]').forEach(b=>b.onclick=()=>{showAllPatterns=b.dataset.showPatterns==='all';render();document.querySelectorAll('.pattern-panel-body').forEach(el=>el.scrollTop=0)});
 document.querySelectorAll('[data-pattern-disclosure]').forEach(button=>button.onclick=()=>{
  const key=button.dataset.disclosureKey;
  const panel=document.getElementById(button.getAttribute('aria-controls'));
  const open=panel.hidden;
  panel.hidden=!open;
  button.setAttribute('aria-expanded',String(open));
  if(open)relatedOpen.add(key);else relatedOpen.delete(key);
 });
 if(activeProof){const m=matches.find(m=>m.pattern_id===activeProof.pattern_id);const player=m?.players.find(p=>p.player_id===activeProof.player_id);if(player)showMoveProof(m,player,fr);else clearRoute();}else clearRoute();
}
function drawPatternTimestamps(player,tick,color){
 const wrap=$('.pattern-timeline-wrap'),svg=$('#pattern-timeline');wrap.hidden=false;
 const events=matchedActions(player,actionEvents,tick),width=Math.max(260,$('.center-map .viewport').clientWidth);
 const sec=e=>(e.available_tick-round.metadata.start_tick)/round.metadata.tick_rate;
 const first=events[0]?sec(events[0]):0,last=events.at(-1)?sec(events.at(-1)):first;
 const x=e=>12+(sec(e)-first)/Math.max(1,last-first)*(width-24);
 $('#pattern-timeline-label').textContent=(playerNames[player.player_id]||player.player_id)+' · timestamps '+first.toFixed(1)+'–'+last.toFixed(1)+'s';
 svg.setAttribute('viewBox',`0 0 ${width} 38`);let right=-Infinity;
 svg.innerHTML=`<path d="M12 13H${width-12}" stroke="#425b70"/>`+events.map(e=>{
  const at=x(e),label=sec(e).toFixed(1)+'s',show=at-right>26||e===events.at(-1);if(show)right=at;
  return `<g data-pattern-event="${esc(e.event_id)}" data-event-tick="${e.available_tick}"><title>${esc(actionText(e,regionNames,playerNames))} · ${label}</title><path d="M${at} 5V22" stroke="${e.action==='MOVE'?color:'#e0e8ef'}" stroke-width="2"/>${show?`<text x="${at}" y="35" text-anchor="${e===events[0]?'start':e===events.at(-1)?'end':'middle'}" fill="#a8bfce" font-size="9">${label}</text>`:''}</g>`;
 }).join('');
}

function renderRoster(fr){$('#markers').innerHTML=fr.players.map((p,i)=>{const x=(p.x-meta.x)/meta.scale,y=(meta.y-p.y)/meta.scale,c=p.is_alive?teamAccent[p.side]:'#8b919a';return `<g><title>${esc(p.name)} · ${p.side} · HP ${p.health}</title><circle cx="${x}" cy="${y}" r="${highlight.has(p.player_id)?18:11}" fill="${c}" stroke="${highlight.has(p.player_id)?'#fff':'#101820'}" stroke-width="3"/><text x="${x+15}" y="${y+5}" fill="${c}" font-size="17" stroke="#080e14" paint-order="stroke" stroke-width="3">${i+1}</text></g>`}).join('');renderPlayerHUD(fr);}

function validateProof(tick){
 if(!activeProof)return;
 const match=customMining?.map===round.metadata.map?customMatches(tick).find(m=>m.pattern_id===activeProof.pattern_id):null;
 if(!match?.players.some(p=>p.player_id===activeProof.player_id)){activeProof=null;highlight.clear();clearRoute();}
}

function relatedDisclosure(key,related,tick){
 const id=esc(`pattern-related-${encodeURIComponent(key)}`),open=relatedOpen.has(key);
 return {
  button:`<button type="button" class="pattern-disclosure" data-pattern-disclosure="related" data-disclosure-key="${esc(key)}" aria-controls="${id}" aria-expanded="${open}" title="Related Patterns">Related <b>${related.length}</b></button>`,
  content:`<div id="${id}" class="pattern-detail" ${open?'':'hidden'}><div class="related-list">${related.map(row=>patternCard(row,tick)).join('')}</div></div>`
 };
}

function patternWinRate(pattern,completed){
 const phase=completionPhase((completed-round.metadata.start_tick)/round.metadata.tick_rate);
 const train=pattern.outcomes?.[phase]?.train;
 if(!train)return '';
 const note=`Tập train · ${phaseLabels[phase]} · ${train.wins}/${train.rounds} round thắng${train.rounds<30?' · ít mẫu':''}`;
 return `<span class="pattern-winrate" title="${esc(note)}">Win rate <b>${percent(train.win_rate)}</b></span>`;
}
function renderModelComparison(){
 const view=modelComparisonView(registry.model_info);
 $('#model-description').textContent=view.description;
 $('#model-comparison').innerHTML=view.markup;
}

function applyPredictionModel(refresh=true){
 if(!round)return;
 const mode=$('#prediction-model').value;
 for(const p of round.predictions){
  p.active_p_t_win??=p.p_t_win;
  p.p_t_win=(mode==='pattern'?p.pattern_p_t_win:mode==='baseline'?p.baseline_p_t_win:p.active_p_t_win)??p.active_p_t_win;
 }
 if(refresh)render();
}

async function loadUtility(loaded,version){
    try{
        const effects=await replayUtility(loaded);
        if(version!==loadVersion||round!==loaded)return;
        utilityEffects=effects;
        utilityControls(loaded,effects,seconds=>{
            clearInterval(timer);timer=null;$('#play').textContent='▶ Phát';
            setReplaySecond(seconds);
            clearRouteFlashes();
            render();
        },drawReplayEffects);
        drawReplayEffects();
    }catch(error){
        if(version!==loadVersion||round!==loaded)return;
        const panel=$('#replay-utility');
        panel.hidden=true;panel.replaceChildren();
    }
}
