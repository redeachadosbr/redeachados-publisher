// Rascunhos de kits WeDrop isolados por shop_id. Somente chave privada no servidor.
import {normalizeKitLogistics} from './shopeeKitLogisticsDraft.js';
const TABLE='shopee_wedrop_kit_drafts';
const shop=id=>{const n=Number(id);if(!Number.isSafeInteger(n)||n<=0)throw Error('Loja inválida.');return n;};
function cfg(){
 const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!base.startsWith('https://')||!key)throw Error('Armazenamento de kits indisponível.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
 return {base,headers};
}
async function request(query,options={}){
 const c=cfg();
 const r=await fetch(c.base+'/rest/v1/'+TABLE+query,{
  method:options.method||'GET',
  headers:{...c.headers,...(options.prefer?{Prefer:options.prefer}:{})},
  ...(options.data?{body:JSON.stringify(options.data)}:{}),
  signal:AbortSignal.timeout(17000)
 });
 if(!r.ok)throw Error('Não foi possível salvar/consultar o rascunho (HTTP '+r.status+').');
 return r.status===204?[]:r.json();
}
async function latestActiveBatch(shopId){
 const rows=await request('?shop_id=eq.'+shop(shopId)+
  '&select=draft&order=updated_at.desc&limit=250');
 return rows.map(x=>String(x.draft?.importBatchId||'')).filter(Boolean).sort().at(-1)||'';
}
export async function saveKitDraft(shopId,{kit,creative,logistics,importBatchId}){
 const id=shop(shopId);
 if(!/^KIT-[A-Z0-9-]{4,115}$/.test(String(kit?.kitSku||'')))throw Error('Código de kit inválido.');
 const codes=kit.components?.map(x=>String(x.sku));
 if(!Array.isArray(codes)||codes.length<2||codes.length>3||new Set(codes).size!==codes.length)
  throw Error('Componentes inválidos.');
 const title=String(creative?.title||'').trim().slice(0,120);
 const description=String(creative?.description||'').trim().slice(0,2000);
 if(title.length<10||description.length<80)throw Error('Preencha o título e a descrição antes de salvar.');
 const previous=await loadKitDraft(id,kit.kitSku);
 const batchId=String(importBatchId||previous?.importBatchId||await latestActiveBatch(id)||'');
 if(previous?.optimizationFinalization?.status==='verified'||previous?.publication?.itemId||['publishing','uncertain'].includes(previous?.publication?.status))
  throw Error('Kit enviado à Shopee ou com publicação incerta; não regrave. Consulte o status primeiro.');
 const seoTitles=Array.isArray(creative?.seoTitles)?creative.seoTitles
  .filter(x=>typeof x==='string'&&x.trim().length>=10&&Array.from(x.trim()).length<=120)
  .map(x=>x.trim()).slice(0,3):[];
 const uniqueTitles=[...new Set(seoTitles)];
 const manualFacts=creative?.manualFacts&&typeof creative.manualFacts==='object'&&!Array.isArray(creative.manualFacts)
  ?Object.fromEntries(codes.filter(sku=>typeof creative.manualFacts[sku]==='string')
   .map(sku=>[sku,creative.manualFacts[sku].replace(/[\u0000-\u001f]/g,' ').trim().slice(0,1700)])):{};
 const savedLogistics=logistics===undefined?previous?.logistics||null:normalizeKitLogistics(logistics,kit);
 const fiscalBySku=Object.fromEntries(codes.map(sku=>{
  const stored=previous?.creative?.fiscalBySku?.[sku];
  const origin=String(stored?.origin||'').trim();
  return [sku,/^[0-8]$/.test(origin)?{origin,
   source:String(stored?.source||'informado-pelo-vendedor').slice(0,90),
   savedAt:String(stored?.savedAt||'').slice(0,40)}:null];
 }).filter(([,entry])=>entry));
 const draft={kit,importBatchId:batchId||null,logistics:savedLogistics,creative:{title,description,seoTitles:uniqueTitles.length===3?uniqueTitles:[],
  manualFacts,fiscalBySku,source:String(creative.source||'rascunho revisado').slice(0,90)},
  reviewed:false,shopeePublished:false,
  optimizationFinalization:previous?.optimizationFinalization||null,
  publication:previous?.publication||{status:'local_draft',itemId:null},
  optimization:previous?.optimization&&
    previous.creative?.title===title&&previous.creative?.description===description&&
    Number(previous.kit?.kitCost)===Number(kit.kitCost)&&
    Number(previous.kit?.quote?.grossPrice)===Number(kit.quote?.grossPrice)&&
    codes.join('|')===(previous.skus||[]).join('|')?previous.optimization:null};
 const rows=await request('?on_conflict=shop_id,kit_sku',{
  method:'POST',prefer:'resolution=merge-duplicates,return=representation',
  data:[{shop_id:id,kit_sku:kit.kitSku,component_skus:codes,draft,updated_at:new Date().toISOString()}]
 });
 return {saved:Boolean(rows[0]),kitSku:kit.kitSku,updatedAt:rows[0]?.updated_at||null};
}
function mayDeleteKitDraft(publication){
 return String(publication?.status||'local_draft')==='local_draft'&&!publication?.itemId;
}
export async function deleteKitDraft(shopId,kitSku){
 const id=shop(shopId),code=String(kitSku||'').trim();
 if(!/^KIT-[A-Z0-9-]{4,115}$/.test(code))throw Error('Código de kit inválido.');
 const existing=await loadKitDraft(id,code);
 if(!existing)return {deleted:false,notFound:true,kitSku:code};
 if(existing.optimizationFinalization?.status==='verified'||!mayDeleteKitDraft(existing.publication))
  throw Error('Este kit já foi enviado à Shopee ou tem publicação em andamento/incerta. Não é possível excluir.');
 // A condição no DELETE também impede apagar uma publicação que mude de status após a leitura.
 const rows=await request('?shop_id=eq.'+id+
  '&kit_sku=eq.'+encodeURIComponent(code)+
  '&draft->publication->>status=eq.local_draft'+
  '&draft->publication->>itemId=is.null',{
  method:'DELETE',prefer:'return=representation'
 });
 if(!Array.isArray(rows)||rows.length!==1)
  throw Error('Exclusão não confirmada. Atualize a lista e confira se o kit ainda está salvo.');
 return {deleted:true,kitSku:code,marketplaceUpdated:false};
}
export async function listKitDrafts(shopId){
 const rows=await request('?shop_id=eq.'+shop(shopId)+
  '&select=kit_sku,component_skus,draft,updated_at&order=updated_at.desc&limit=250');
 const all=rows.map(x=>({kitSku:x.kit_sku,skus:x.component_skus,
   title:String(x.draft?.creative?.title||''),quote:x.draft?.kit?.quote,
   kitCost:Number(x.draft?.kit?.kitCost)||null,
   reviewRequired:x.draft?.kit?.reviewRequired===true,
   images:(x.draft?.kit?.components||[]).slice(0,3)
     .map(p=>String(p.imageUrl||'')).filter(url=>/^https:\/\/wedrop-products-images\.nyc3\.cdn\.digitaloceanspaces\.com\//.test(url)),
   publication:x.draft?.publication?.status||'local_draft',
   itemId:x.draft?.optimizationFinalization?.itemId||x.draft?.publication?.itemId||null,
   importBatchId:String(x.draft?.importBatchId||''),
   optimization:x.draft?.optimization||null,
   optimizationFinalization:x.draft?.optimizationFinalization||null,
   deletable:mayDeleteKitDraft(x.draft?.publication)&&x.draft?.optimizationFinalization?.status!=='verified',
   updatedAt:x.updated_at}));
 // Lote mais recente por identificador cronológico, não por alteração de cartão antigo.
 const activeBatchId=all.map(x=>x.importBatchId).filter(Boolean).sort().at(-1)||'';
 const isFinished=x=>x.publication==='published'||x.optimizationFinalization?.status==='verified';
 const published=all.filter(isFinished);
 const drafts=all.filter(x=>!isFinished(x)&&(
  !activeBatchId||x.importBatchId===activeBatchId||
  ['publishing','uncertain','published_pending'].includes(x.publication)));
 return {drafts,published,activeBatchId:activeBatchId||null};
}
export async function loadKitDraft(shopId,kitSku){
 const id=shop(shopId),code=String(kitSku||'').trim();
 if(!/^KIT-[A-Z0-9-]{4,115}$/.test(code))throw Error('Código de kit inválido.');
 const rows=await request('?shop_id=eq.'+id+'&kit_sku=eq.'+
  encodeURIComponent(code)+'&select=kit_sku,component_skus,draft,updated_at&limit=1');
 const row=rows[0];
 if(!row)return null;
 return {kitSku:row.kit_sku,skus:row.component_skus,
  creative:row.draft?.creative||{},kit:row.draft?.kit||null,
  importBatchId:String(row.draft?.importBatchId||''),
  logistics:row.draft?.logistics||null,
  publication:row.draft?.publication||{status:'local_draft',itemId:null},optimization:row.draft?.optimization||null,
  optimizationFinalization:row.draft?.optimizationFinalization||null,updatedAt:row.updated_at};
}

export async function saveKitDraftManualFacts(shopId,kitSku,input){
 const id=shop(shopId),current=await loadKitDraft(id,kitSku);
 if(!current?.kit)throw Error('Rascunho ainda não salvo no servidor.');
 if(current.optimizationFinalization?.status==='verified'||current.publication?.itemId||current.publication?.status!=='local_draft')
  throw Error('Anúncio publicado ou pendente: fichas bloqueadas para alterações.');
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Dados por SKU inválidos.');
 const allowed=new Set(current.skus.map(String));
 if(Object.keys(input).some(sku=>!allowed.has(sku)))throw Error('SKU não pertence ao kit.');
 const manualFacts=Object.fromEntries(current.skus.map(String)
  .filter(sku=>typeof input[sku]==='string')
  .map(sku=>[sku,String(input[sku]).replace(/[\\u0000-\\u001f]/g,' ').slice(0,1700)]));
 const draft={kit:current.kit,importBatchId:current.importBatchId||null,
  creative:{...current.creative,manualFacts},logistics:current.logistics,
  reviewed:false,shopeePublished:false,publication:current.publication,
  optimization:current.optimization||null};
 const rows=await request('?shop_id=eq.'+id+'&kit_sku=eq.'+encodeURIComponent(kitSku)+
  '&draft->publication->>status=eq.local_draft',{
  method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'});
 if(!Array.isArray(rows)||rows.length!==1)throw Error('Não foi possível confirmar a gravação das fichas por SKU.');
 return {saved:true,kitSku,manualFacts};
}
export async function saveKitDraftCopy(shopId,kitSku,input){
 const id=shop(shopId),current=await loadKitDraft(id,kitSku);
 if(!current?.kit)throw Error('Rascunho ainda não salvo no servidor.');
 if(current.optimizationFinalization?.status==='verified'||current.publication?.itemId||String(current.publication?.status||'local_draft')!=='local_draft')
  throw Error('Kit publicado ou pendente: edição comercial bloqueada.');
 const title=String(input?.title||'').trim().slice(0,120);
 const description=String(input?.description||'').trim().slice(0,2000);
 if(title.length<10||description.length<80)throw Error('Título e descrição precisam estar completos para sincronizar.');
 const codes=current.skus.map(String);
 if(codes.some(code=>(title+'\n'+description).toUpperCase().includes(code.toUpperCase())))
  throw Error('Remova os códigos SKU dos textos comerciais antes de sincronizar.');
 const seoTitles=Array.isArray(input?.seoTitles)?input.seoTitles
  .filter(x=>typeof x==='string'&&x.length>=10&&Array.from(x).length<=120).slice(0,3):[];
 const draft={kit:current.kit,importBatchId:current.importBatchId||null,
  creative:{...current.creative,title,description,seoTitles},
  logistics:current.logistics,reviewed:false,shopeePublished:false,
  publication:current.publication,optimization:null};
 const rows=await request('?shop_id=eq.'+id+'&kit_sku=eq.'+encodeURIComponent(kitSku)+
  '&draft->publication->>status=eq.local_draft',{
  method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'});
 if(!Array.isArray(rows)||rows.length!==1)throw Error('Não foi possível confirmar gravação dos textos.');
 return {saved:true,kitSku};
}
export async function saveKitDraftLogistics(shopId,kitSku,input){
 const id=shop(shopId);
 const current=await loadKitDraft(id,kitSku);
 if(!current?.kit)throw Error('Salve primeiro o rascunho do kit para sincronizar a logística.');
 const status=String(current.publication?.status||'local_draft');
 if(current.optimizationFinalization?.status==='verified'||current.publication?.itemId||status!=='local_draft')
  throw Error('Kit enviado ou com publicação pendente: os campos de logística não podem mais ser alterados.');
 const logistics=normalizeKitLogistics(input,current.kit);
 if(!logistics)throw Error('Dados de logística inválidos.');
 const draft={kit:current.kit,importBatchId:current.importBatchId||null,creative:current.creative,logistics,
  reviewed:false,shopeePublished:false,publication:current.publication,optimization:current.optimization||null};
 const rows=await request('?shop_id=eq.'+id+'&kit_sku=eq.'+encodeURIComponent(kitSku)+
   '&draft->publication->>status=eq.local_draft',{
   method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'
 });
 if(!Array.isArray(rows)||rows.length!==1)
  throw Error('Não foi possível confirmar a gravação da logística do rascunho.');
 return {saved:true,kitSku,logistics};
}
export async function recordKitPublication(shopId,kitSku,publication){
 const current=await loadKitDraft(shopId,kitSku);
 if(!current)throw Error('Salve o rascunho do kit antes de enviar à Shopee.');
 if(current.publication?.itemId&&current.publication.status==='published')
  throw Error('Este kit já está publicado na Shopee. Não criar outro anúncio.');
 const draft={kit:current.kit,importBatchId:current.importBatchId||null,creative:current.creative,logistics:current.logistics||null,reviewed:true,
  shopeePublished:publication.status==='published',optimization:current.optimization||null,
  publication:{status:publication.status,itemId:publication.itemId||null,
   updatedAt:new Date().toISOString(),message:String(publication.message||'').slice(0,400)}};
 await request('?shop_id=eq.'+shop(shopId)+'&kit_sku=eq.'+encodeURIComponent(kitSku),{
  method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'
 });
 return draft.publication;
}

// Persistência fiscal LOCAL do kit, isolada por SKU e revisão explícita.
// Não modifica o anúncio nem preenche NCM/CEST/CFOP a partir de outra SKU.
export async function saveKitFiscalOrigin(shopId,kitSku,origins){
 const id=shop(shopId),current=await loadKitDraft(id,kitSku);
 if(!current?.kit)throw Error('Rascunho do kit não encontrado.');
 if(current.optimizationFinalization?.status==='verified'||current.publication?.itemId||
    current.publication?.status!=='local_draft')throw Error('Kit já enviado ou finalizado.');
 if(!origins||typeof origins!=='object'||Array.isArray(origins))
  throw Error('Origem fiscal por SKU inválida.');
 const codes=current.skus.map(String);
 const invalid=Object.keys(origins).filter(x=>!codes.includes(x)||!/^([0-8])$/.test(String(origins[x])));
 if(invalid.length)throw Error('Código de origem deve corresponder à SKU e à opção fiscal da Shopee.');
 const prior=current.creative?.fiscalBySku||{};
 const fiscalBySku={...prior,...Object.fromEntries(Object.entries(origins).map(([sku,origin])=>
  [sku,{origin:String(origin),source:'informado-pelo-vendedor',savedAt:new Date().toISOString()}]))};
 // Um PATCH com controle de versão impede sobrescrever título, imagens e
 // modificações simultâneas no mesmo rascunho.
 const draft={kit:current.kit,importBatchId:current.importBatchId||null,
  creative:{...current.creative,fiscalBySku},logistics:current.logistics||null,
  reviewed:false,shopeePublished:false,publication:current.publication,
  optimization:current.optimization||null,
  optimizationFinalization:current.optimizationFinalization||null};
 const rows=await request('?shop_id=eq.'+id+'&kit_sku=eq.'+encodeURIComponent(kitSku)+
  '&updated_at=eq.'+encodeURIComponent(current.updatedAt)+
  '&draft->publication->>status=eq.local_draft',{
  method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'});
 if(rows.length!==1)throw Error('O kit mudou durante a edição. Atualize antes de gravar a origem.');
 return {saved:true,kitSku,fiscalBySku,marketplaceUpdated:false};
}
export async function recordKitOptimization(shopId,kitSku,link){
 const id=shop(shopId);
 // Autosave de Informações por SKU e fiscal podem atualizar apenas updated_at
 // durante a preparação. Retomar com o estado mais recente, sem perder campos.
 for(let attempt=0;attempt<3;attempt++){
  const current=await loadKitDraft(id,kitSku);
  if(!current?.kit)throw Error('Kit não encontrado.');
  if(current.optimizationFinalization?.status==='verified'||
    current.publication?.status!=='local_draft'||current.publication?.itemId)
   throw Error('Kit publicado ou com execução incerta; não modificar o vínculo.');
  if(link?.kitSku!==kitSku||current.creative?.title!==link.title||
   current.creative?.description!==link.description||
   Number(current.kit?.kitCost)!==Number(link.kitCost)||
   Number(current.kit?.quote?.grossPrice)!==Number(link.grossPrice)||
   current.skus.map(String).join('|')!==link.componentSkus?.map(String).join('|'))
   throw Error('A composição, preço ou texto comercial mudou. Recalcule a preparação deste kit.');
  if(current.optimization?.itemId&&
     String(current.optimization.itemId)!==String(link.itemId))
   throw Error('O kit já foi vinculado a outro anúncio; reconfirme o Item ID.');
  const draft={kit:current.kit,importBatchId:current.importBatchId||null,
   creative:current.creative,logistics:current.logistics||null,
   reviewed:false,shopeePublished:false,publication:current.publication,
   optimizationFinalization:current.optimizationFinalization||null,
   optimization:link};
  const result=await request('?shop_id=eq.'+id+'&kit_sku=eq.'+encodeURIComponent(kitSku)+
   '&updated_at=eq.'+encodeURIComponent(current.updatedAt),{
    method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'});
  if(Array.isArray(result)&&result.length===1)
   return {saved:true,optimization:link,concurrentRetries:attempt};
 }
 throw Error('O rascunho está sendo salvo por outra etapa. Tente novamente sem apagar imagens.');
}

/**
 * Arquiva um anúncio otimizado EXISTENTE sem forjar criação de Kit Formal.
 * Chamado somente depois da auditoria raiz 9/9 feita pelo servidor.
 * Não publica nada na Shopee e mantém arquivos/histórico do rascunho.
 */
export async function recordKitOptimizationFinalization(shopId,kitSku,{sku,itemId,modelId='0',audit,job}={}){
 const id=shop(shopId),code=String(kitSku||'').trim();
 const current=await loadKitDraft(id,code);
 if(!current?.kit||!current.optimization)throw Error('O kit não possui anúncio otimizado vinculado.');
 const link=current.optimization;
 if(String(link.kitSku)!==code||String(link.sku)!==String(sku)||
    String(link.itemId)!==String(itemId)||String(link.modelId||'0')!==String(modelId||'0'))
  throw Error('Vínculo Shopee divergente. A finalização foi bloqueada.');
 if(current.optimizationFinalization?.status==='verified'){
  if(String(current.optimizationFinalization.itemId)===String(itemId))
   return {finalized:true,alreadyFinalized:true,finalization:current.optimizationFinalization};
  throw Error('O kit já foi finalizado com outro Item ID.');
 }
 if(audit?.complete!==true||audit?.sku!==sku||String(audit.itemId)!==String(itemId)||
    (audit.pending||[]).length||!Array.isArray(audit.stages)||audit.stages.length!==9||
    audit.stages.some(x=>!['confirmed','not_applicable'].includes(x.status)))
  throw Error('Auditoria raiz da Shopee não confirmou todas as etapas. Rascunho preservado.');
 if(job?.state!=='verified'||String(job.item_id)!==String(itemId)||
    String(job.model_id||'0')!==String(modelId||'0')||String(job.sku)!==String(sku))
  throw Error('A execução do anúncio ainda não tem confirmação registrada pela Shopee.');
 const finalization={status:'verified',kind:'existing_listing_optimization',
  kitSku:code,sku:String(sku),itemId:String(itemId),modelId:String(modelId||'0'),
  verifiedAt:new Date().toISOString(),source:'shopee_root_audit',
  confirmedStages:audit.stages.map(x=>({id:x.id,status:x.status})),
  executionRunId:String(job.run_id||'')};
 const draft={kit:current.kit,importBatchId:current.importBatchId||null,
  creative:current.creative,logistics:current.logistics||null,
  reviewed:true,shopeePublished:false,
  publication:current.publication,optimization:current.optimization,
  optimizationFinalization:finalization};
 const rows=await request('?shop_id=eq.'+id+'&kit_sku=eq.'+encodeURIComponent(code)+
  '&updated_at=eq.'+encodeURIComponent(current.updatedAt)+
  '&draft->optimization->>itemId=eq.'+encodeURIComponent(String(itemId)),{
    method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'});
 if(rows.length!==1)throw Error('O rascunho mudou durante a finalização. Atualize e confira o status.');
 return {finalized:true,alreadyFinalized:false,finalization};
}
