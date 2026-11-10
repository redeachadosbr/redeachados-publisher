// Conciliação opcional de XLSX financeiro por SKU, sem dupla subtração de Ads.
(()=>{
'use strict';
const normalize=x=>String(x??'').trim().toUpperCase();
function summarize(sku,start,end){
 const meta=typeof supplierOrderMeta!=='undefined'?supplierOrderMeta:null;
 if(!meta)return {complete:false,beforeAds:null,reason:'Nenhuma planilha de pedidos importada.'};
 if(meta.financialBasis!=='before_ads')return {complete:false,beforeAds:null,
  reason:meta.financialBasis==='ambiguous'?'A planilha usa lucro líquido sem indicar se Ads já foram descontados.':
   'A planilha não possui coluna explícita de lucro antes de Ads.'};
 if(!Array.isArray(meta.financialOrders))return {complete:false,beforeAds:null,
  reason:'Reimporte o XLSX para habilitar a conciliação por pedido.'};
 const covered=meta.firstDate<=start&&meta.lastDate>=end&&Number(meta.withoutDate||0)===0;
 const rows=meta.financialOrders.filter(x=>Array.isArray(x.skus)&&x.skus.map(normalize).includes(normalize(sku))&&x.date>=start&&x.date<=end);
 if(!rows.length)return {complete:false,beforeAds:null,reason:'Nenhum pedido dessa SKU foi conciliado no arquivo.'};
 let cents=0,missing=0;
 for(const row of rows){
  // Nunca ratear automaticamente o lucro de um pedido que contenha vários SKUs.
  if(row.skus.length!==1||row.conflict||row.status!=='delivered'||
    row.beforeAds===null||row.beforeAds===undefined||!Number.isFinite(Number(row.beforeAds))){
   missing++;continue;
  }
  cents+=Math.round(Number(row.beforeAds)*100);
 }
 if(!covered||missing>0)return {complete:false,beforeAds:null,knownBeforeAds:cents/100,
  orders:rows.length,ready:rows.length-missing,
  reason:!covered?'As datas do XLSX não cobrem todo o período acumulado.':
   'Há pedidos pendentes, cancelados, multissku ou valores financeiros ausentes.'};
 return {complete:true,beforeAds:cents/100,orders:rows.length,ready:rows.length,
  basis:'profit_before_ads_explicit',source:meta.sourceName||'planilha importada'};
}
window.RedeAdsFinanceXlsx={summarize};
})();