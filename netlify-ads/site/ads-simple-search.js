/* Rede Achados BR Ads — busca acessível por SKU/nome no registro de alterações.
 * Substitui apenas o controle visual; #changeSku permanece como fonte de valor
 * para os handlers legados, exportação, backup e sincronização no Drive.
 */
(()=>{
'use strict';
const select=document.getElementById('changeSku');
if(!select||typeof readProducts!=='function')return;
const field=select.closest('.field');
if(!field)return;
const label=field.querySelector('label[for="changeSku"]');
if(label){label.textContent='Produto / SKU *';label.htmlFor='changeSkuSearch';}
const wrapper=document.createElement('div');
wrapper.className='simple-sku-picker';
wrapper.innerHTML=
 '<input type="search" class="simple-sku-search" id="changeSkuSearch" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="changeSkuResults" autocomplete="off" spellcheck="false" placeholder="Digite nome ou SKU para localizar...">'+
 '<button id="changeSkuClear" type="button" class="simple-sku-clear" aria-label="Limpar produto selecionado" title="Limpar busca">Limpar</button>'+
 '<div id="changeSkuResults" class="simple-sku-results" role="listbox" hidden></div>'+
 '<div class="simple-sku-hint" id="changeSkuSearchHint" role="status" aria-live="polite">Digite pelo menos 2 caracteres do nome ou SKU.</div>'+
 '<div class="simple-sku-chosen" id="changeSkuChosen" hidden></div>';
field.insertBefore(wrapper,select);
const input=document.getElementById('changeSkuSearch');
const results=document.getElementById('changeSkuResults');
const hint=document.getElementById('changeSkuSearchHint');
const chosen=document.getElementById('changeSkuChosen');
const clear=document.getElementById('changeSkuClear');
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
let matches=[],active=-1;
const close=()=>{results.hidden=true;input.setAttribute('aria-expanded','false');};
const productRows=()=>readProducts().map(p=>({sku:String(p.sku||''),name:String(p.name||'')})).filter(x=>x.sku);
const findBySku=sku=>productRows().find(p=>p.sku===sku);
function paintChosen(sku){
 const p=findBySku(sku);
 chosen.hidden=!p;
 if(p){chosen.textContent='✓ Produto selecionado: '+p.sku+' — '+p.name;hint.textContent='Pronto para registrar uma alteração neste produto.';}
 else if(!input.value.trim())hint.textContent='Digite pelo menos 2 caracteres do nome ou SKU.';
}
function choose(sku){
 const p=findBySku(sku);
 if(!p){select.value='';chosen.hidden=true;return;}
 select.value=sku;
 // Os handlers de salvamento existentes continuam lendo o #changeSku.
 select.dispatchEvent(new Event('change',{bubbles:true}));
 input.value=p.sku+' — '+p.name;
 paintChosen(sku);close();
}
function renderResults(){
 const q=normalize(input.value);
 if(q.length<2){matches=[];active=-1;hint.textContent='Digite pelo menos 2 caracteres do nome ou SKU.';close();return;}
 const rows=productRows();
 const scored=rows.filter(p=>normalize(p.sku).includes(q)||normalize(p.name).includes(q))
  .map(p=>({...p,score:normalize(p.sku)===q?0:normalize(p.sku).startsWith(q)?1:normalize(p.name).startsWith(q)?2:normalize(p.sku).includes(q)?3:4}))
  .sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name,'pt-BR'));
 matches=scored.slice(0,8);active=matches.length?0:-1;
 if(!matches.length){hint.textContent='Nenhum produto encontrado. Tente outra palavra ou parte da SKU.';results.innerHTML='';close();return;}
 const n=scored.length;
 hint.textContent=n>8?'Encontrados '+n+' produtos. Exibindo os 8 mais relevantes; refine sua busca.':n+' produto(s) encontrado(s). Selecione um resultado.';
 results.innerHTML=matches.map((p,i)=>
  '<button role="option" type="button" data-match="'+i+'" aria-selected="'+(i===active)+'">'+
  '<strong>'+esc(p.sku)+'</strong> · '+esc(p.name)+'</button>').join('');
 results.hidden=false;input.setAttribute('aria-expanded','true');
}
function markActive(){
 [...results.querySelectorAll('[data-match]')].forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));
 const activeEl=results.querySelector('[data-match="'+active+'"]');
 activeEl?.scrollIntoView({block:'nearest'});
}
input.addEventListener('input',()=>{
 select.value='';chosen.hidden=true;
 renderResults();
});
input.addEventListener('focus',()=>{if(!select.value&&input.value.trim().length>=2)renderResults();});
input.addEventListener('keydown',e=>{
 if(e.key==='Escape'){close();return;}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  if(results.hidden)renderResults();
  if(!matches.length)return;
  e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;markActive();
 }else if(e.key==='Enter'&&!results.hidden&&matches[active]){
  e.preventDefault();choose(matches[active].sku);
 }
});
results.addEventListener('click',e=>{
 const button=e.target.closest('[data-match]');
 if(!button||!results.contains(button))return;
 const p=matches[Number(button.dataset.match)];if(p)choose(p.sku);
});
clear.addEventListener('click',()=>{
 input.value='';select.value='';chosen.hidden=true;matches=[];close();
 hint.textContent='Digite pelo menos 2 caracteres do nome ou SKU.';
 input.focus();
});
document.addEventListener('click',e=>{if(!wrapper.contains(e.target))close()});
select.addEventListener('change',()=>{
 if(select.value){const p=findBySku(select.value);if(p){input.value=p.sku+' — '+p.name;paintChosen(p.sku);}}
 else if(!document.activeElement?.isSameNode(input)){input.value='';chosen.hidden=true;}
});
function syncSelection(){
 const sku=select.value,p=findBySku(sku);
 if(p){
  // Não interromper alguém que já está digitando outra pesquisa.
  if(document.activeElement!==input){input.value=p.sku+' — '+p.name;paintChosen(sku);}
 }else if(document.activeElement!==input){input.value='';chosen.hidden=true;}
}
if(typeof refreshChangeSelects==='function'){
 const oldRefresh=refreshChangeSelects;
 refreshChangeSelects=function(...args){const result=oldRefresh(...args);syncSelection();return result;};
}
syncSelection();
window.RedeAdsProductSearch={choose,refresh:syncSelection};
})();
