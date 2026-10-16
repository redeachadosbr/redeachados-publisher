// Varredura de Ads no Financeiro Shopee — sem atribuição fictícia a pedido.
// Fonte de vendas: pedidos COMPLETED com repasse Payment real.
// Fonte Ads: get_product_campaign_daily_performance e item_id_list oficial
// de get_product_level_campaign_setting_info (campanha simples de um item).
const money=v=>Math.round((Number(v)||0)*100)/100;
const amount=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):0;
const dateInBrazil=epoch=>{
 const v=new Date(epoch*1000);
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(v);
};
// Período de Ads por dia civil no Brasil; janela aproximada do recorte de pedidos.
// A atribuição Shopee pode ocorrer até 7 dias após o clique, não é join por order_sn.
export function financeAdsDates(window){
 if(!Number.isFinite(window?.from)||!Number.isFinite(window?.to))
  throw Error('Período financeiro inválido para comparar Ads.');
 return {start:dateInBrazil(window.from),end:dateInBrazil(window.to)};
}
export function matchFinanceAds(finance,ads){
 const campaigns=Array.isArray(ads?.campaigns)?ads.campaigns:[];
 const products=Array.isArray(finance?.catalogProducts)?finance.catalogProducts:[];
 const financialSku=Array.isArray(finance?.skuSummary)?finance.skuSummary:[];
 const skuByItem=new Map();
 for(const p of products){
  const item=String(p.itemId||'');
  const sku=String(p.sku||'').trim();
  if(!item||!sku)continue;
  if(!skuByItem.has(item))skuByItem.set(item,new Set());
  skuByItem.get(item).add(sku);
 }
 const sold=new Map(financialSku.map(row=>[String(row.sku),row]));
 const entries=new Map();
 let totalSpend=0,convertedSpend=0,spendWithoutConversion=0,
     spendUnassigned=0,allocatedSpend=0;
 const review=[];
 for(const c of campaigns){
  const spent=money(amount(c.expense));
  const conversions=amount(c.directOrders);
  const ids=Array.isArray(c.itemIdList)?[...new Set(c.itemIdList.map(String)
    .filter(x=>/^[1-9]\d*$/.test(x)))]:[];
  const campaignId=String(c.campaignId||'');
  totalSpend=money(totalSpend+spent);
  if(!spent)continue;
  if(conversions===0){
    spendWithoutConversion=money(spendWithoutConversion+spent);
    review.push({campaignId,expense:spent,directOrders:0,
      situation:'Sem venda direta atribuída no Ads — despesa da loja, não da venda por SKU'});
    continue;
  }
  convertedSpend=money(convertedSpend+spent);
  const skus=ids.length===1?skuByItem.get(ids[0]):null;
  if(ids.length!==1||!skus||skus.size!==1){
    spendUnassigned=money(spendUnassigned+spent);
    review.push({campaignId,expense:spent,directOrders:conversions,
      situation:'Campanha com vários produtos, variações, ou sem item ID confirmado; sem rateio arbitrário'});
    continue;
  }
  const sku=[...skus][0];
  const sale=sold.get(sku);
  if(!sale){
    spendUnassigned=money(spendUnassigned+spent);
    review.push({campaignId,sku,expense:spent,directOrders:conversions,
      situation:'Venda atribuída ao Ads, mas não existe venda concluída conciliada desse SKU no recorte de pedidos'});
    continue;
  }
  const x=entries.get(sku)||{sku,itemId:ids[0],expense:0,directOrders:0,campaignIds:[]};
  x.expense=money(x.expense+spent);
  x.directOrders+=conversions;
  x.campaignIds.push(campaignId);
  entries.set(sku,x);
  allocatedSpend=money(allocatedSpend+spent);
 }
 const skuCosts=[...entries.values()].map(x=>{
  const sale=sold.get(x.sku);
  return {...x,afterAds:money(sale.balanceBeforeAds-x.expense),
    baseBalance:money(sale.balanceBeforeAds),
    marginAfterAds:sale.payout>0?Math.round((sale.balanceBeforeAds-x.expense)/sale.payout*10000)/100:null,
    status:'resultado operacional parcial (não lucro líquido final)'};
 });
 return {status:'verified_campaign_period',
  reconciliation:'by_item_period_not_by_order',
  spendTotal:money(totalSpend),spendWithDirectConversions:money(convertedSpend),
  spendWithoutDirectConversions:money(spendWithoutConversion),
  spendUnassigned:money(spendUnassigned),spendAllocatedToSoldSku:money(allocatedSpend),
  campaignCount:campaigns.length,
  skuCosts,
  review,
  limitations:[
   'Gasto de campanha no período é comparado com vendas concluídas e repasses do SKU; não há relação individual com order_sn. Não chamar esse rateio de atribuição por pedido.',
   'Somente campanhas de produto retornadas pela API Ads V2. Campanhas GMV Max de loja, Ads de loja e fontes externas podem ficar fora.',
   'A venda atribuída pela Shopee Ads pode ser contabilizada em até 7 dias após o clique. Datas por dia civil dos Ads diferem da janela móvel dos pedidos.',
   'Gastos de campanhas sem conversão não são descontados de uma venda específica, mas permanecem nas despesas do período da loja.',
   'O resultado após Ads não inclui tributos e demais despesas externas; não é lucro líquido final.'
  ]
 };
}
