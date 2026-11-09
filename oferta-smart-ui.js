'use strict';
/* Private health panel and approved evidence workflow for Oferta Blumenau. */
(function(){
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const official=u=>{try{const x=new URL(String(u));return x.protocol==='https:'?x.href:'#'}catch{return '#'}};
const modes={encarte_digital:'Encarte digital',selecao_de_loja:'Seleção de filial',
canais_whatsapp:'WhatsApp / envio autorizado',consulta_oficial:'Consulta oficial',
revista_por_filial:'Revista por filial',oferta_por_filial:'Encarte por loja'};
let root=null;
function style(){
if(document.getElementById('obIntelStyle'))return;
const s=document.createElement('style');s.id='obIntelStyle';
s.textContent='.ob-intel{background:linear-gradient(140deg,#f7fbff,#f6fff8);border:1px solid #d9e5e6;border-radius:23px;margin-bottom:20px;padding:18px;color:#17323a;box-shadow:0 13px 35px #0d344314}'+
'.ob-intel h2{font-size:1.24rem;margin:0 0 6px;color:#15343c}.ob-intel p{margin:4px 0 13px;font-size:.88rem;color:#45646b}'+
'.ob-intel-tools{display:flex;flex-wrap:wrap;gap:8px;margin:9px 0 14px}.ob-intel button{border:1px solid #b2cbd0;border-radius:12px;cursor:pointer;font-weight:700;font-size:.8rem;padding:9px 13px;background:white;color:#104d57}'+
'.ob-intel button.primary{background:#086c62;color:#fff;border-color:#086c62}.ob-intel button:disabled{cursor:wait;opacity:.6}'+
'.ob-intel-networks{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:10px}.ob-intel-item{border-radius:15px;background:white;padding:13px;border:1px solid #e0e9eb;display:flex;flex-direction:column;gap:5px}'+
'.ob-intel-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.ob-intel-name{font-weight:800;font-size:.92rem}.ob-intel-stats{font-size:.8rem;color:#45606a;line-height:1.6}'+
'.ob-intel-status{font-size:.69rem;background:#eef4f4;color:#31515a;border-radius:7px;padding:4px 7px;white-space:nowrap}.ob-intel-status.warn{background:#fff4e6;color:#77521c}'+
'.ob-intel-actions{display:flex;gap:10px;align-items:center;margin-top:auto;padding-top:6px}.ob-intel-actions a{font-size:.82rem;color:#00695b;text-decoration:underline}'+
'.ob-intel-notice{margin:8px 0;padding:9px 12px;border-radius:10px;background:#eff6f5;font-size:.8rem;white-space:pre-wrap}'+
'.ob-intel pre{white-space:pre-wrap;word-break:break-word;max-height:250px;overflow:auto;background:#fff;border:1px solid #e0e7e9;border-radius:12px;padding:10px;font-size:.78rem}'+
'@media(max-width:600px){.ob-intel{padding:12px;border-radius:18px}.ob-intel-tools button{flex:1 1 135px}}';
document.head.appendChild(s);
}
function note(s){const el=document.getElementById('obIntelNote');if(el)el.textContent=s;}
function init(){
const management=document.querySelector('[data-page="gestao"]');
if(!management||document.getElementById('obIntel'))return;
style();root=document.createElement('section');root.id='obIntel';root.className='ob-intel';
root.innerHTML='<h2>🧠 Inteligência de Ofertas · 8 redes</h2>'+
'<p>Preços só entram no catálogo com produto, embalagem, filial, origem e validade conferidos. Um site acessível não garante preços legíveis.</p>'+
'<div class="ob-intel-tools"><button type="button" class="primary" data-ob-intel-refresh>Ver cobertura real</button>'+
'<button type="button" data-ob-intel-sync>Verificar fontes agora</button>'+
'<button type="button" data-ob-intel-ocr>Reprocessar encartes</button></div>'+
'<div id="obIntelNote" class="ob-intel-notice">Informe sua chave administrativa em Gestão e selecione “Ver cobertura real”.</div>'+
'<div id="obIntelNetworks" class="ob-intel-networks"></div>'+
'<div class="ob-intel-notice">📲 Recebeu ofertas no WhatsApp? Salve a foto ou PDF, selecione filial e datas na Gestão e importe. O reconhecimento gera sugestões para revisão, não inventa preços.</div>'+
'<details><summary style="cursor:pointer;font-weight:700">Texto reconhecido do último arquivo importado</summary>'+
'<pre id="obOCRPreview">Nenhum arquivo lido nesta sessão.</pre></details>';
management.prepend(root);
root.addEventListener('click',async e=>{
const refresh=e.target.closest('[data-ob-intel-refresh]');
const scan=e.target.closest('[data-ob-intel-sync]');
const ocr=e.target.closest('[data-ob-intel-ocr]');
const upload=e.target.closest('[data-ob-intel-upload]');
if(refresh){await coverage();return;}
if(scan){const b=document.getElementById('syncBtn');if(b){b.click();note('Verificação iniciada pelo painel Gestão. Consulte o resultado abaixo.')}return;}
if(ocr){const b=document.getElementById('scanBtn');if(b){b.click();note('Reprocessamento iniciado. Nenhum preço será aprovado sem revisão.')}return;}
if(upload){
const network=upload.dataset.obIntelUpload;
const store=typeof stores!=='undefined'&&Array.isArray(stores)?stores.find(s=>s.rede===network):null;
const dropdown=document.getElementById('adminStore');
if(store&&dropdown){
dropdown.value=store.id;
if(typeof setAdminSource==='function')setAdminSource();
else {const source=document.getElementById('adminSource');if(source)source.value=store.url_ofertas||'';}
}
const f=document.getElementById('brochureFile');
if(f){note('Filial selecionada. Confirme as datas de vigência e clique no botão de leitura depois de escolher a foto/PDF.');f.scrollIntoView({behavior:'smooth',block:'center'});f.focus();f.click();}
return;
}
});
const key=document.getElementById('adminToken');
if(key)key.addEventListener('change',()=>{if(key.value.trim())coverage()});
}
async function coverage(){
const key=document.getElementById('adminToken')?.value.trim()||'';
if(!key){note('Insira sua chave administrativa em Gestão antes de consultar a cobertura.');return;}
const b=root?.querySelector('[data-ob-intel-refresh]');if(b)b.disabled=true;
note('Consultando status real por rede…');
try{
const r=await fetch('/api/admin/coverage',{method:'GET',credentials:'same-origin',headers:{'X-Admin-Token':key,'Accept':'application/json'},cache:'no-store'});
const data=await r.json().catch(()=>({detail:'Resposta inesperada do servidor'}));
if(!r.ok)throw Error(String(data.detail||'Consulta indisponível')+' (HTTP '+r.status+')');
if(!data.ok||!Array.isArray(data.networks))throw Error('Resposta inválida de cobertura');
note('Em '+data.as_of+': '+data.total_active+' ofertas válidas. Sem números estimados. Erros de acesso não são registrados como produtos.');
const list=document.getElementById('obIntelNetworks');
list.innerHTML=data.networks.map(n=>{
const blocked=n.source_status==='bloqueado',urls=(n.official_urls||[]).map(official).filter(u=>u!=='#');
const status=blocked?'Acesso bloqueado':n.source_status==='acessivel'?'Fonte acessível':n.source_status==='erro_fonte'?'Erro na fonte':'Não verificada';
const details=n.last_detail?'<div class="ob-intel-stats">Última tentativa: '+esc(n.last_detail)+'</div>':'';
return '<div class="ob-intel-item"><div class="ob-intel-head"><span class="ob-intel-name">'+esc(n.network)+'</span>'+
'<span class="ob-intel-status '+(blocked?'warn':'')+'">'+esc(status)+'</span></div>'+
'<div class="ob-intel-stats"><b>'+Number(n.approved_active||0)+'</b> preços válidos · '+Number(n.pending_review||0)+' aguardando revisão</div>'+
'<div class="ob-intel-stats">'+Number(n.stores||0)+' filiais · '+esc(modes[n.mode]||'Fonte oficial')+'</div>'+
details+'<div class="ob-intel-actions"><a href="'+esc(urls[0]||'#')+'" target="_blank" rel="noopener noreferrer">Fonte oficial</a>'+
'<button type="button" data-ob-intel-upload="'+esc(n.network)+'">Enviar encarte</button></div></div>';
}).join('');
}catch(e){note('Não foi possível confirmar a cobertura: '+String(e.message||e));}
finally{if(b)b.disabled=false;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();