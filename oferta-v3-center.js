'use strict';
/* Oferta Blumenau V3: customer-facing separated fiscal observations + owner review. */
(()=>{
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const date=s=>{try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(s))}catch{return String(s||'')}};
const input=(name,label,type='text',required=true,help='')=>'<label class="ob-v3-field"><span>'+html(label)+'</span><input name="'+html(name)+'" type="'+html(type)+'" '+(required?'required':'')+' '+(type==='number'?'step="0.01" min="0.01"':'')+' '+(help?'placeholder="'+html(help)+'"':'')+'></label>';
let pending=[];
function status(note,error=false){const n=document.getElementById('obV3Status');if(n){n.textContent=note;n.className='ob-v3-status'+(error?' error':'')}}
function storeSelect(name){const list=typeof stores!=='undefined'&&Array.isArray(stores)?stores:[];return '<label class="ob-v3-field"><span>Filial exata</span><select required name="'+html(name)+'"><option value="">Escolha a filial</option>'+list.map(s=>'<option value="'+html(s.id)+'">'+html(s.rede+' · '+(s.filial||s.nome||s.bairro||s.id))+'</option>').join('')+'</select></label>'}
function panel(){
 const mgmt=document.querySelector('[data-page="gestao"]');if(!mgmt||document.getElementById('obV3Admin'))return;
 const root=document.createElement('section');root.id='obV3Admin';root.className='ob-intel ob-v3-admin';
 root.innerHTML='<h2>🛡️ Central de auditoria de preços</h2>'+
  '<p>Dois tipos de evidência, sem misturar preço fiscal observado com promoção de encarte. Apenas o administrador pode registrar e revisar documentos.</p>'+
  '<div class="ob-v3-toolbar"><button type="button" id="obV3Summary" class="primary">Atualizar indicadores</button>'+
  '<button type="button" id="obV3Pending">Ver fila de conferência</button></div>'+
  '<div id="obV3Status" class="ob-v3-status">Informe a chave de Gestão e consulte os indicadores.</div>'+
  '<div id="obV3SummaryCards" class="ob-v3-metrics"></div>'+
  '<details class="ob-v3-details"><summary>📄 Registrar preço de documento fiscal</summary>'+
  '<form id="obV3FiscalForm" class="ob-v3-form"><p>Exige código EAN, CNPJ da filial, data, fonte autorizada e identificador único da observação. O lançamento nunca é aprovado automaticamente.</p>'+
   storeSelect('store_id')+input('product_name','Produto exato','text',true,'Ex.: Café Melitta 500g')+
   input('barcode','Código EAN/GTIN','text',true,'8–14 dígitos')+
   input('store_cnpj','CNPJ da filial (14 dígitos)','text',true)+
   input('observed_price','Preço observado (R$)','number',true)+
   input('observed_at','Data e hora da observação','datetime-local',true)+
   input('brand','Marca','text',false)+input('package','Embalagem','text',false)+
   input('source_name','Base autorizada de origem','text',true,'Ex.: serviço autorizado')+
   input('source_record_id','ID único do documento/fato','text',true)+
   input('source_url','URL HTTPS da evidência','url',true)+
  '<label class="ob-v3-field"><span>Natureza da origem</span><select name="source_kind"><option value="fiscal">Fiscal</option><option value="official_feed">Feed oficial autorizado</option><option value="receipt">Comprovante fiscal autorizado</option></select></label>'+
  '<button class="ob-v3-primary" type="submit">Registrar para revisão</button></form></details>'+
  '<details class="ob-v3-details"><summary>🏷️ Registrar evidência de encarte</summary>'+
  '<form id="obV3LeafletForm" class="ob-v3-form"><p>Preço promocional com filial e validade. O preço anterior é opcional e só deve ser informado se estiver expresso na fonte.</p>'+
   storeSelect('store_id')+input('product_name','Nome e tipo do produto','text',true)+
   input('network','Rede supermercadista','text',true)+
   input('promotional_price','Preço do encarte (R$)','number',true)+
   input('prior_price','Preço anterior comprovado (R$)','number',false)+
   input('valid_from','Início da promoção','date',true)+input('valid_until','Fim da promoção','date',true)+
   input('brand','Marca','text',false)+input('package','Embalagem','text',false)+
   input('source_url','URL do canal oficial','url',true)+
   input('document_url','URL da imagem ou PDF original','url',false)+
   input('image_url','URL da foto individual do produto','url',false)+
  '<button class="ob-v3-primary" type="submit">Enviar à auditoria</button></form></details>'+
  '<div id="obV3PendingList" class="ob-v3-pending-list"></div>';
 mgmt.appendChild(root);
 document.getElementById('obV3Summary').addEventListener('click',loadSummary);
 document.getElementById('obV3Pending').addEventListener('click',loadPending);
 document.getElementById('obV3FiscalForm').addEventListener('submit',e=>submit(e,'submit_fiscal'));
 document.getElementById('obV3LeafletForm').addEventListener('submit',e=>submit(e,'submit_leaflet'));
 root.addEventListener('click',async e=>{
  const b=e.target.closest('[data-ob-v3-review]');if(!b)return;
  const id=Number(b.dataset.obV3Id),kind=b.dataset.obV3Kind,decision=b.dataset.obV3Review;
  const note=b.closest('.ob-v3-review')?.querySelector('textarea')?.value.trim()||'';
  if(note.length<12){status('Descreva como conferiu origem, CNPJ/filial, produto e valor (mínimo de 12 caracteres).',true);return}
  if(!['verified','rejected'].includes(decision))return;
  b.disabled=true;
  try{await adminApi({action:'review',kind,id,decision,note,reviewer:'Administrador Oferta Blumenau'});status('Decisão registrada. Apenas dados verificados podem ser exibidos.');await loadPending();await loadSummary();}
  catch(err){status(err.message,true)}finally{b.disabled=false}
 });
}
function adminKey(){return document.getElementById('adminToken')?.value.trim()||''}
async function adminApi(payload){
 const key=adminKey();if(!key)throw Error('Informe sua chave administrativa no painel Gestão.');
 const r=await fetch('/api/admin/provenance',{method:'POST',credentials:'same-origin',
  headers:{'Content-Type':'application/json','X-Admin-Token':key},body:JSON.stringify(payload),cache:'no-store'});
 const data=await r.json().catch(()=>({detail:'Resposta não reconhecida'}));
 if(!r.ok)throw Error(String(data.detail||data.error||'Erro HTTP '+r.status));
 if(data.ok!==true)throw Error(String(data.error||'Falha da integração'));return data;
}
async function loadSummary(){
 try{
 const d=await adminApi({action:'summary'});
 document.getElementById('obV3SummaryCards').innerHTML=[
  ['Preços fiscais verificados',d.fiscal_verified],
  ['Preços fiscais pendentes',d.fiscal_pending],
  ['Encartes verificados nesta base',d.leaflets_verified],
  ['Encartes pendentes',d.leaflets_pending],
  ['Revisões pendentes',d.reviews_pending]
 ].map(([label,val])=>'<div class="ob-v3-metric"><b>'+Number(val||0)+'</b><small>'+html(label)+'</small></div>').join('');
 status('Dados de auditoria consultados em '+date(d.as_of)+'. Esta base não substitui o catálogo legado.');
 }catch(e){status(e.message,true)}
}
async function loadPending(){
 try{
 const d=await adminApi({action:'pending'});
 pending=[...(d.fiscal||[]).map(x=>({...x,_kind:'fiscal'})),...(d.leaflets||[]).map(x=>({...x,_kind:'leaflet'}))];
 const dest=document.getElementById('obV3PendingList');
 dest.innerHTML='<h3>Revisão de comprovantes ('+pending.length+')</h3>'+
 (!pending.length?'<p>Nenhuma revisão pendente nesta camada.</p>':
 pending.map(v=>{
  const fiscal=v._kind==='fiscal';
  return '<article class="ob-v3-review"><header><strong>'+html(v.product_name)+'</strong><span>'+html(fiscal?'Preço fiscal observado':'Encarte promocional')+'</span></header>'+
  '<p>'+html(v.store_id)+' · '+html(money(fiscal?v.observed_price:v.promotional_price))+
  ' · '+html(fiscal?date(v.observed_at):(v.valid_from+' até '+v.valid_until))+'</p>'+
  '<p>Origem: '+html(v.source_name||v.network||'')+'</p>'+
  '<a href="'+html(safeRef(v.source_url))+'" target="_blank" rel="noopener noreferrer">Abrir evidência ↗</a>'+
  '<textarea placeholder="Informe como validou nome, CNPJ/filial, peso, validade e preço" aria-label="Justificativa da revisão"></textarea>'+
  '<div><button type="button" data-ob-v3-review="verified" data-ob-v3-id="'+Number(v.id)+'" data-ob-v3-kind="'+html(v._kind)+'">✓ Aprovar comprovante</button>'+
  '<button type="button" data-ob-v3-review="rejected" data-ob-v3-id="'+Number(v.id)+'" data-ob-v3-kind="'+html(v._kind)+'">Rejeitar</button></div></article>';
 }).join(''));
 status('Fila de evidências atualizada. Confirme cada documento antes de aprovar.');
 }catch(e){status(e.message,true)}
}
function safeRef(u){try{const x=new URL(String(u));return x.protocol==='https:'?x.href:'#'}catch{return '#'}}
async function submit(e,action){
 e.preventDefault();const f=e.target,btn=f.querySelector('button[type=submit]');btn.disabled=true;
 const data={action};new FormData(f).forEach((val,key)=>{if(String(val).trim()!=='')data[key]=String(val).trim()});
 if(action==='submit_fiscal'&&data.observed_at){data.observed_at=new Date(data.observed_at).toISOString()}
 if(action==='submit_leaflet'){
  const s=typeof stores!=='undefined'&&Array.isArray(stores)?stores.find(x=>x.id===data.store_id):null;
  if(s)data.network=s.rede;
 }
 try{const r=await adminApi(data);status('Documento registrado como pendente (protocolo '+r.id+'). Revisão obrigatória antes de publicar.');f.reset();await loadSummary();await loadPending();}
 catch(err){status('Não foi possível importar: '+err.message,true)}
 finally{btn.disabled=false}
}
function init(){panel();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();