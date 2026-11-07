
/**
 * Razão gerencial de pedidos pagos. Não confundir gasto Ads de um período
 * com prova de conversão de um pedido; rateio é apenas simulação contábil.
 */
const cents=value=>Math.round(Number(value)*100);
const money=value=>Math.round(value*100)/100;
const valid=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const lowMargins=5;
export function isFinancePaid(status,payTime){
 const code=String(status||'').toUpperCase();
 if(['CANCELLED','UNPAID','IN_CANCEL'].includes(code))return false;
 return Number(payTime)>0||['READY_TO_SHIP','PROCESSED','RETRY_SHIP',
  'SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','TO_RETURN'].includes(code);
}
/** Distribuição exata de centavos: soma alocada == gasto global, sem duplicações. */
export function allocateAdsBySale(orders,spent){
 if(!valid(spent)||Number(spent)<0||!orders.length)return null;
 if(orders.some(x=>!valid(x.grossProductSales)||Number(x.grossProductSales)<=0))
   return null;
 const gross=orders.reduce((sum,x)=>sum+cents(x.grossProductSales),0);
 if(!gross)return null;
 const totalCents=cents(spent);
 const pieces=orders.map((order,index)=>{
  const numerator=totalCents*cents(order.grossProductSales);
  const base=Math.floor(numerator/gross);
  return {index,base,remainder:numerator%gross,orderSn:order.orderSn};
 });
 const missing=totalCents-pieces.reduce((sum,x)=>sum+x.base,0);
 pieces.sort((a,b)=>b.remainder-a.remainder||
  String(a.orderSn).localeCompare(String(b.orderSn)));
 for(let i=0;i<missing;i++)pieces[i].base++;
 return pieces.sort((a,b)=>a.index-b.index).map(x=>money(x.base/100));
}
export function buildPaidOrderProfitLedger(finance,adsSweep,{minMargin=lowMargins}={}){
 const original=Array.isArray(finance?.paidOrders)?finance.paidOrders:[];
 const paid=original.filter(row=>isFinancePaid(row.status,row.paidAt));
 const spend=adsSweep?.status==='verified_campaign_period'&&valid(adsSweep.spendTotal)?
  Number(adsSweep.spendTotal):null;
 const shares=spend!==null?allocateAdsBySale(paid,spend):null;
 const rows=paid.map((order,index)=>{
  const gross=valid(order.grossProductSales)?Number(order.grossProductSales):null;
  const payout=valid(order.payout)?Number(order.payout):null;
  const cost=valid(order.totalCost)?Number(order.totalCost):null;
  const credit=valid(order.supplierCredit)?Number(order.supplierCredit):0;
  const external=valid(order.externalExpense)?Number(order.externalExpense):0;
  const costSource=String(order.costSource||'unspecified');
  const allocated=shares?shares[index]:null;
  const operation=payout!==null&&cost!==null&&allocated!==null?
    money(payout-cost+credit-external-allocated):null;
  const margin=operation!==null&&gross>0?
    money(operation/gross*100):null;
  // Ponto de equilíbrio aproximado com taxa efetiva de repasse atual;
  // não confundir com preço garantido (fees podem variar por faixa).
  const breakEvenPrice=operation!==null&&payout>0&&gross>0?
    money((cost-credit+external+allocated)*gross/payout):null;
  const priceForFivePercent=operation!==null&&payout>0&&gross>0&&
    payout/gross>0.05?money((cost-credit+external+allocated)/(payout/gross-0.05)):null;
  const provisional=order.status!=='COMPLETED'||order.refundPending===true||
    order.payoutConfirmed!==true;
  const risk=operation===null?'unverified':operation<0?'loss':
    margin!==null&&margin<minMargin?'low_margin':'positive';
  return {
   orderSn:String(order.orderSn||''),status:String(order.status||''),
   paidAt:order.paidAt||null,skuList:(order.skuList||[]).map(String).slice(0,20),
   grossProductSales:gross,buyerTotal:valid(order.buyerTotal)?Number(order.buyerTotal):null,
   payout,payoutConfirmed:order.payoutConfirmed===true,
   totalCost:cost,catalogCost:valid(order.catalogCost)?Number(order.catalogCost):null,
   costSource,supplierCredit:credit,externalExpense:external,
   supplierReference:String(order.supplierReference||''),
   adsAllocated:allocated,adsMethod:shares?
    'rateio gerencial proporcional ao valor das vendas pagas; não representa clique, conversão ou custo Ads comprovado por pedido':null,
   afterAds:operation,margin,risk,
   breakEvenPrice,priceForFivePercent,
   provisional,refundPending:order.refundPending===true,
   refundStatus:String(order.refundStatus||'sem devolução'),
   refundRequested:valid(order.refundRequested)?Number(order.refundRequested):null,
   adjustedEscrow:order.adjustedEscrow===true,
   settlementMethod:order.payoutConfirmed?'repasse Payment confirmado':
    order.payout!==null?'repasse Payment previsto; ainda sujeito a ajustes':'sem repasse disponível',
   reason:order.reason||'',items:order.items||[]
  };
 });
 const eligible=rows.filter(x=>x.payout!==null&&x.totalCost!==null);
 const confirmed=eligible.filter(x=>!x.provisional);
 const subtotal=(field,source=rows)=>money(source.reduce((sum,r)=>sum+(valid(r[field])?Number(r[field]):0),0));
 const numbersComplete=rows.length>0&&rows.every(x=>x.afterAds!==null)&&
  finance?.paidOrderCoverage?.complete!==false;
 const costsEstimated=rows.filter(x=>x.costSource==='wedrop_catalog_estimate').length;
 const complete=numbersComplete&&
  finance?.returnsCoverage?.complete===true&&
  rows.every(x=>!x.provisional&&!x.refundPending)&&costsEstimated===0;
 const adjusted=rows.filter(x=>x.refundStatus!=='sem devolução').length;
 const finalized=rows.filter(x=>!x.provisional&&x.afterAds!==null);
 const finalizedTotal=finalized.length?subtotal('afterAds',finalized):null;
 const finalizedGross=finalized.length&&finalized.every(x=>x.grossProductSales!==null)?subtotal('grossProductSales',finalized):null;
 const operational=complete?subtotal('afterAds'):null;
 const projectedOperatingProfit=numbersComplete?subtotal('afterAds'):null;
 const allGross=rows.length>0&&rows.every(x=>x.grossProductSales!==null)?
   subtotal('grossProductSales'):null;
 const allBuyer=rows.length>0&&rows.every(x=>x.buyerTotal!==null)?
   subtotal('buyerTotal'):null;
 return {
  definition:'Resultado operacional dos pedidos pagos = repasse ajustado (ou previsto) - custo WeDrop + créditos do fornecedor - despesas externas registradas - Ads rateados; tributos não conciliados não incluídos.',
  basis:'Pedidos pagos por criação no período; Ads do mesmo período de calendário. Não há correspondência financeira individual por clique.',
  paidOrders:rows.length,closedOrders:confirmed.length,
  projectedOrders:rows.filter(x=>x.provisional).length,
  paidGrossKnown:subtotal('grossProductSales'),
  paidGross:allGross,
  paidGrossCoverage:rows.filter(x=>x.grossProductSales!==null).length,
  paidBuyerTotal:allBuyer,paidBuyerKnown:subtotal('buyerTotal'),
  paidBuyerCoverage:rows.filter(x=>x.buyerTotal!==null).length,
  escrowKnown:subtotal('payout'),escrowCoverage:rows.filter(x=>x.payout!==null).length,
  costKnown:subtotal('totalCost'),costCoverage:rows.filter(x=>x.totalCost!==null).length,
  adsTotal:spend,adsAllocated:shares?subtotal('adsAllocated'):null,
  adsAllocationComplete:shares!==null,adsMethod:shares?'proportional_paid_sales':'insufficient_sales_or_ads_data',
  operationalKnown:subtotal('afterAds',rows.filter(x=>x.afterAds!==null)),
  operationalCoverage:rows.filter(x=>x.afterAds!==null).length,
  operatingProfit:operational,projectedOperatingProfit,
  finalizedResultKnown:finalizedTotal,
  finalizedMarginKnown:finalizedGross>0?money(finalizedTotal/finalizedGross*100):null,
  finalizedOrdersAnalyzed:finalized.length,costEstimatedOrders:costsEstimated,
  operatingMargin:operational!==null&&allGross>0?money(operational/allGross*100):null,
  projectedOperatingMargin:projectedOperatingProfit!==null&&allGross>0?
   money(projectedOperatingProfit/allGross*100):null,
  complete,refundAffectedOrders:adjusted,
  missingOrders:rows.filter(x=>x.afterAds===null).map(x=>x.orderSn),
  rows,
  warnings:[
    !complete?'O resultado das vendas pagas ainda é PROVISÓRIO: parte dos pedidos não teve repasse final, custo real, ou há devoluções/valores a confirmar.':null,
    costsEstimated?'Há '+costsEstimated+' pedido(s) com custo estimado do catálogo WeDrop, não comprovado pela compra efetiva.':null,
    spend===null?'Gasto Ads não retornado: é impossível computar o resultado depois da publicidade.':null,
    spend!==null&&!shares?'Faltam valores de produtos para distribuir o gasto Ads entre todos os pedidos; não atribuir custos fictícios.':null,
    'O gasto Ads por pedido é rateio gerencial, nunca atribuição comprovada pelo anúncio. Não é lucro líquido fiscal: tributos e outras despesas externas ainda precisam ser conciliados.'
  ].filter(Boolean)
 };
}
