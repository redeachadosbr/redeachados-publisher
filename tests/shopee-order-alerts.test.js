import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOrder,buildOrderEvents,severityForDeadline,sortPending,shipped} from '../orderAlerts.js';
const now=1800000000;
function pending(p={}){return {order_sn:'261015MYETBHR0',order_status:'READY_TO_SHIP',
  create_time:now-1800,pay_time:now-1200,ship_by_date:now+6*3600,...p};}
test('prazo da Shopee não é inventado quando API não retorna ship_by_date',()=>{
  const row=projectOrder({order_sn:'A',order_status:'READY_TO_SHIP',days_to_ship:2,create_time:now-1800});
  assert.equal(row.ship_by_date,null);
  const alerts=buildOrderEvents(null,row,{nowSeconds:now,bootstrap:true});
  assert.ok(alerts.some(x=>x.event_type==='deadline_unknown'));
  assert.ok(!JSON.stringify(alerts).includes('2 dias'));
});
test('prefere data-limite mais antecipada de múltiplos pacotes',()=>{
  const p=projectOrder({order_sn:'A',order_status:'READY_TO_SHIP',ship_by_date:now+72*3600,
   package_list:[{ship_by_date:now+36*3600},{ship_by_date:now+20*3600}]});
  assert.equal(p.ship_by_date,now+20*3600);
  assert.equal(severityForDeadline(p,now),'today');
});
test('alertas progressivos, deduplicáveis por chave e sem lembrete depois de enviado',()=>{
  const a=pending({ship_by_date:now+26*3600});
  const after24={...a,ship_by_date:now+23*3600};
  assert.equal(severityForDeadline(a,now),'soon');
  assert.equal(severityForDeadline(after24,now),'today');
  const evt24=buildOrderEvents(a,after24,{nowSeconds:now});
  assert.equal(evt24.length,1);
  assert.equal(evt24[0].event_type,'deadline_24h');
  assert.equal(buildOrderEvents(null,{...a,order_status:'SHIPPED'},{nowSeconds:now}).length,0);
  const shipEvt=buildOrderEvents(a,{...a,order_status:'SHIPPED'},{nowSeconds:now});
  assert.equal(shipEvt.length,1);assert.equal(shipEvt[0].event_type,'shipped');
  assert.equal(shipped({order_status:'TO_CONFIRM_RECEIVE'}),true);
});
test('Venda apenas após pagamento; inicialização ignora venda antiga',()=>{
  const unpaid=pending({order_status:'UNPAID'}), paid=pending();
  assert.equal(buildOrderEvents(null,unpaid,{nowSeconds:now}).some(x=>x.event_type==='sale'),false);
  assert.equal(buildOrderEvents(unpaid,paid,{nowSeconds:now}).some(x=>x.event_type==='sale'),true);
  const old=pending({create_time:now-10*86400,pay_time:now-9*86400});
  assert.equal(buildOrderEvents(null,old,{nowSeconds:now,bootstrap:true}).some(x=>x.event_type==='sale'),false);
});
test('prioridades ordenam vencidos antes de urgentes e não mostram enviados',()=>{
  const r=sortPending([
    pending({order_sn:'a',ship_by_date:now+25*3600}),
    pending({order_sn:'b',ship_by_date:now-3600}),
    pending({order_sn:'c',order_status:'SHIPPED'})
  ],now);
  assert.deepEqual(r.map(x=>x.order_sn),['b','a']);
});
test('mensagens não contêm dados pessoais de pedidos',()=>{
  const order=projectOrder({order_sn:'123',order_status:'READY_TO_SHIP',ship_by_date:now+100,
    buyer_username:'Pessoa privada',recipient_address:{name:'Nome sigiloso',phone:'11999999999'}});
  const event=buildOrderEvents(null,order,{nowSeconds:now});
  const raw=JSON.stringify(event);
  assert.ok(!raw.includes('Pessoa privada'));
  assert.ok(!raw.includes('Nome sigiloso'));
  assert.ok(!raw.includes('11999999999'));
});
