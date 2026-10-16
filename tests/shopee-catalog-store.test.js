import test from 'node:test';
import assert from 'node:assert/strict';
import {persistedCatalogRows,mapPersistedCatalogRow} from '../catalogStore.js';
test('salva somente itens enriquecidos sem credenciais ou dados pessoais',()=>{
  const rows=persistedCatalogRows(852701218,[
    {itemId:'58268798868',title:'Anúncio',sku:'SKU-01',status:'NORMAL',price:99.9,
     stock:0,imageUrl:'https://cdn.example/1.jpg',hasModel:false,
     promotion:true,updateTime:1792000000,baseLoaded:true,accessToken:'NUNCA_SALVAR'},
    {itemId:'58268798869',status:'NORMAL',baseLoaded:false}
  ],'2026-10-16T06:00:00.000Z');
  assert.equal(rows.length,1);
  assert.equal(rows[0].item_id,58268798868);
  assert.equal(rows[0].stock,0);
  assert.equal(rows[0].price,99.9);
  assert.equal(rows[0].shop_id,852701218);
  assert.ok(!JSON.stringify(rows).includes('NUNCA_SALVAR'));
  assert.ok(!JSON.stringify(rows).includes('accessToken'));
});
test('modelos vazios ou dados sem estoque permanecem nulos no cache',()=>{
  const item=mapPersistedCatalogRow({
    item_id:12,item_name:'Teste',sku:'ABC',item_status:'UNLIST',
    image_url:'',stock:null,price:null,has_model:true,base_loaded:true,
    has_promotion:false,item_updated_at:null,last_seen_at:'2026-10-16T06:00:00.000Z'
  });
  assert.equal(item.itemId,'12');
  assert.equal(item.stock,null);
  assert.equal(item.price,null);
  assert.equal(item.hasModel,true);
  assert.equal(item.baseLoaded,true);
});
test('identificadores de loja inválidos não são persistidos',()=>{
  assert.throws(()=>persistedCatalogRows(0,[{itemId:'1',baseLoaded:true}]),/Shop ID inválido/);
});
