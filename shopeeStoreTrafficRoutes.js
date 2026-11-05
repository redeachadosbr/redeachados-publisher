// Rotas do diagnóstico da loja. Não fazem mutações nos anúncios da Shopee.
import {parseStoreTrafficReport,summarizeStoreTraffic,diagnoseStoreTraffic,
 readStoreTrafficSnapshots,saveStoreTrafficSnapshot} from './shopeeStoreTraffic.js';

export function registerShopeeStoreTrafficRoutes(app,{
 mustLogin,requireWeDropAdmin,getValidAuth,verifiedSameOrigin,
 readPerformanceSnapshot,readCatalogCache,rankOrganicTop
}){
 app.get('/api/shopee/store-traffic',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   const {auth}=await getValidAuth(req);
   let snapshots=[],performance=null,catalog=[],storageWarning='';
   try{snapshots=await readStoreTrafficSnapshots(auth.shopId);}
   catch(error){storageWarning=String(error.message||error).slice(0,220);}
   try{performance=await readPerformanceSnapshot(auth.shopId);}
   catch(error){storageWarning+=(storageWarning?' | ':'')+'Performance: '+String(error.message||error).slice(0,120);}
   try{catalog=(await readCatalogCache(auth.shopId))?.items||[];}catch{/* Apenas miniaturas */}
   const byId=new Map(catalog.filter(x=>x.itemId).map(x=>[String(x.itemId),x]));
   const bySku=new Map(catalog.filter(x=>x.sku).map(x=>[String(x.sku).trim().toLowerCase(),x]));
   const decorate=row=>{
    const c=byId.get(String(row.itemId||''))||bySku.get(String(row.sku||'').trim().toLowerCase());
    return {...row,itemId:String(row.itemId||c?.itemId||''),
     sku:String(row.sku||c?.sku||''),title:String(row.title||c?.title||'').slice(0,200),
     imageUrl:String(c?.imageUrl||'')};
   };
   let traffic=null;
   if(snapshots.length){
    const snapshot=snapshots[0],summary=summarizeStoreTraffic(snapshot.records||[]);
    const sourceProducts=(snapshot.records||[]).filter(r=>r.sku||r.itemId)
     .sort((a,b)=>Number(b.sales||0)-Number(a.sales||0)||Number(b.clicks||0)-Number(a.clicks||0))
     .slice(0,150).map(decorate);
    const history=snapshots.slice(0,8).map(s=>({
     periodStart:s.period_start,periodEnd:s.period_end,importedAt:s.imported_at,
     total:summarizeStoreTraffic(s.records||[]).total
    }));
    traffic={periodStart:snapshot.period_start,periodEnd:snapshot.period_end,
     importedAt:snapshot.imported_at,fileName:snapshot.file_name,rowCount:snapshot.row_count,
     scope:snapshot.metadata?.scope||'shop_sources',...summary,
     diagnostics:diagnoseStoreTraffic(summary.sources),sourceProducts,history,
     attribution:'Fontes dos cards do produto, conforme relatório da Shopee; não necessariamente todos os acessos da loja.'};
   }
   const perfProducts=performance?.records?.length?
    rankOrganicTop(performance.records,{sort:'combined',limit:100}).map(r=>decorate({
     sku:r.sku,itemId:r.itemId,title:r.title,impressions:r.impressions,
     clicks:r.clicks,orders:r.orders,sales:null,cartVisitors:r.cartVisitors,
     cartUnits:r.cartUnits,cartPending:r.cartPending,cartAbandonmentRate:r.cartAbandonmentRate
    })):[];
   res.json({ok:true,readOnly:true,shopId:auth.shopId,traffic,
    performance:{available:Boolean(performance?.records?.length),
     period:performance?{start:performance.period_start,end:performance.period_end}:null,
     rowCount:performance?.row_count||0,products:perfProducts,
     attribution:'Performance por SKU exportada separadamente. NÃO atribuída a uma fonte específica.'},
    catalogCount:catalog.length,storageWarning,
    caveat:'Cliques vindos do Carrinho de Compras não medem carrinhos abandonados. Visualizações get_item_extra_info não separam orgânico ou Ads.'});
  }catch(error){res.status(503).json({ok:false,
   error:'Falha no diagnóstico da loja: '+String(error.message||error).slice(0,250)});}
 });
 app.post('/api/shopee/store-traffic/import',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
  try{
   const {auth}=await getValidAuth(req);
   const {fileName,base64,periodStart,periodEnd,sheetName}=req.body||{};
   if(typeof base64!=='string'||base64.length>5_400_000||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw Error('Arquivo inválido ou maior que 4 MB.');
   const file=Buffer.from(base64,'base64');
   if(file.length>4_000_000)throw Error('Arquivo excede 4 MB.');
   const report=parseStoreTrafficReport(file,{fileName,periodStart,periodEnd,sheetName});
   const saved=await saveStoreTrafficSnapshot(auth.shopId,report);
   res.json({ok:true,imported:true,rowCount:saved.row_count,scope:saved.metadata?.scope,
    period:{start:saved.period_start,end:saved.period_end},importedAt:saved.imported_at});
  }catch(error){
   res.status(422).json({ok:false,error:'Relatório não importado: '+
    String(error.message||error).slice(0,320),availableSheets:error.availableSheets||null});
  }
 });
}
