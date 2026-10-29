import test from 'node:test';
import assert from 'node:assert/strict';
import {pickKitDiscountCandidate,discoverKitDiscountCampaigns} from '../shopeeKitDiscountDiscovery.js';

test('somente a campanha do KIT e sugerida quando sua inclusao e unica',()=>{
 const list=[
  {discountId:'100',itemIds:['501']},
  {discountId:'200',itemIds:['999','777']}
 ];
 assert.deepEqual(pickKitDiscountCandidate(list,{kitItemId:'999',
  primaryItemIds:['501'],complete:true}),{discountId:'200',reason:'kit_membership'});
 assert.equal(pickKitDiscountCandidate(list,{kitItemId:'999',
  primaryItemIds:['501'],complete:false}).discountId,null);
});

test('campanha do SKU principal e sugerida somente sem vinculo do kit e com prova unica',()=>{
 const list=[{discountId:'100',itemIds:['501']},{discountId:'200',itemIds:['777']}];
 assert.deepEqual(pickKitDiscountCandidate(list,{kitItemId:'999',
  primaryItemIds:['501'],complete:true}),{discountId:'100',reason:'primary_sku_membership'});
 assert.equal(pickKitDiscountCandidate(list,{kitItemId:'999',
  primaryItemIds:['501','777'],complete:true}).discountId,null);
});

test('consulta Minha Promocao com IDs separados e nao executa nenhuma alteracao',async()=>{
 const calls=[];
 const call=async(_cfg,req)=>{
  calls.push(req);
  assert.equal(req.path,'/api/v2/discount/get_discount_list');
  assert.equal(req.method,'POST');
  assert.equal(typeof req.body.page_no,'string');
  if(req.body.discount_status==='ongoing')return {response:{
   discount_list:[{discount_id:100,discount_name:'Promocao brinquedos'}],more:false
  }};
  return {response:{discount_list:[],more:false}};
 };
 const result=await discoverKitDiscountCampaigns({
  cfg:{},auth:{shopId:12,accessToken:'tok'},call,
  readPages:async()=>({complete:true,record:{status:'ongoing',end_time:Math.floor(Date.now()/1000)+86400,
   discount_name:'Promocao brinquedos'},pages:[{item_list:[{item_id:501}]}]}),
  kitItemId:'999',primaryItemIds:['501']
 });
 assert.equal(calls.length,2);
 assert.equal(result.campaigns.length,1);
 assert.equal(result.campaigns[0].containsPrimary,true);
 assert.equal(result.campaigns[0].containsKit,false);
 assert.deepEqual(result.suggested,{discountId:'100',reason:'primary_sku_membership'});
 assert.equal(result.marketplaceUpdated,false);
 assert.equal(result.campaigns[0].itemIds,undefined);
});

test('campanha sem conclusao de paginacao nunca e selecionada automaticamente',async()=>{
 const result=await discoverKitDiscountCampaigns({
  cfg:{},auth:{shopId:12,accessToken:'tok'},
  call:async(_c,r)=>({response:{
   discount_list:r.body.discount_status==='ongoing'?[{discount_id:100}]:[],more:false}}),
  readPages:async()=>{throw Error('Erro leitura campanha');},
  kitItemId:'999',primaryItemIds:['501']
 });
 assert.equal(result.complete,false);
 assert.equal(result.suggested.discountId,null);
 assert.equal(result.campaigns.length,0);
});
