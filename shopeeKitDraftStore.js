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
export async function saveKitDraft(shopId,{kit,creative,logistics}){
 const id=shop(shopId);
 if(!/^KIT-[A-Z0-9-]{4,115}$/.test(String(kit?.kitSku||'')))throw Error('Código de kit inválido.');
 const codes=kit.components?.map(x=>String(x.sku));
 if(!Array.isArray(codes)||codes.length<2||codes.length>3||new Set(codes).size!==codes.length)
  throw Error('Componentes inválidos.');
 const title=String(creative?.title||'').trim().slice(0,120);
 const description=String(creative?.description||'').trim().slice(0,2000);
 if(title.length<10||description.length<80)throw Error('Preencha o título e a descrição antes de salvar.');
 const previous=await loadKitDraft(id,kit.kitSku);
 if(previous?.publication?.itemId||['publishing','uncertain'].includes(previous?.publication?.status))
  throw Error('Kit enviado à Shopee ou com publicação incerta; não regrave. Consulte o status primeiro.');
 const seoTitles=Array.isArray(creative?.seoTitles)?creative.seoTitles
  .filter(x=>typeof x==='string'&&x.trim().length>=10&&Array.from(x.trim()).length<=120)
  .map(x=>x.trim()).slice(0,3):[];
 const uniqueTitles=[...new Set(seoTitles)];
 const manualFacts=creative?.manualFacts&&typeof creative.manualFacts==='object'&&!Array.isArray(creative.manualFacts)
  ?Object.fromEntries(codes.filter(sku=>typeof creative.manualFacts[sku]==='string')
   .map(sku=>[sku,creative.manualFacts[sku].replace(/[\u0000-\u001f]/g,' ').trim().slice(0,1700)])):{};
 const savedLogistics=logistics===undefined?previous?.logistics||null:normalizeKitLogistics(logistics,kit);
 const draft={kit,logistics:savedLogistics,creative:{title,description,seoTitles:uniqueTitles.length===3?uniqueTitles:[],
  manualFacts,source:String(creative.source||'rascunho revisado').slice(0,90)},
  reviewed:false,shopeePublished:false,
  publication:previous?.publication||{status:'local_draft',itemId:null}};
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
 if(!mayDeleteKitDraft(existing.publication))
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
  '&select=kit_sku,component_skus,draft,updated_at&order=updated_at.desc&limit=30');
 return rows.map(x=>({kitSku:x.kit_sku,skus:x.component_skus,
  title:String(x.draft?.creative?.title||''),quote:x.draft?.kit?.quote,
  kitCost:Number(x.draft?.kit?.kitCost)||null,
  reviewRequired:x.draft?.kit?.reviewRequired===true,
  images:(x.draft?.kit?.components||[]).slice(0,3)
    .map(p=>String(p.imageUrl||'')).filter(url=>/^https:\/\/wedrop-products-images\.nyc3\.cdn\.digitaloceanspaces\.com\//.test(url)),
  publication:x.draft?.publication?.status||'local_draft',
  deletable:mayDeleteKitDraft(x.draft?.publication),
  updatedAt:x.updated_at}));
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
  logistics:row.draft?.logistics||null,
  publication:row.draft?.publication||{status:'local_draft',itemId:null},updatedAt:row.updated_at};
}

export async function saveKitDraftLogistics(shopId,kitSku,input){
 const id=shop(shopId);
 const current=await loadKitDraft(id,kitSku);
 if(!current?.kit)throw Error('Salve primeiro o rascunho do kit para sincronizar a logística.');
 const status=String(current.publication?.status||'local_draft');
 if(current.publication?.itemId||status!=='local_draft')
  throw Error('Kit enviado ou com publicação pendente: os campos de logística não podem mais ser alterados.');
 const logistics=normalizeKitLogistics(input,current.kit);
 if(!logistics)throw Error('Dados de logística inválidos.');
 const draft={kit:current.kit,creative:current.creative,logistics,
  reviewed:false,shopeePublished:false,publication:current.publication};
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
 const draft={kit:current.kit,creative:current.creative,logistics:current.logistics||null,reviewed:true,
  shopeePublished:publication.status==='published',
  publication:{status:publication.status,itemId:publication.itemId||null,
   updatedAt:new Date().toISOString(),message:String(publication.message||'').slice(0,400)}};
 await request('?shop_id=eq.'+shop(shopId)+'&kit_sku=eq.'+encodeURIComponent(kitSku),{
  method:'PATCH',data:{draft,updated_at:new Date().toISOString()},prefer:'return=representation'
 });
 return draft.publication;
}
