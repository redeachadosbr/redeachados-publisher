// Conciliação de pedidos Shopee: valores reais da API Payment, sem taxas presumidas.
// O repasse (escrow_amount) já incorpora tarifas/descontos/frete registrados.
// Ads não são deduzidos até existir atribuição comprovada sem duplicidades.
import {readWeDropCosts} from './wedropCosts.js';

export const MAX_FINANCE_ORDERS=35;
export function finiteMoney(raw){
  if(raw===null||raw===undefined||raw==='')return null;
  const value=Number(raw);
  return Number.isFinite(value)?Math.round(value*100)/100:null;
}
export function financePeriod(days){
  const n=Number(days);
  if(!Number.isSafeInteger(n)||n<1||n>15)
    throw Error('Escolha um período de 1 a 15 dias.');
  return n;
}
export function normalizeEscrowOrder(order,detail,escrow,costMap){
  const income=escrow?.response?.order_income;
  const status=String(detail?.order_status||order?.order_status||'').toUpperCase();
  const orderSn=String(order.order_sn||'');
  if(status!=='COMPLETED'||!income){
    return {orderSn,status,ready:false,reason:status!=='COMPLETED'
      ?'Pedido não concluído; repasse pode mudar.':'A Shopee não retornou o detalhe do repasse.'};
  }
  const payout=finiteMoney(income.escrow_amount_after_adjustment??income.escrow_amount);
  const items=Array.isArray(income.items)&&income.items.length
    ?income.items:Array.isArray(detail?.item_list)?detail.item_list:[];
  const costs=[],missing=[];
  for(const item of items){
    // SKU de modelo tem prioridade; nunca utilizar SKU pai no lugar da variação.
    const sku=String(item.model_sku||item.item_sku||'').trim();
    const qty=Number(item.quantity_purchased??item.model_quantity_purchased??item.quantity);
    const unit=costMap.get(sku);
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
  return {
    orderSn,status,ready,sku:onlySku,skuList:uniqueSku,items:items.length,
    quantity:costs.reduce((n,x)=>n+x.qty,0),
    buyerTotal:finiteMoney(income.buyer_total_amount),
    payout,totalCost,balanceBeforeAds,
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
export function summarizeFinance(rows,{more=false,eligible=0}={}){
  const verified=rows.filter(x=>x.ready);
  const total=(field)=>Math.round(verified.reduce((sum,x)=>sum+Number(x[field]||0),0)*100)/100;
  const skus=new Map();
  for(const r of verified){
    if(!r.sku)continue;
    const x=skus.get(r.sku)||{sku:r.sku,orders:0,balanceBeforeAds:0,payout:0,cost:0};
    x.orders++;
    x.balanceBeforeAds=Math.round((x.balanceBeforeAds+r.balanceBeforeAds)*100)/100;
    x.payout=Math.round((x.payout+r.payout)*100)/100;
    x.cost=Math.round((x.cost+r.totalCost)*100)/100;
    skus.set(r.sku,x);
  }
  return {
    totals:{
      examined:rows.length,eligible,verified:verified.length,
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
export async function loadShopeeFinance(cfg,auth,callApi,{days=15,now=Math.floor(Date.now()/1000)}={}){
  days=financePeriod(days);
  if(!Number.isSafeInteger(Number(auth.shopId)))throw Error('Loja inválida.');
  const costs=new Map((await readWeDropCosts(auth.shopId)).map(c=>
    [String(c.supplier_sku),Number(c.unit_cost)]));
  const found=new Map();
  let cursor='',more=false;
  const periodFrom=now-days*86400;
  for(let page=0;page<10;page++){
    const api=await callApi(cfg,{
      path:'/api/v2/order/get_order_list',
      accessToken:auth.accessToken,shopId:auth.shopId,
      query:{
        time_range_field:'create_time',time_from:periodFrom,time_to:now,
        page_size:50,cursor,response_optional_fields:'order_status'
      }
    });
    const body=api.response||{};
    if(!Array.isArray(body.order_list))throw Error('Shopee não retornou lista válida de pedidos.');
    for(const x of body.order_list){
      const sn=String(x.order_sn||'').trim();
      if(sn)found.set(sn,x);
    }
    more=Boolean(body.more);
    if(!more)break;
    const next=String(body.next_cursor||'');
    if(!next||next===cursor)throw Error('Paginação dos pedidos não avançou. Não foi possível conferir o período completo.');
    cursor=next;
    if(page===9)throw Error('Limite de paginação: o período possui pedidos demais. Consulte menos dias.');
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
      rows.push({orderSn:String(item.order_sn),status:'COMPLETED',ready:false,
        reason:'Detalhamento de pagamento indisponível: '+why,
        payout:null,totalCost:null,balanceBeforeAds:null,netProfit:null,netMargin:null});
      if(/permission|denied|403|no.?auth|forbidden/i.test(why))break;
      continue;
    }
    rows.push(normalizeEscrowOrder(item,detailMap.get(String(item.order_sn)),escrow,costs));
  }
  const summary=summarizeFinance(rows,{eligible:completed.length,more});
  return {
    shopId:auth.shopId,days,window:{from:periodFrom,to:now},rows,
    ...summary,paymentAccessWarning,
    skippedCompleted:completed.length-limited.length,
    complete:Boolean(!more&&!paymentAccessWarning&&completed.length===rows.length&&
      rows.every(x=>x.ready)),
    adsAttribution:'not_available',
    caveat:'Somente pedidos COMPLETED criados nos últimos '+days+
      ' dias; máximo de '+MAX_FINANCE_ORDERS+
      ' por consulta. Acompanhamento de pedidos não é extrato de pagamento efetivado.'
  };
}
