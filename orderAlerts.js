// Motor de regras de monitoramento, sem API nem dados pessoais.
const NO_SHIP_ACTION=new Set(['UNPAID','CANCELLED','IN_CANCEL','COMPLETED','TO_CONFIRM_RECEIVE','SHIPPED']);
const SENT=new Set(['SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','DELIVERED']);
const PREPARATION=new Set(['READY_TO_SHIP','PENDING_INVOICE','INVOICE_PENDING','PROCESSED','RETRY_SHIP','PAID','TO_PROCESS']);
export function unix(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>1000000000&&n<9999999999?Math.floor(n):null;
}
export function projectOrder(detail={},listing={}){
  const orderSn=String(detail.order_sn||listing.order_sn||'').trim();
  const status=String(detail.order_status||listing.order_status||'').toUpperCase();
  const packages=Array.isArray(detail.package_list)?detail.package_list:[];
  const deadlines=packages.map(x=>unix(x.ship_by_date)).filter(Boolean);
  const shipByDate=deadlines.length?Math.min(...deadlines):unix(detail.ship_by_date);
  return {
    order_sn:orderSn,
    order_status:status,
    create_time:unix(detail.create_time)||unix(listing.create_time),
    pay_time:unix(detail.pay_time),
    ship_by_date:shipByDate,
    pickup_done_time:unix(detail.pickup_done_time)
  };
}
export function shipped(order){
  return SENT.has(String(order.order_status||'').toUpperCase())||Boolean(unix(order.pickup_done_time));
}
export function actionable(order){
  return !NO_SHIP_ACTION.has(String(order.order_status||'').toUpperCase())&&!shipped(order);
}
export function severityForDeadline(order,nowSeconds=Math.floor(Date.now()/1000)){
  if(!actionable(order))return 'resolved';
  const deadline=unix(order.ship_by_date);
  if(!deadline)return 'unknown';
  const remaining=deadline-nowSeconds;
  if(remaining<=0)return 'overdue';
  if(remaining<=2*3600)return 'critical';
  if(remaining<=6*3600)return 'urgent';
  if(remaining<=24*3600)return 'today';
  if(remaining<=48*3600)return 'soon';
  return 'normal';
}
function deadlineText(epoch){
  return unix(epoch)?new Date(Number(epoch)*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'não informado';
}
export function buildOrderEvents(previous,current,{nowSeconds=Math.floor(Date.now()/1000),bootstrap=false}={}){
  const sn=current.order_sn;
  if(!sn)return [];
  const events=[];
  const create=(type,severity,title,message)=>{
    events.push({alert_key:`${sn}:${type}`,order_sn:sn,event_type:type,severity,title,message,ship_by_date:current.ship_by_date});
  };
  const status=current.order_status;
  const prior=previous?.order_status||null;
  const isNew=!previous;
  const paid=PREPARATION.has(status);
  const formerlyUnpaid=previous&&previous.order_status==='UNPAID';
  const startTime=current.pay_time||current.create_time||0;
  // Na primeira sincronização, não transformar todo histórico antigo em 'venda nova'.
  if(paid&&(isNew||formerlyUnpaid)&&(!bootstrap||startTime>=nowSeconds-3600)){
    create('sale','info','Nova venda Shopee','Pedido '+sn+' confirmado. Prepare a mercadoria. Prazo de postagem: '+deadlineText(current.ship_by_date)+'.');
  }
  if(shipped(current)&&prior&&!shipped(previous)){
    create('shipped','info','Pedido enviado','A Shopee registrou o envio do pedido '+sn+'.');
  }
  if(status==='CANCELLED'&&prior&&prior!=='CANCELLED'){
    create('cancelled','warning','Pedido cancelado','O pedido '+sn+' foi cancelado. Confira o motivo na Central do Vendedor.');
  }
  if(!actionable(current))return events;
  const state=severityForDeadline(current,nowSeconds);
  if(state==='unknown'){
    create('deadline_unknown','warning','Prazo de envio não informado','Pedido '+sn+': a API não retornou ship_by_date. Confira a data-limite no Seller Center.');
  }else if(state!=='normal'){
    const timeRemaining=Math.max(0,Number(current.ship_by_date)-nowSeconds);
    const level=state==='overdue'?'overdue':state==='critical'?'2h':state==='urgent'?'6h':state==='today'?'24h':'48h';
    const label=state==='overdue'?'PRAZO VENCIDO':state==='critical'?'URGENTE: menos de 2h':state==='urgent'?'Menos de 6h':state==='today'?'Menos de 24h':'Menos de 48h';
    create('deadline_'+level,state==='overdue'||state==='critical'?'critical':'warning',
      label+' para postar',
      'Pedido '+sn+'. Limite Shopee: '+deadlineText(current.ship_by_date)+'. '+(state==='overdue'?'Verifique imediatamente possível atraso.':'Prepare e poste antes do vencimento.') );
  }
  return events;
}
export function sortPending(orders,nowSeconds=Math.floor(Date.now()/1000)){
  const rank={overdue:0,critical:1,urgent:2,today:3,soon:4,unknown:5,normal:6,resolved:7};
  return orders.filter(actionable).map(x=>({...x,risk:severityForDeadline(x,nowSeconds)}))
    .sort((a,b)=>(rank[a.risk]??10)-(rank[b.risk]??10)||(a.ship_by_date||Infinity)-(b.ship_by_date||Infinity));
}
