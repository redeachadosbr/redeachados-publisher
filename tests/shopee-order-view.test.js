import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeShopeeOrderDates} from '../orderView.js';

test('preenche datas faltantes sem alterar identificador e status',()=>{
  const result=mergeShopeeOrderDates(
    [{order_sn:'261015MYETBHR0',order_status:'SHIPPED'},{order_sn:'261014JMK828FW',order_status:'COMPLETED'}],
    [{order_sn:'261015MYETBHR0',create_time:1792074700,total_amount:200,recipient_address:{name:'DADO PRIVADO'},buyer_username:'DADO PRIVADO'},
     {order_sn:'261014JMK828FW',create_time:1792020000,total_amount:99}]
  );
  assert.equal(result[0].order_sn,'261015MYETBHR0');
  assert.equal(result[0].order_status,'SHIPPED');
  assert.equal(result[0].create_time,1792074700);
  assert.equal(result[1].create_time,1792020000);
  assert.deepEqual(Object.keys(result[0]),['order_sn','order_status','create_time']);
  assert.ok(!JSON.stringify(result).includes('DADO PRIVADO'));
  assert.ok(!JSON.stringify(result).includes('total_amount'));
});
test('ausência de detalhes não inventa datas nem apaga status',()=>{
  const data=mergeShopeeOrderDates([{order_sn:'A',order_status:'TO_CONFIRM_RECEIVE'}],[]);
  assert.deepEqual(data,[{order_sn:'A',order_status:'TO_CONFIRM_RECEIVE',create_time:null}]);
});
test('usa data da lista quando já existe e ignora timestamps inválidos',()=>{
  const data=mergeShopeeOrderDates([
    {order_sn:'A',order_status:'SHIPPED',create_time:1792000000},
    {order_sn:'B',order_status:'COMPLETED'}],
    [{order_sn:'B',create_time:'inválido'}]);
  assert.equal(data[0].create_time,1792000000);
  assert.equal(data[1].create_time,null);
});

test('resumo operacional inclui SKU, preço e quantidades sem divulgar dados do comprador',async()=>{
  const {mergeShopeeOrderSummaries}=await import('../orderView.js');
  const rows=[{order_sn:'A',order_status:'SHIPPED'},{order_sn:'B',order_status:'COMPLETED'}];
  const details=[{order_sn:'A',create_time:1792074700,total_amount:89.90,
    recipient_address:{name:'CLIENTE PRIVADO',phone:'99999'},buyer_username:'SECRETO',
    item_list:[{item_sku:'SKU123',item_name:'Produto A',model_quantity_purchased:2,model_discounted_price:44.95}]},
    {order_sn:'B',create_time:1792010000,recipient_address:{name:'SECRET NAME'}}];
  const result=mergeShopeeOrderSummaries(rows,details);
  assert.equal(result[0].total_amount,89.9);
  assert.equal(result[0].items_count,2);
  assert.equal(result[0].primary_sku,'SKU123');
  assert.equal(result[0].items[0].quantity,2);
  assert.equal(result[1].items_count,null);
  assert.equal(result[1].total_amount,null);
  assert.ok(!JSON.stringify(result).includes('CLIENTE PRIVADO'));
  assert.ok(!JSON.stringify(result).includes('SECRET NAME'));
  assert.ok(!JSON.stringify(result).includes('SECRETO'));
});
test('resumo não presume estoque ou quantidade ausente de detalhes',async()=>{
 const {mergeShopeeOrderSummaries}=await import('../orderView.js');
 const rows=mergeShopeeOrderSummaries([{order_sn:'A',order_status:'READY_TO_SHIP'}],[]);
 assert.equal(rows[0].items_count,null);
 assert.equal(rows[0].total_amount,null);
 assert.equal(rows[0].primary_sku,null);
 assert.equal(rows[0].detail_available,false);
});
