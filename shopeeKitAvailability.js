// Fonte explícita de disponibilidade WeDrop. Ausência/ambiguidade = BLOQUEADO.
// Não confundir "Estado do fornecedor" (SP, SC, PR...) com estoque.
// Importação separada, sem alterar estoque na Shopee.
import crypto from 'node:crypto';
import {parseCsv} from './wedropCsv.js';
import {readWeDropSyncState} from './wedropCosts.js';
export const KIT_STOCK_MAX_AGE_MS=24*60*60*1000;
const stockCache=new Map();
export function clearKitStockCache(shopId){stockCache.delete(Number(shopId));}
const clean=x=>String(x??'').trim();
const norm=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[\s_-]+/g,' ').trim();
const VALID_HEADERS=['disponibilidade','disponibilidade de estoque','status estoque',
 'status de estoque','situacao do estoque','estoque disponivel','estoque'];
export function normalizeSupplierAvailability(value){
 const s=norm(value);
 if(s==='disponivel')return 'DISPONIVEL';
 if(s==='indisponivel')return 'INDISPONIVEL';
 return null; // NÃO deduzir de booleano, estoque 0, estado do fornecedor, "ativo".
}
export function parseWeDropAvailabilityCsv(csv){
 const {headers,rows}=parseCsv(csv),normalized=headers.map(norm);
 const skuCols=normalized.flatMap((v,i)=>v==='sku'?[i]:[]);
 const statusCols=normalized.flatMap((v,i)=>VALID_HEADERS.includes(v)?[i]:[]);
 if(skuCols.length!==1||statusCols.length!==1||skuCols[0]===statusCols[0])
  throw Error('O arquivo precisa conter SKU e uma coluna de Disponibilidade da WeDrop (DISPONÍVEL/INDISPONÍVEL). Exportações com somente custo/estado do fornecedor não comprovam estoque.');
 const [skuIndex,statusIndex]=[skuCols[0],statusCols[0]];
 const map=new Map(),invalid=[];
 for(const [index,row] of rows.entries()){
  const sku=clean(row[skuIndex]),availability=normalizeSupplierAvailability(row[statusIndex]);
  if(!sku||sku.length>140||!availability){
   invalid.push('linha '+(index+2)+' / SKU '+sku.slice(0,40));continue;
  }
  if(map.has(sku)&&map.get(sku)!==availability)
   throw Error('SKU '+sku+' repetida com status de estoque conflitante.');
  map.set(sku,availability);
 }
 if(invalid.length)throw Error('Disponibilidade desconhecida em '+invalid.length+
  ' linha(s): '+invalid.slice(0,5).join(', ')+'. Corrija antes de importar; nenhum estoque foi alterado.');
 if(!map.size)throw Error('Nenhum status DISPONÍVEL ou INDISPONÍVEL encontrado.');
 const items=[...map].map(([sku,availability])=>({sku,availability}));
 return {items,total:items.length,
  availableCount:items.filter(x=>x.availability==='DISPONIVEL').length,
  unavailableCount:items.filter(x=>x.availability==='INDISPONIVEL').length,
  hash:crypto.createHash('sha256').update(csv,'utf8').digest('hex')};
}
function config(){
 const url=clean(process.env.SUPABASE_URL).replace(/\/$/,'');
 const key=clean(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
 if(!/^https:\/\//.test(url)||!key)throw Error('Supabase WeDrop indisponível.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ/.test(key))headers.Authorization='Bearer '+key;
 return {url,headers};
}
async function db(table,query='',{method='GET',data,prefer}={}){
 const cfg=config();
 const response=await fetch(cfg.url+'/rest/v1/'+table+query,{
  method,headers:{...cfg.headers,...(prefer?{Prefer:prefer}:{})},
  ...(data!==undefined?{body:JSON.stringify(data)}:{}),
  signal:AbortSignal.timeout(17000)
 });
 if(!response.ok)throw Error('Consulta de disponibilidade WeDrop falhou: HTTP '+response.status);
 return method==='GET'?response.json():null;
}
async function allRows(table,shopId,columns,extra=''){
 const rows=[];
 for(let offset=0;offset<=30000;offset+=1000){
  const batch=await db(table,'?shop_id=eq.'+Number(shopId)+
   '&select='+columns+'&order=supplier_sku.asc&limit=1000&offset='+offset+extra);
  rows.push(...batch);
  if(batch.length<1000)return rows;
 }
 throw Error('Estoque WeDrop excede limite de leitura suportado.');
}
export async function readKitStockSnapshot(shopId){
 const id=Number(shopId);
 const saved=stockCache.get(id);
 if(saved&&Date.now()-saved.checkedAt<30000&&
  (!saved.snapshot.lastSuccessAt||
   Date.now()-new Date(saved.snapshot.lastSuccessAt).getTime()<=KIT_STOCK_MAX_AGE_MS))
  return saved.snapshot;
 const [state,catalogSync,entries]=await Promise.all([
  db('shopee_wedrop_availability_imports','?shop_id=eq.'+id+
   '&select=last_success_at,source_name,batch_hash,available_count,unavailable_count,imported_count&limit=1'),
  readWeDropSyncState(id),
  allRows('shopee_wedrop_availability',id,'supplier_sku,availability,checked_at,batch_hash')
 ]);
 const importState=state[0]||null;
 const last=new Date(importState?.last_success_at||0).getTime();
 const catalogLast=new Date(catalogSync?.last_success_at||0).getTime();
 const now=Date.now();
 const recent=Number.isFinite(last)&&last>0&&now>=last&&now-last<=KIT_STOCK_MAX_AGE_MS;
 const catalogRecent=Number.isFinite(catalogLast)&&catalogLast>0&&now>=catalogLast&&
  now-catalogLast<=KIT_STOCK_MAX_AGE_MS;
 const newerThanCatalog=recent&&catalogLast>0&&last>=catalogLast-60000;
 const ready=Boolean(recent&&catalogRecent&&newerThanCatalog);
 const map=new Map(entries.filter(x=>importState&&x.batch_hash===importState.batch_hash)
  .map(x=>[String(x.supplier_sku),String(x.availability)]));
 const reason=!catalogRecent?'Catálogo WeDrop desatualizado: importe novamente o catálogo oficial na página WeDrop.':
  !recent?'Disponibilidade não importada nas últimas 24 horas. Atualize o arquivo da WeDrop com SKU e Disponibilidade.':
  !newerThanCatalog?'O status de estoque é anterior à última importação do catálogo. Atualize a disponibilidade após importar os produtos.':
  'Disponibilidade WeDrop importada; apenas SKUs DISPONÍVEIS podem compor kits.';
 const snapshot={ready,reason,map,lastSuccessAt:importState?.last_success_at||null,
  catalogRecent,stockRecent:recent,stockAfterCatalog:newerThanCatalog,
  catalogLastImportedAt:catalogSync?.last_success_at||null,
  importedCount:importState?.imported_count||0,
  availableCount:importState?.available_count||0,
  unavailableCount:importState?.unavailable_count||0,
  expiresAt:ready?new Date(Math.min(last,catalogLast)+KIT_STOCK_MAX_AGE_MS).toISOString():null};
 stockCache.set(id,{checkedAt:Date.now(),snapshot});return snapshot;
}
export function assertKitStockSnapshot(stock){
 if(!stock?.ready)throw Error('ATUALIZE A IMPORTAÇÃO WEDROP ANTES DE GERAR KITS. '+(stock?.reason||'Disponibilidade não verificada.'));
}
export function assertKitComponentsAvailable(components,stock){
 assertKitStockSnapshot(stock);
 for(const p of components){
  if(p.stockStatus!=='DISPONIVEL')
   throw Error('Kit bloqueado: SKU '+p.sku+' '+(p.stockStatus==='INDISPONIVEL'?
    'INDISPONÍVEL na WeDrop.':'sem disponibilidade confirmada na importação atual.')+
    ' Atualize a importação de estoque e escolha outra SKU.');
 }
}
export async function saveKitStockImport(shopId,csv){
 const parsed=parseWeDropAvailabilityCsv(csv),id=Number(shopId);
 // Validar a existência das SKUs dentro do catálogo de fornecedor da própria loja.
 const catalog=await allRows('shopee_wedrop_products',id,'supplier_sku');
 const known=new Set(catalog.map(x=>String(x.supplier_sku)));
 const unknown=parsed.items.filter(x=>!known.has(x.sku));
 if(unknown.length)throw Error('Há '+unknown.length+' SKU(s) não encontradas no catálogo WeDrop da loja: '+
  unknown.slice(0,5).map(x=>x.sku).join(', ')+'. Importe primeiro o catálogo completo de produtos.');
 // Não confirmar uma importação parcial por engano como se fosse inventário completo:
 // linhas não presentes no arquivo ficam SEM STATUS e não podem ser sugeridas.
 const at=new Date().toISOString();
 for(let i=0;i<parsed.items.length;i+=150){
  await db('shopee_wedrop_availability','?on_conflict=shop_id,supplier_sku',{
   method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
   data:parsed.items.slice(i,i+150).map(x=>({
    shop_id:id,supplier_sku:x.sku,availability:x.availability,
    checked_at:at,batch_hash:parsed.hash,source_name:'importacao-wedrop-status.csv'
   }))
  });
 }
 // Selo do lote publicado SOMENTE ao fim de todos os lotes.
 await db('shopee_wedrop_availability_imports','?on_conflict=shop_id',{
  method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
  data:[{shop_id:id,last_success_at:at,source_name:'importacao-wedrop-status.csv',
   batch_hash:parsed.hash,available_count:parsed.availableCount,
   unavailable_count:parsed.unavailableCount,imported_count:parsed.total}]
 });
 clearKitStockCache(id);
 return {imported:parsed.total,available:parsed.availableCount,
  unavailable:parsed.unavailableCount,notCovered:Math.max(0,catalog.length-parsed.total),
  lastSuccessAt:at,message:'Importação validada. Produtos ausentes do arquivo NÃO recebem disponibilidade presumida. A Shopee não foi alterada.'};
}
