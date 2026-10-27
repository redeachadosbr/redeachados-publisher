import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDiscountMembership} from '../shopeeCatalogDiscountAudit.js';
test('campanha ativa, programada e ausência apenas após consulta completa',()=>{
 const data=[{status:'ongoing',discountId:'1',items:[{item_id:11,item_original_price:100,item_promotion_price:80}]},
 {status:'upcoming',discountId:'2',items:[{item_id:12}]}];
 const result=summarizeDiscountMembership(['11','12','13'],data);
 assert.equal(result.items['11'].kind,'active');
 assert.match(result.items['11'].text,/20,00%/);
 assert.equal(result.items['12'].kind,'scheduled');
 assert.equal(result.items['13'].kind,'missing');
 assert.equal(summarizeDiscountMembership(['13'],data,{complete:false}).items['13'].kind,'unknown');
});

test('envia paginação como texto para a API desta loja e confirma campanha real',async()=>{
 const calls=[];
 const shopApi=async (cfg,req)=>{
  calls.push(req);
  assert.equal(req.method,'POST');
  assert.equal(req.path,'/api/v2/discount/get_discount_list');
  assert.equal(typeof req.body.page_no,'string');
  assert.equal(typeof req.body.page_size,'string');
  assert.equal(req.body.page_no,'1');
  assert.equal(req.body.page_size,'100');
  if(req.body.discount_status==='ongoing')return {response:{
   discount_list:[{discount_id:555,discount_name:'Campanha da loja'}],more:false
  }};
  return {response:{discount_list:[],more:false}};
 };
 const {auditCatalogDiscounts}=await import('../shopeeCatalogDiscountAudit.js');
 const result=await auditCatalogDiscounts({cfg:{},auth:{shopId:1,accessToken:'token'},
  call:shopApi,readPages:async()=>({complete:true,record:{status:'ongoing'},
   pages:[{item_list:[{item_id:123,item_original_price:200,item_promotion_price:160}]}]}),
  itemIds:['123','124']
 });
 assert.equal(calls.length,2);
 assert.equal(result.complete,true);
 assert.equal(result.items['123'].kind,'active');
 assert.match(result.items['123'].text,/20,00/);
 assert.equal(result.items['124'].kind,'missing');
});

test('falha na listagem não pode ser informada como zero descontos',async()=>{
 const {auditCatalogDiscounts}=await import('../shopeeCatalogDiscountAudit.js');
 await assert.rejects(
  auditCatalogDiscounts({cfg:{},auth:{shopId:1},itemIds:['123'],
   call:async()=>{throw Error('json: cannot unmarshal number into Go struct field');},
   readPages:async()=>{throw Error('should not read detail');}}),
  /Auditoria não iniciada/
 );
});
