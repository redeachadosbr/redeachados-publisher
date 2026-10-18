// Automação WeDrop da loja Shopee. Sem credenciais de terceiros persistidas aqui.
import crypto from 'node:crypto';
import {prepareAutomaticWeDropImport,MAX_CSV_CHARS} from './wedropCsv.js';
import {
  readWeDropCosts,saveWeDropCosts,compareIncomingCosts,
  saveWeDropSyncState,saveWeDropProducts
} from './wedropCosts.js';

export function supplierFeedConfig(env=process.env){
  const raw=String(env.WEDROP_CATALOG_FEED_URL||'').trim();
  const allowed=String(env.WEDROP_CATALOG_FEED_HOST||'').trim().toLowerCase();
  const shop=Number(env.WEDROP_CATALOG_SHOP_ID||0);
  if(!raw)return {configured:false,reason:'Cadastre um endereço de feed autorizado pela WeDrop para verificar mudanças automaticamente.'};
  if(!allowed||!Number.isSafeInteger(shop)||shop<=0)
    return {configured:false,reason:'Informe WEDROP_CATALOG_FEED_HOST e WEDROP_CATALOG_SHOP_ID no Render.'};
  let url;
  try{url=new URL(raw);}catch{throw Error('URL do feed WeDrop inválida.');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||
     url.hostname.toLowerCase()!==allowed||url.port)
    throw Error('Feed só pode usar HTTPS e o domínio exato autorizado, sem login na URL nem redirecionamentos.');
  return {configured:true,url:url.toString(),host:allowed,shopId:shop,
    intervalMinutes:Math.max(60,Math.min(1440,Number(env.WEDROP_CATALOG_REFRESH_MINUTES)||360))};
}
export function supplierCsvHash(csv){return crypto.createHash('sha256').update(csv,'utf8').digest('hex');}
export function changedSupplierCosts(incoming,existing){
  const old=new Map(existing.map(x=>[String(x.supplier_sku),Number(x.unit_cost)]));
  return incoming.filter(x=>!old.has(x.sku)||old.get(x.sku)!==x.unitCost);
}
export async function importSupplierAutomatically(shopId,csv,{sourceKind='upload',sourceName='catalogo.csv'}={}){
  const prepared=prepareAutomaticWeDropImport(csv);
  const compared=await compareIncomingCosts(shopId,prepared.costs);
  // Se todos os IDs são EAN ou NCM, não confundir custo com outro produto.
  if(compared.matchedCount===0)
    throw Error('Nenhum SKU do catálogo WeDrop corresponde à Shopee. Sincronize os SKUs e confira a planilha antes de importar.');
  const hash=supplierCsvHash(csv);
  const old=await readWeDropCosts(shopId);
  const changes=changedSupplierCosts(prepared.costs,old);
  let saved={saved:0,totalReceived:0,updatedExisting:0,preservedExisting:0};
  if(changes.length)saved=await saveWeDropCosts(shopId,changes,{
    overwrite:true,sourceFile:sourceName
  });
  const productFactsSaved=await saveWeDropProducts(shopId,prepared.products,{sourceFile:sourceName,sourceHash:hash});
  await saveWeDropSyncState(shopId,{
    sourceKind,sourceName,sourceHash:hash,
    importedSkus:prepared.uniqueSkus,changedSkus:changes.length,
    matchedSkus:compared.matchedCount
  });
  return {
    fileName:sourceName,sourceKind,sourceHash:hash,
    sourceRows:prepared.totalRows,uniqueCosts:prepared.uniqueSkus,
    changedCosts:changes.length,newCosts:changes.filter(x=>!old.some(y=>y.supplier_sku===x.sku)).length,
    unchangedCosts:prepared.uniqueSkus-changes.length,
    matchingSupplierSkus:compared.matchedCount,
    supplierSkusWithoutShopeeMatch:compared.unmatchedCount,
    layout:prepared.layout,productFactsSaved,
    ...saved,
    message:'Custos sincronizados no Supabase Shopee. Nenhum preço, estoque ou promoção da Shopee foi modificado.'
  };
}
async function readBoundedCsv(response){
  const n=Number(response.headers.get('content-length')||0);
  if(n>MAX_CSV_CHARS)throw Error('Feed maior que o limite de 4 MB.');
  if(!response.body)throw Error('Feed retornou arquivo vazio.');
  const reader=response.body.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let content='',length=0;
  while(true){
    const {value,done}=await reader.read();
    if(done)break;
    length+=value.length;
    if(length>MAX_CSV_CHARS){await reader.cancel();throw Error('Feed WeDrop excedeu limite de 4 MB.');}
    content+=decoder.decode(value,{stream:true});
  }
  content+=decoder.decode();
  if(!content)throw Error('Feed WeDrop não retornou conteúdo.');
  return content;
}
export async function fetchSupplierCatalogCsv(feed,{fetchImpl=fetch}={}){
  if(!feed.configured)throw Error(feed.reason||'Feed WeDrop indisponível.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),45000);
  try{
    const headers={Accept:'text/csv,text/plain'};
    // Token de servidor configurado somente quando o fornecedor autoriza.
    const token=String(process.env.WEDROP_CATALOG_FEED_TOKEN||'').trim();
    if(token)headers.Authorization='Bearer '+token;
    const response=await fetchImpl(feed.url,{
      method:'GET',redirect:'error',headers,signal:controller.signal
    });
    if(!response.ok)throw Error('Feed WeDrop respondeu HTTP '+response.status+'.');
    return await readBoundedCsv(response);
  }finally{clearTimeout(timeout);}
}
let running=false,periodicTimer=null;
export function createWeDropAutoScheduler({log=console.log}={}){
  async function check(){
    if(running)return {running:true};
    const feed=supplierFeedConfig();
    if(!feed.configured)return {configured:false,reason:feed.reason};
    running=true;
    try{
      const csv=await fetchSupplierCatalogCsv(feed);
      // Re-read product metadata even when prices/file hash did not change;
      // earlier imports stored only costs and may need metadata backfill.
      const result=await importSupplierAutomatically(feed.shopId,csv,{
        sourceKind:'feed',sourceName:'wedrop-feed.csv'
      });
      log('[WeDrop] Feed importado: '+result.changedCosts+' custos novos ou alterados.');
      return {configured:true,...result};
    }catch(e){
      log('[WeDrop] Falha na sincronização automática: '+String(e.message||e).slice(0,180));
      return {configured:true,error:String(e.message||e).slice(0,250)};
    }finally{running=false;}
  }
  function start(){
    const feed=supplierFeedConfig();
    if(!feed.configured)return {configured:false,reason:feed.reason};
    if(periodicTimer)return {configured:true,started:true};
    periodicTimer=setInterval(()=>{void check();},feed.intervalMinutes*60000);
    periodicTimer.unref?.();
    // Consulta inicial sem bloquear deploy. O serviço pode dormir no Render Free.
    void check();
    return {configured:true,started:true,intervalMinutes:feed.intervalMinutes};
  }
  return {start,check,get running(){return running;}};
}

