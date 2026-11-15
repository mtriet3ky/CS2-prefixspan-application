// Keep the existing select as the filter value and render media in the list.
export function createRosterPicker(select,mediaUrl,{showSelectedMedia=false}={}){
 const field=select.parentElement;
 const label=field.querySelector('label');
 const popup=document.createElement('div');
 const trigger=document.createElement('button');
 const value=document.createElement('span');
 trigger.id=`${select.id}-trigger`;
 trigger.type='button';
 trigger.className='roster-trigger';
 const selectedMedia=document.createElement('span');
 selectedMedia.className='roster-selected-media';
 trigger.append(selectedMedia,value);
 value.id=`${select.id}-value`;
 label.htmlFor=trigger.id;
 popup.id=`${select.id}-options`;
 popup.className='roster-options';
 popup.hidden=true;
 trigger.setAttribute('aria-controls',popup.id);
 trigger.setAttribute('aria-expanded','false');
 trigger.setAttribute('aria-labelledby',`${label.id} ${value.id}`);
 select.hidden=true;
 select.after(trigger,popup);

 function close(restoreFocus=false){
  popup.hidden=true;
  trigger.setAttribute('aria-expanded','false');
  if(restoreFocus)trigger.focus();
 }
 function media(option){
  const entry=mediaUrl(option.value);
  const items=Array.isArray(entry)?entry:[{url:entry,label:option.textContent}];
  return items.map(({url,label})=>{
   const photo=document.createElement('span');
   photo.className='roster-option-photo';
   photo.setAttribute('aria-hidden','true');
   photo.textContent=label.trim().slice(0,3).toUpperCase();
   if(url){
    const img=document.createElement('img');
    img.alt='';
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>img.remove(),{once:true});
    img.src=url;
    photo.append(img);
   }
   return photo;
  });
 }
 function render(){
  const rows=Array.from(select.options).filter(option=>!option.disabled).map(option=>{
   const row=document.createElement('button');
   const photos=document.createElement('span');
   const name=document.createElement('span');
   row.type='button';
   row.className='roster-option';
   if(option.selected)row.setAttribute('aria-current','true');
   photos.className='roster-option-media';
   photos.append(...media(option));
   name.textContent=option.textContent;
   row.append(photos,name);
   row.onclick=()=>{
    close(true);
    if(select.value===option.value)return;
    select.value=option.value;
    refresh();
    select.dispatchEvent(new Event('change',{bubbles:true}));
   };
   return row;
  });
  popup.replaceChildren(...rows);
 }
 function open(){
  render();
  popup.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  (popup.querySelector('[aria-current]')||popup.firstElementChild)?.focus();
 }
 function refresh(){
  const option=select.selectedOptions[0];
  value.textContent=option?.textContent||'–';
  selectedMedia.replaceChildren(...(showSelectedMedia&&option?media(option):[]));
  trigger.disabled=select.disabled||!select.options.length;
  if(!popup.hidden)close(field.contains(document.activeElement));
 }
 trigger.onclick=()=>popup.hidden?open():close();
 field.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!popup.hidden){event.preventDefault();close(true);return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  if(popup.hidden&&event.target===trigger){event.preventDefault();open();return;}
  if(popup.hidden||!popup.contains(event.target))return;
  event.preventDefault();
  if(event.key==='Home')popup.firstElementChild?.focus();
  else if(event.key==='End')popup.lastElementChild?.focus();
  else if(event.key==='ArrowDown')event.target.nextElementSibling?.focus();
  else event.target.previousElementSibling?.focus();
 });
 document.addEventListener('pointerdown',event=>{if(!field.contains(event.target))close();});
 field.addEventListener('focusout',event=>{if(!field.contains(event.relatedTarget))close();});
 refresh();
 return {refresh};
}
