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
