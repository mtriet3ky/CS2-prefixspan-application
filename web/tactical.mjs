import {enableWheelZoom,enableDragPan} from './wheel_zoom.mjs?v=2';
import {holdPaths,tacticalPaths} from './tactical_paths.mjs?v=hold-approach-2';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>(n*100).toFixed(2)+'%',fmt=n=>Number(n).toFixed(1)+'s',pretty=s=>currentMap==='de_mirage'&&s==='MOVE_TRUCK'?'VAN':s.replace(/^MOVE_/,'').replaceAll('_',' ');
let mode='profile',catalog,data,shown=8,revision=0,proofRevision=0,currentMap='',items=[],selected=-1;let regionGeometry=null,activeView=null,locationSelection=null,panX=0,panY=0;const traceCache=new Map();
const get=async(path,params={})=>{const r=await fetch(path+'?'+new URLSearchParams(params));if(!r.ok)throw Error((await r.text()).replace(/<[^>]+>/g,' ').slice(-400));return r.json()};
function option(el,values){el.innerHTML=values.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}
function searchText(value){return String(value).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();}
function refreshPlayers(){
 const team=$('#team').value,previousMap=$('#map').value,previousPlayer=$('#player').value;
 const maps=[...new Set(catalog.players.flatMap(p=>(p.contexts||[]).filter(c=>team==='all'||c.team_id===team).map(c=>c.map)))].sort();
 option($('#map'),maps.map(map=>[map,map.replace('de_','')]));
 if(maps.includes(previousMap))$('#map').value=previousMap;
 const query=searchText($('#player-search').value),side=$('#side').value,weapon=$('#weapon').value;
 const candidates=catalog.players.map(player=>{
  const contexts=(player.contexts||[]).filter(c=>(team==='all'||c.team_id===team)&&c.map===$('#map').value&&c.side===side&&(weapon==='all'||c.weapon===weapon));
  const rounds=contexts.reduce((n,c)=>n+c.rounds,0);
  const demos=new Set(contexts.flatMap(c=>c.demo_ids)).size;
  return {player,rounds,demos};
 }).filter(({player,rounds})=>rounds>0&&(!query||[player.name,player.id,...(player.aliases||[])].some(name=>searchText(name).includes(query))))
 .sort((a,b)=>b.rounds-a.rounds||a.player.name.localeCompare(b.player.name));
 option($('#player'),candidates.map(({player,rounds,demos})=>[player.id,player.name+' · '+rounds+' round · '+demos+' demo']));
 if(candidates.some(p=>p.player.id===previousPlayer))$('#player').value=previousPlayer;
 if(!candidates.length)$('#player').innerHTML='<option value="">Không có tuyển thủ phù hợp</option>';
 $('#player').disabled=!candidates.length;
 $('#run').disabled=mode==='profile'&&!candidates.length;
 const player=catalog.players.find(p=>p.id===$('#player').value);
 $('#player').title=player?'SteamID '+player.id+' · '+(player.aliases||[]).join(' / '):'';
}
function mapChanged(){panX=0;panY=0;updateMapTransform();activeView=null;locationSelection=null;$('#location-labels').replaceChildren();currentMap=$('#map').value;$('#radar').setAttribute('href',`assets/${currentMap}.png`);$('#map-title').textContent=currentMap.replace('de_','');$('#paths').innerHTML='';$('#map-region-legend').hidden=true;$('#map-region-legend').innerHTML='';$('#proof').textContent='Chọn hành vi để xem đường đi trên bản đồ.';proofRevision++}
function switchMode(next){mode=next;$('#player-search').value='';$('#team option[value="all"]').disabled=mode==='plays';if(mode==='plays'&&$('#team').value==='all')$('#team').selectedIndex=1;refreshPlayers();document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));document.querySelectorAll('.personal').forEach(e=>e.hidden=mode!=='profile');document.querySelectorAll('.team-only').forEach(e=>e.hidden=mode!=='plays');$('#roles').innerHTML='';run()}
async function run(){if(mode==='profile'&&!$('#player').value){$('#status').textContent='Không tìm thấy tuyển thủ phù hợp. Hãy đổi từ khóa hoặc bộ lọc.';return;}const v=++revision;proofRevision++;$('#run').disabled=true;$('#status').className='';$('#status').textContent='Đang phân tích dữ liệu thực…';shown=8;selected=-1;$('#list').innerHTML='';$('#roles').innerHTML='';$('#summary').innerHTML='';$('#more').hidden=true;mapChanged();try{let loaded;const geometryRequest=get('api/analysis/regions',{map:currentMap});const params={map:currentMap,side:$('#side').value,split:$('#split').value};if(mode==='profile'){Object.assign(params,{player:$('#player').value,weapon:$('#weapon').value,min_sup:$('#support').value,team:$('#team').value});loaded=await get('api/analysis/profile',params)}else loaded=await get('api/analysis/plays',{...params,team:$('#team').value});const geometry=await geometryRequest;if(v!==revision)return;regionGeometry=geometry;data=loaded;items=data.patterns;$('#status').textContent='';if(mode==='profile'){const p=catalog.players.find(p=>p.id===data.player_id);$('#summary').innerHTML=`<h2>${esc(p?.name)} · ${esc(data.side)}${data.team_name?' · '+esc(data.team_name):''}</h2><p>${data.sequences} player-round / ${data.matches} demo</p>${data.sequences<10?'<p class="muted">Ít hơn 10 round: chưa đủ mẫu để kết luận thói quen ổn định.</p>':''}`;renderRoles()}else $('#summary').innerHTML=`<h2>${esc(data.team_name)} · ${esc(data.side)}</h2><p>${data.rounds} ${esc(data.side)}-round của đội · ${data.demos} demo · ${items.length} nhóm hành vi</p><p class="muted">Các nhãn phản ánh điều kiện vị trí/thời gian, chưa khẳng định ý đồ chiến thuật.</p>`;renderList()}catch(e){if(v===revision){$('#status').className='error';$('#status').textContent=e.message}}finally{if(v===revision)$('#run').disabled=mode==='profile'&&!$('#player').value}}
function profileRole(role){
 if(data.side!=='T')return role;
 if(role.code.includes('_HOLD_'))return null;
 if(role.code.includes('_ENTRY_'))return {...role,label:`Đẩy vào ${role.route} · đi đầu`,category:'Đẩy vào site'};
 return role;
}
function renderRoles(){
 const basisPoints=Math.round(data.min_sup*100);
 const eligibleRoles=data.roles.map((role,i)=>({r:profileRole(role),i})).filter(({r})=>r&&r.count>=Math.ceil(r.total*basisPoints/10000));
 const categories=[...new Set(eligibleRoles.map(({r})=>r.category))];
 $('#roles').innerHTML='<div class="role-heading"><h3>Hành vi theo vị trí</h3><select id="role-kind" aria-label="Nhóm hành vi"><option value="all">Tất cả hành vi</option>'+categories.map(c=>`<option>${esc(c)}</option>`).join('')+'</select></div><div id="role-cards" class="role-grid"></div><button id="role-more" hidden>Xem thêm vị trí</button>';
 let limit=8;function cards(){const kind=$('#role-kind').value;const rows=eligibleRoles.filter(({r})=>kind==='all'||r.category===kind);$('#role-cards').innerHTML=rows.slice(0,limit).map(({r,i})=>`<button class="role ${data.side==='T'?'t':''}" data-role="${i}" title="${esc(r.definition)}"><span class="role-category">${esc(r.category)}</span><span class="role-name">${esc(r.label)}</span><span><strong>${pct(r.share)}</strong> <small>${r.count}/${r.total} round</small></span></button>`).join('')||`<p class="muted">Chưa có hành vi đạt ngưỡng ${data.min_sup}% với bộ lọc này.</p>`;$('#role-more').hidden=limit>=rows.length;$('#role-more').textContent=`Xem thêm vị trí · còn ${Math.max(0,rows.length-limit)}`;$('#roles').querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>showRole(+b.dataset.role))}$('#role-kind').onchange=()=>{limit=8;cards()};$('#role-more').onclick=()=>{limit+=8;cards()};cards();
}
function renderList(){if(mode==='profile'){$('#list').innerHTML='';$('#more').hidden=true;return;}$('#list').innerHTML=items.length?items.slice(0,shown).map((p,i)=>`<article class="card ${p.side==='T'||mode==='profile'&&data.side==='T'?'t':''} ${selected===i?'selected':''}"><h3><button data-select="${i}">${mode==='profile'?`Tuyến ${i+1}`:esc(p.title)}</button></h3>${mode==='profile'?`<div class="chain">${p.actions.map(a=>`<span class="region">${esc(pretty(a))}</span>`).join('<span>→</span>')}</div><div class="numbers"><span>Pattern Support <strong>${pct(p.support)}</strong></span><span>${p.support_count} / ${p.total_sequences} sequences</span><small>${p.matches} demo</small></div>`:`<div class="badge">${esc(p.label)}</div><p><small>${esc(p.rule)}</small></p><div class="numbers"><span>Tần suất <strong>${pct(p.frequency)}</strong></span><span>${p.count} / ${p.total} ${esc(p.side)}-round</span></div>`}</article>`).join(''):'<p class="empty">Không có kết quả với bộ lọc này. Có thể đổi tuyển thủ, map hoặc nhóm súng; dữ liệu không được bổ sung bằng ví dụ giả.</p>';$('#more').hidden=shown>=items.length;$('#more').textContent=`Xem thêm · còn ${Math.max(0,items.length-shown)} kết quả`;$('#list').querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectProof(+b.dataset.select,0))}
async function showRole(i){
 const v=++proofRevision,r=profileRole(data.roles[i]);activeView=()=>showRole(i);selected=-1;$('#list').querySelectorAll('.card').forEach(e=>e.classList.remove('selected'));$('#roles').querySelectorAll('[data-role]').forEach(b=>b.classList.toggle('selected',+b.dataset.role===i));
 showRegionLegend(r.code);$('#map-title').textContent=r.label;$('#paths').replaceChildren();
 try{const traces=await loadTraces(r.rounds);if(v!==proofRevision)return;const hold=r.code.includes('_HOLD_');const paths=hold?holdPaths(r.rounds,traces):tacticalPaths(r.rounds,traces,true);drawPaths(paths,data.side);$('#proof').innerHTML=`<h3>${esc(r.label)}</h3><p>${pct(r.share)} · ${r.count}/${r.total} round · ${esc(r.route)}</p>${hold?holdPathNote(paths):''}`}catch(e){if(v===proofRevision)$('#proof').textContent=e.message}
}
async function loadTraces(proofs){const ids=[...new Set(proofs.map(p=>p.sequence_id))];for(let i=0;i<ids.length;i+=6)await Promise.all(ids.slice(i,i+6).map(async id=>{if(!traceCache.has(id))traceCache.set(id,(await get('api/analysis/trace',{id})).sequence)}));return traceCache}
function regionPolygons(keys){
 if(!regionGeometry)return [];
 const aliases=regionGeometry.display_aliases||regionGeometry.aliases;
 const wanted=new Set(keys.flatMap(key=>aliases[key]||[key]));
 return regionGeometry.polygons.filter(p=>wanted.has(p.region));
}

function selectionKeys(selection){
 if(!regionGeometry)return [];
 if(Array.isArray(selection))return selection.map(a=>a.replace(/^MOVE_/,''));
 const keys=(regionGeometry.display_labels||regionGeometry.labels)[selection];
 return keys|| (selection.includes('_HOLD_')?[selection.split('_HOLD_')[1]]:[]);
}

function locationAnchor(points){
 let area=0,x=0,y=0;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
  area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
 }
 const center=Math.abs(area)>1e-6?[x/(3*area),y/(3*area)]:points[0];
 const inside=([px,py])=>{
  let hit=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[i],b=points[j];
   if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
 };
 if(inside(center))return {point:center,area:Math.abs(area)};
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),candidates=[];
 for(let i=1;i<20;i++)for(let j=1;j<20;j++){
  const point=[Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*i/20,Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*j/20];
  if(inside(point))candidates.push(point);
 }
 candidates.sort((a,b)=>Math.hypot(a[0]-center[0],a[1]-center[1])-Math.hypot(b[0]-center[0],b[1]-center[1]));
 return {point:candidates[0]||points[0],area:Math.abs(area)};
}

function drawLocationLabels(){
 const layer=$('#location-labels');
 if(!locationSelection){layer.replaceChildren();return;}
 const zoom=+$('#zoom').value;
 const names={MACRO_A:'A Site',MACRO_B:'B Site',MACRO_MID:'Mid',A_SITE:'A Site',B_SITE:'B Site',MID:'Mid',MIDDLE:'Mid',TRUCK:'Van',VAN:'Van'};
 const seen=new Set(),labels=[];
 for(const key of selectionKeys(locationSelection)){
  const polygons=regionPolygons([key]);
  const candidates=polygons.map(p=>({...locationAnchor(p.points),name:names[key]||p.name})).sort((a,b)=>b.area-a.area);
  const anchor=candidates[0];
  if(!anchor||seen.has(anchor.name))continue;
  seen.add(anchor.name);
  const [x,y]=anchor.point.map((v,i)=>512+(v-512)*zoom+(i===0?panX:panY));
  if(x<0||x>1024||y<0||y>1024)continue;
  labels.push({name:anchor.name,x,y,left:x<512,labelY:Math.max(40,Math.min(976,y-24))});
 }
 for(const left of [true,false]){
  const side=labels.filter(p=>p.left===left).sort((a,b)=>a.labelY-b.labelY);
  for(let i=1;i<side.length;i++)side[i].labelY=Math.max(side[i].labelY,side[i-1].labelY+46);
  for(let i=side.length-1;i>=0;i--)side[i].labelY=Math.min(side[i].labelY,976-(side.length-1-i)*46);
 }
 layer.innerHTML='<defs><marker id="location-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="#efd18b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>'+labels.map(p=>{
  const textX=p.left?26:998;
  const width=Math.min(240,Math.max(55,p.name.length*12));
  const fromX=p.left?textX+width+10:textX-width-10;
  return '<g class="location-label"><path d="M'+fromX+' '+(p.labelY-7)+'L'+p.x+' '+p.y+'" marker-end="url(#location-arrow)"/><text x="'+textX+'" y="'+p.labelY+'" text-anchor="'+(p.left?'start':'end')+'">'+esc(p.name)+'</text></g>';
 }).join('');
}

function showRegionLegend(selection){
 locationSelection=selection;
 $('#map-region-legend').hidden=true;
 $('#map-region-legend').replaceChildren();
 drawLocationLabels();
}

function holdPathNote(paths){
 return `<p class="muted">${paths.length?'Đường quan sát được trong tối đa 8 giây trước lúc giữ vị trí.':'Không có đoạn di chuyển liền mạch đủ rõ trước lúc giữ vị trí.'}</p>`;
}
function drawPaths(paths,side){const color=side==='CT'?'#65d5ff':'#ffb361';$('#paths').innerHTML=paths.map(points=>points.length===1?`<circle cx="${points[0][0]}" cy="${points[0][1]}" r="8" fill="${color}" opacity=".12"/>`:points.slice(1).map((p,i)=>`<path d="M${points[i][0]} ${points[i][1]}L${p[0]} ${p[1]}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="${.12+.3*(i+1)/points.length}"/>`).join('')).join('')}
async function selectProof(i,j){const v=++proofRevision,p=items[i];activeView=()=>selectProof(i,0);selected=i;$('#roles').querySelectorAll('[data-role]').forEach(e=>e.classList.remove('selected'));$('#list').querySelectorAll('.card').forEach((e,k)=>e.classList.toggle('selected',k===i));$('#proof').textContent='Đang tổng hợp đường đi…';
 showRegionLegend(mode==='profile'?p.actions:p.label);$('#paths').replaceChildren();
 try{const proofs=mode==='profile'?p.evidence:p.evidence.flatMap(d=>d.participants);const traces=await loadTraces(proofs);if(v!==proofRevision)return;const hold=mode==='plays'&&p.label.includes('_HOLD_');const paths=hold?holdPaths(proofs,traces):tacticalPaths(proofs,traces,true);drawPaths(paths,mode==='profile'?data.side:p.side);
 $('#map-title').textContent=mode==='profile'?'Tuyến thường đi':p.title;$('#proof').innerHTML=mode==='profile'?`<div class="chain">${p.actions.map(a=>`<span class="region">${esc(pretty(a))}</span>`).join(' → ')}</div><p>Pattern Support ${pct(p.support)} · ${p.support_count}/${p.total_sequences} sequences</p>`:`<h3>${esc(p.title)}</h3><p>${pct(p.frequency)} · ${p.count}/${p.total} ${esc(p.side)}-round</p>${hold?holdPathNote(paths):''}`;
 }catch(e){if(v===proofRevision)$('#proof').textContent='Không tải được đường đi: '+e.message}
}
function updateMapTransform(){
 const z=+$('#zoom').value,limit=512*(z-1);
 panX=Math.max(-limit,Math.min(limit,panX));
 panY=Math.max(-limit,Math.min(limit,panY));
 $('#scene').setAttribute('transform',`translate(${512*(1-z)+panX} ${512*(1-z)+panY}) scale(${z})`);
 drawLocationLabels();
}
$('#zoom').oninput=updateMapTransform;
enableWheelZoom($('.map-wrap'),$('#zoom'));
enableDragPan($('.map-wrap'),(dx,dy)=>{
 const matrix=$('#map-svg').getScreenCTM().inverse();
 panX+=matrix.a*dx+matrix.c*dy;
 panY+=matrix.b*dx+matrix.d*dy;
 updateMapTransform();
});
$('#player-search').oninput=refreshPlayers;
$('#team').onchange=()=>{$('#player-search').value='';refreshPlayers();run();};
for(const id of ['map','side','weapon'])$('#'+id).onchange=()=>{refreshPlayers();run();};
$('#player').onchange=run;
$('#filters').onsubmit=e=>{e.preventDefault();run()};$('#more').onclick=()=>{shown+=8;renderList()};document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
try{catalog=await get('api/analysis/catalog');option($('#team'),[['all','Tất cả đội'],...catalog.teams.map(t=>[t.id,t.name])]);option($('#map'),catalog.maps.map(m=>[m,m.replace('de_','')]));$('#map').value='de_mirage';refreshPlayers();await run()}catch(e){$('#status').textContent='Không đọc được dữ liệu: '+e.message;$('#status').className='error'}
