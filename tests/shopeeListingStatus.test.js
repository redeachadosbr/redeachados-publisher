import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyShopeeListingStatus} from '../shopeeListingStatus.js';
const SKU_ITEM_ID='58271290960';
test('SKU 303448: NORMAL em get_item_base_info não exige segunda chamada',async()=>{
 let calls=0;
 const status=await verifyShopeeListingStatus({itemId:SKU_ITEM_ID,baseStatus:'normal',
  fetchNormalPage:async()=>{calls++;throw Error('não deve consultar lista');}});
 assert.equal(status.status,'NORMAL');
 assert.equal(status.source,'get_item_base_info');
 assert.equal(calls,0);
});
test('item ativo exato recuperado da listagem NORMAL mesmo com status base UNLIST',async()=>{
 let calls=0;
 const page=({offset})=>{
  calls++;
  return {response:{item:[{item_id:offset===500?Number(SKU_ITEM_ID):98765,item_status:'NORMAL'}],
   has_next_page:offset<500,next_offset:offset+100,total_count:528}};
 };
 const result=await verifyShopeeListingStatus({itemId:SKU_ITEM_ID,baseStatus:'UNLIST',
  fetchNormalPage:page});
 assert.equal(result.status,'NORMAL');
 assert.equal(result.listConfirmed,true);
 assert.equal(result.source,'get_item_list');
 assert.equal(result.baseStatus,'UNLIST');
 assert.equal(calls,6);
 assert.equal(result.pagesChecked,6);
});
test('outro item com mesmo título/SKU não permite status NORMAL',async()=>{
 const actual=await verifyShopeeListingStatus({itemId:SKU_ITEM_ID,baseStatus:'REVIEWING',
  fetchNormalPage:async()=>({response:{item:[{item_id:58271290961,item_status:'NORMAL'}],
   has_next_page:false,next_offset:0}})});
 assert.equal(actual.status,'REVIEWING');
 assert.equal(actual.listConfirmed,false);
});
test('itens banidos ou excluídos não podem ser desbloqueados pela listagem',async()=>{
 for(const status of ['BANNED','SELLER_DELETE','SHOPEE_DELETE','DELETED']){
  let count=0;
  const result=await verifyShopeeListingStatus({itemId:SKU_ITEM_ID,baseStatus:status,
   fetchNormalPage:async()=>{count++;return {response:{item:[{item_id:SKU_ITEM_ID}]}}}});
  assert.equal(result.status,status);
  assert.equal(count,0);
 }
});
test('API incompleta, paginação repetida e falso NORMAL falham sem liberar promoção',async()=>{
 const malformed=async()=>({response:{}});
 const repeated=async()=>({response:{item:[],has_next_page:true,next_offset:0}});
 const conflicting=async()=>({response:{item:[{item_id:SKU_ITEM_ID,item_status:'BANNED'}]}});
 await assert.rejects(verifyShopeeListingStatus({
  itemId:SKU_ITEM_ID,baseStatus:null,fetchNormalPage:malformed
 }),/íntegra/);
 await assert.rejects(verifyShopeeListingStatus({
  itemId:SKU_ITEM_ID,baseStatus:null,fetchNormalPage:repeated
 }),/inconsistente/);
 await assert.rejects(verifyShopeeListingStatus({
  itemId:SKU_ITEM_ID,baseStatus:null,fetchNormalPage:conflicting
 }),/divergente/);
});
test('desconto consulta o item exato na listagem e informa origem da confirmação',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/verifyShopeeListingStatus\(\{/);
 assert.match(server,/item_status:'NORMAL',offset,page_size:pageSize/);
 assert.match(server,/itemId:String\(itemId\),baseItemStatus/);
 assert.match(server,/liveStatusSource:data\.liveStatusSource/);
 assert.match(server,/discountExecutionInputs\(req,approved\.sku,approved\.itemId/);
});
