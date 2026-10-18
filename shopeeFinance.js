// Conciliação de pedidos Shopee: valores reais da API Payment, sem taxas presumidas.
// O repasse (escrow_amount) já incorpora tarifas/descontos/frete registrados.
// Ads não são deduzidos até existir atribuição comprovada sem duplicidades.
import {readWeDropCosts,readWeDropSkuLinks,readFinanceCatalogProfiles} from './wedropCosts.js';

export const MAX_FINANCE_ORDERS=100;
export function finiteMoney(raw){
  if(raw===null||raw===undefined||raw==='')return null;
  const value=Number(raw);
  return Number.isFinite(value)?Math.round(value*100)/100:null;
}
export function financePeriod(days){
  const n=Number(days);
  if(!Number.isSafeInteger(n)||n<1||n>30)
    throw Error('Escolha um período de 1 a 30 dias.');
  return n;
}
// Período em horário local brasileiro. Shopee Order List usa create_time:
// são pedidos CRIADOS neste período que já estão COMPLETED, não qualquer
// pedido cuja entrega ocorreu dentro do intervalo.
export function financeRange({days=15,start='',end=''}={},now=Math.floor(Date.now()/1000)){
  if(start||end){
    const date=/^\d{4}-\d{2}-\d{2}$/;
    if(!date.test(start)||!date.test(end))throw Error('Informe as datas inicial e final.');
    const fromMs=Date.parse(start+'T00:00:00-03:00');
    const toMs=Date.parse(end+'T23:59:59-03:00');
    if(!Number.isFinite(fromMs)||!Number.isFinite(toMs)||
      new Date(fromMs-3*3600000).toISOString().slice(0,10)!==start||
      new Date(toMs-3*3600000).toISOString().slice(0,10)!==end)
      throw Error('Data inválida.');
    // Quando "até hoje" é selecionado, a janela termina AGORA,
    // e não às 23:59 futuras do próprio dia.
    const from=Math.floor(fromMs/1000),to=Math.min(Math.floor(toMs/1000),now);
    const endDayStart=Math.floor(Date.parse(end+'T00:00:00-03:00')/1000);
    if(from>to||endDayStart>now||Math.floor(toMs/1000)-from>30*86400-1)
      throw Error('Intervalo inválido: escolha no máximo 30 dias, sem datas futuras.');
    return {from,to,days:Math.ceil((to-from+1)/86400),label:start+' a '+end,mode:'custom'};
  }
  const n=financePeriod(days);
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date(now*1000));
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const today=values.year+'-'+values.month+'-'+values.day;
  const midnight=Math.floor(Date.parse(today+'T00:00:00-03:00')/1000);
  return {from:midnight-(n-1)*86400,to:now,days:n,
    label:'Últimos '+n+' dias (calendário BR)',mode:'rolling'};
}
export function normalizeEscrowOrder(order,detail,escrow,costMap,linkMap=new Map()){
  const income=escrow?.response?.order_income;
  const status=String(detail?.order_status||order?.order_status||'').toUpperCase();
  const orderSn=String(order.order_sn||'');
  if(status!=='COMPLETED'||!income){
    return {orderSn,status,ready:false,reason:status!=='COMPLETED'
      ?'Pedido não concluído; repasse pode mudar.':'A Shopee não retornou o detalhe do repasse.'};
  }
  if(Array.isArray(escrow.response?.return_order_sn_list)&&
     escrow.response.return_order_sn_list.length){
    return {orderSn,status,ready:false,payout:null,totalCost:null,balanceBeforeAds:null,
      netProfit:null,netMargin:null,
      reason:'Pedido com devolução/reembolso: aguarde a conciliação de itens devolvidos e custos.'};
  }
  const payout=finiteMoney(income.escrow_amount_after_adjustment??income.escrow_amount);
  const items=Array.isArray(income.items)&&income.items.length
    ?income.items:Array.isArray(detail?.item_list)?detail.item_list:[];
  const costs=[],missing=[];
  const skuFromItem=item=>{
    const modelRequired=Number(item.model_id||0)>0&&!String(item.model_sku||'').trim();
    return modelRequired||item.is_kit?'':String(item.model_sku||item.item_sku||'').trim();
  };
  const presentSkuList=[...new Set(items.map(skuFromItem).filter(Boolean))];
  for(const item of items){
    // SKU de modelo tem prioridade; nunca utilizar SKU pai no lugar da variação.
    // Um modelo existente sem model_sku não deve herdar o SKU pai por engano.
    const modelRequiresSku=Number(item.model_id||0)>0&&!String(item.model_sku||'').trim();
    const isBundle=Boolean(item.is_kit);
    const sku=modelRequiresSku||isBundle?'':String(item.model_sku||item.item_sku||'').trim();
    const qty=Number(item.quantity_purchased??item.model_quantity_purchased??item.quantity);
    const itemId=String(item.item_id||'');
    const modelId=String(item.model_id||0);
    const linked=linkMap.get(itemId+':'+modelId);
    // Vínculo revisado pelo lojista só vale para a mesma loja, item, modelo
    // e SKU ainda idêntico ao publicado no momento da confirmação.
    const supplierSku=linked&&linked.shopee_sku===sku
      ?linked.supplier_sku:sku;
    const unit=costMap.get(supplierSku);
    if(!sku||!Number.isSafeInteger(qty)||qty<1||qty>100000||
       !Number.isFinite(unit)||unit<=0){
      missing.push(sku||'SKU ausente');
      continue;
    }
    costs.push({sku,qty,unitCost:unit,total:Math.round(unit*qty*100)/100});
  }
  const totalCost=missing.length||!items.length?null:
    Math.round(costs.reduce((sum,x)=>sum+x.total,0)*100)/100;
  const ready=payout!==null&&totalCost!==null;
  // O balanço abaixo já está LÍQUIDO do que a Shopee incluiu no repasse.
  // Descontar comissão/frete/voucher novamente provocaria dupla cobrança.
  const balanceBeforeAds=ready?Math.round((payout-totalCost)*100)/100:null;
  const uniqueSku=[...new Set(costs.map(x=>x.sku))];
  const onlySku=ready&&uniqueSku.length===1?uniqueSku[0]:null;
  const marginBeforeAds=ready&&payout>0?
    Math.round(balanceBeforeAds/payout*10000)/100:null;
  return {
    orderSn,status,ready,createdAt:Number.isSafeInteger(Number(order.create_time))&&Number(order.create_time)>0?Number(order.create_time):null,
    sku:onlySku,skuList:presentSkuList,items:items.length,
    quantity:costs.reduce((n,x)=>n+x.qty,0),
    buyerTotal:finiteMoney(income.buyer_total_amount),
    payout,totalCost,balanceBeforeAds,marginBeforeAds,
    // Sem atribuição de Ads e tributos externos, NÃO nomear lucro líquido.
    netProfit:null,netMargin:null,
    feeBreakdown:{
      commission:finiteMoney(income.net_commission_fee??income.commission_fee),
      service:finiteMoney(income.net_service_fee??income.service_fee),
      transaction:finiteMoney(income.seller_transaction_fee),
      actualShipping:finiteMoney(income.actual_shipping_fee),
      shippingRebate:finiteMoney(income.shopee_shipping_rebate),
      sellerVoucher:finiteMoney(income.voucher_from_seller)
    },
    reason:ready?(
      onlySku?'Repasse concluído, custo confirmado. Ads e encargos externos não atribuídos.':
      'Pedido com vários SKUs: resultado só pode ser atribuído ao pedido, não individualmente ao SKU.'
    ):!items.length?'A Shopee não retornou os itens do pedido.':
      payout===null?'Valor de repasse indisponível.':
      'Custo WeDrop ou quantidade ausente: '+[...new Set(missing)].slice(0,3).join(', ')+'.'
  };
}

/** Daily columns are based on the order create_time (Brazil calendar), not settlement date.
 * Only COMPLETED orders with confirmed escrow and WeDrop costs contribute.
 * No arbitrary Ads allocation is made at the daily/order level.
 */
export function summarizeFinanceDaily(rows){
  const days=new Map(),br=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=stamp=>{
    const p=Object.fromEntries(br.formatToParts(new Date(stamp*1000)).map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day;
  };
  const money=n=>Math.round(n*100)/100;
  for(const r of rows||[]){
    if(!r.ready||!Number.isFinite(r.createdAt)||r.createdAt<=0||
      !Number.isFinite(r.payout)||!Number.isFinite(r.totalCost)||!Number.isFinite(r.balanceBeforeAds))continue;
    const day=parts(r.createdAt);
    const entry=days.get(day)||{day,orders:0,payout:0,costs:0,balanceBeforeAds:0};
    entry.orders++;
    entry.payout=money(entry.payout+r.payout);
    entry.costs=money(entry.costs+r.totalCost);
    entry.balanceBeforeAds=money(entry.balanceBeforeAds+r.balanceBeforeAds);
    days.set(day,entry);
  }
  return [...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
}

export function summarizeFinance(rows,{more=false,eligible=0}={}){
  const verified=rows.filter(x=>x.ready);
  const total=(field)=>Math.round(verified.reduce((sum,x)=>sum+Number(x[field]||0),0)*100)/100;
  const skus=new Map();
  for(const r of verified){
    if(!r.sku)continue;
    const x=skus.get(r.sku)||{sku:r.sku,orders:0,quantity:0,
      balanceBeforeAds:0,payout:0,cost:0};
    x.orders++;
    x.quantity+=Number(r.quantity||0);
    x.balanceBeforeAds=Math.round((x.balanceBeforeAds+r.balanceBeforeAds)*100)/100;
    x.payout=Math.round((x.payout+r.payout)*100)/100;
    x.cost=Math.round((x.cost+r.totalCost)*100)/100;
    x.marginBeforeAds=x.payout>0?Math.round(x.balanceBeforeAds/x.payout*10000)/100:null;
    skus.set(r.sku,x);
  }
  return {
    totals:{
      examined:rows.length,eligible,verified:verified.length,
      units:verified.reduce((n,x)=>n+Number(x.quantity||0),0),
      allocatedSkuOrders:verified.filter(x=>x.sku).length,
      multiSkuOrders:verified.filter(x=>!x.sku).length,
      incomplete:rows.length-verified.length,
      received:total('payout'),supplierCost:total('totalCost'),
      balanceBeforeAds:total('balanceBeforeAds'),
      incompletePeriod:Boolean(more||eligible>rows.length),
      profitabilityComplete:false
    },
    skuSummary:[...skus.values()].sort((a,b)=>a.sku.localeCompare(b.sku,'pt-BR')),
    warning:'Resultado após repasse menos custo WeDrop, ANTES de Ads, impostos e despesas externas. Tarifas e frete já incluídos no repasse Shopee não são descontados duas vezes. Lucro líquido final e margem líquida permanecem pendentes.'
  };
}
export async function loadShopeeFinance(cfg,auth,callApi,{days=15,now=Math.floor(Date.now()/1000),timeRange=null}={}){
  const range=timeRange||financeRange({days},now);
  days=range.days;
  if(!Number.isSafeInteger(Number(auth.shopId)))throw Error('Loja inválida.');
  const [supplierCosts,confirmedLinks]=await Promise.all([
    readWeDropCosts(auth.shopId),readWeDropSkuLinks(auth.shopId)
  ]);
  const costs=new Map(supplierCosts.map(c=>
    [String(c.supplier_sku),Number(c.unit_cost)]));
  const linkMap=new Map(confirmedLinks.map(link=>[
    String(link.item_id)+':'+String(link.model_id||0),link
  ]));
  // A consulta visual não pode impedir a conciliação caso o catálogo
  // de imagens esteja temporariamente indisponível.
  let catalogProducts=[],catalogError=null;
  try{catalogProducts=await readFinanceCatalogProfiles(auth.shopId);}
  catch(e){catalogError='Miniaturas do catálogo temporariamente indisponíveis.';}
  const found=new Map();
  // A Shopee limita a janela de Order List; dividir intervalos de 30 dias
  // em períodos menores e paginar cada um integralmente.
  const periodFrom=range.from,periodTo=range.to;
  const CHUNK=14*86400;
  for(let chunkFrom=periodFrom;chunkFrom<=periodTo;chunkFrom+=CHUNK){
    const chunkTo=Math.min(chunkFrom+CHUNK-1,periodTo);
    let cursor='',finished=false;
    for(let page=0;page<30;page++){
      const api=await callApi(cfg,{
        path:'/api/v2/order/get_order_list',
        accessToken:auth.accessToken,shopId:auth.shopId,
        query:{
          time_range_field:'create_time',time_from:chunkFrom,time_to:chunkTo,
          page_size:50,cursor,response_optional_fields:'order_status'
        }
      });
      const body=api.response||{};
      if(!Array.isArray(body.order_list))throw Error('Shopee não retornou lista válida de pedidos.');
      for(const x of body.order_list){
        const sn=String(x.order_sn||'').trim();
        if(sn&&(!x.create_time||(Number(x.create_time)>=periodFrom&&Number(x.create_time)<=periodTo)))
          found.set(sn,x);
      }
      if(!body.more){finished=true;break;}
      const next=String(body.next_cursor||'');
      if(!next||next===cursor)throw Error('Paginação de pedidos parada. Consulte um intervalo menor.');
      cursor=next;
    }
    if(!finished)throw Error('Pedidos demais no intervalo. Consulte uma data mais curta.');
  }
  const completed=[...found.values()].filter(x=>String(x.order_status||'').toUpperCase()==='COMPLETED');
  const limited=completed.slice(0,MAX_FINANCE_ORDERS);
  const detailMap=new Map();
  for(let i=0;i<limited.length;i+=50){
    const d=await callApi(cfg,{
      path:'/api/v2/order/get_order_detail',accessToken:auth.accessToken,shopId:auth.shopId,
      query:{order_sn_list:limited.slice(i,i+50).map(x=>x.order_sn).join(',')}
    });
    if(!Array.isArray(d?.response?.order_list))
      throw Error('Não foi possível obter itens dos pedidos da Shopee.');
    for(const item of d.response.order_list){
      if(item.order_sn)detailMap.set(String(item.order_sn),item);
    }
  }
  const rows=[];
  let paymentAccessWarning=null;
  for(const item of limited){
    let escrow;
    try{
      escrow=await callApi(cfg,{
        path:'/api/v2/payment/get_escrow_detail',
        accessToken:auth.accessToken,shopId:auth.shopId,
        query:{order_sn:String(item.order_sn)}
      });
    }catch(error){
      // Não declarar que repasse é zero quando a permissão Payment é negada.
      const why=String(error.message||error).slice(0,200);
      paymentAccessWarning=paymentAccessWarning||why;
      rows.push({orderSn:String(item.order_sn),status:'COMPLETED',createdAt:Number(item.create_time)||null,ready:false,
        reason:'Detalhamento de pagamento indisponível: '+why,
        payout:null,totalCost:null,balanceBeforeAds:null,netProfit:null,netMargin:null});
      if(/permission|denied|403|no.?auth|forbidden/i.test(why))break;
      continue;
    }
    rows.push(normalizeEscrowOrder(item,detailMap.get(String(item.order_sn)),escrow,costs,linkMap));
  }
  const summary=summarizeFinance(rows,{eligible:completed.length,more:false});
  return {
    shopId:auth.shopId,days,window:{from:periodFrom,to:periodTo},selection:range,rows,
    dailySeries:summarizeFinanceDaily(rows),
    catalogProducts,catalogError,
    ...summary,paymentAccessWarning,
    skippedCompleted:completed.length-limited.length,
    complete:Boolean(!paymentAccessWarning&&completed.length===rows.length&&
      rows.every(x=>x.ready)),
    adsAttribution:'not_available',
    caveat:'Somente pedidos COMPLETED criados entre as datas selecionadas; máximo de '+MAX_FINANCE_ORDERS+
      ' pedidos concluídos por consulta. Não equivale ao extrato bancário.'
  };
}
