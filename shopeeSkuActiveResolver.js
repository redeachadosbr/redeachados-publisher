// Resolver identidade da SKU pelo catálogo ATIVO da Shopee em tempo real.
// O cache pode conter IDs antigos (SELLER_DELETE). Não confundir SKU com itemId.
import {validItemId} from './catalog.js';

const same=(a,b)=>String(a??'').trim()===String(b??'').trim();
const usableStatus=s=>['NORMAL','UNLIST','REVIEWING'].includes(String(s||'').trim().toUpperCase());
const forbiddenStatus=s=>['SELLER_DELETE','SHOPEE_DELETE','DELETED','BANNED'].includes(String(s||'').trim().toUpperCase());
export function reconcileActiveSkuCandidates({sku,cached=[],pages=[]}={}){
 const query=String(sku||'').trim();
 if(!query)throw Error('Informe a SKU.');
 const previous=(Array.isArray(cached)?cached:[]).filter(x=>same(x.sku,query));
 const active=new Map();
 for(const page of pages){
  if(page?.status!=='NORMAL'||!Array.isArray(page.items))
   throw Error('Página Shopee sem comprovação de status NORMAL.');
  for(const item of page.items){
   if(!same(item.sku,query))continue;
   const id=validItemId(item.itemId);
   // A listagem filtrada NORMAL prevalece sobre status antigo do detalhe/base.
   active.set(id+':0',{
    itemId:id,modelId:'0',sku:query,title:String(item.title||'Produto Shopee'),
    imageUrl:String(item.imageUrl||''),status:'NORMAL',
    hasModel:Boolean(item.hasModel),price:item.price??null,stock:item.stock??null,
    updateTime:item.updateTime??null,
    source:'shopee_normal_listing_exact_sku'
   });
  }
 }
 const old=previous.filter(x=>forbiddenStatus(x.status));
 const allVerified=[...active.values()].sort((a,b)=>Number(b.itemId)-Number(a.itemId));
 const displaced=previous.filter(x=>!allVerified.some(y=>same(x.itemId,y.itemId)&&same(x.modelId||'0',y.modelId)));
 return {matches:allVerified,oldIds:[...new Set(old.map(x=>String(x.itemId)))],
  replacedIds:[...new Set(displaced.map(x=>String(x.itemId)))],
  fromCache:previous.length,activeCount:allVerified.length};
}
export async function scanLiveNormalSku({sku,cached=[],getPage,maxPages=20,onMatch}={}){
 if(typeof getPage!=='function')throw Error('Consulta ao vivo indisponível.');
 const pages=[];let offset=0,completed=false,detailsIncomplete=false;
 const seen=new Set();
 for(let index=0;index<maxPages;index++){
  if(seen.has(offset))throw Error('Paginação repetida: não foi possível confirmar o anúncio ativo.');
  seen.add(offset);
  const page=await getPage({status:'NORMAL',offset,pageSize:100});
  if(page?.status!=='NORMAL'||!Array.isArray(page?.items))
   throw Error('A Shopee não confirmou a lista de anúncios NORMAL.');
  pages.push(page);
  if(Array.isArray(page.warnings)&&page.warnings.length)detailsIncomplete=true;
  // Mesmo com a primeira correspondência, continuar lendo a lista completa:
  // duplicidade de SKU entre dois anúncios ativos exige seleção explícita.
  if(!page.hasNext){completed=true;break;}
  if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)
   throw Error('Paginação Shopee não avançou.');
  offset=page.nextOffset;
 }
 if(!completed)throw Error('Lista de anúncios ativos maior que o limite da pesquisa; use busca aprofundada. Nenhum anúncio antigo foi selecionado.');
 const result=reconcileActiveSkuCandidates({sku,cached,pages});
 if(detailsIncomplete&&!result.matches.length)
  throw Error('A Shopee não devolveu todos os detalhes das páginas NORMAL; não é seguro selecionar um anúncio antigo.');
 if(typeof onMatch==='function'&&result.matches.length)await onMatch(result.matches);
 return {...result,verified:true,pagesChecked:pages.length};
}
export function catalogCandidatesIfNoActive({cached=[],sku,live=[],normalScanComplete=false}={}){
 if(!normalScanComplete)throw Error('Não foi possível conferir os anúncios ativos; não reutilizar ID do cache.');
 const uniq=new Map();
 for(const x of live){
  if(!same(x.sku,sku)||!usableStatus(x.status)||String(x.status).toUpperCase()==='NORMAL')continue;
  const id=validItemId(x.itemId),modelId=String(x.modelId||'0');
  uniq.set(id+':'+modelId,{...x,itemId:id,modelId,source:'shopee_live_secondary'});
 }
 return [...uniq.values()];
}
