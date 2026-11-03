import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pendingImageCount,pendingImageCategory,pendingImageRows,
 scanShopeePendingImagesPage,verifyShopeePendingImageItem} from '../shopeePendingImageAudit.js';
const base=(id,{sku='SKU-'+id,stock=5,images=8,hasModel=false,status='NORMAL'}={})=>({
 item_id:Number(id),item_sku:sku,item_name:'Produto '+id,item_status:status,
 has_model:hasModel,stock_info_v2:{summary_info:{total_available_stock:stock}},
 image:images===null?{}:{image_id_list:Array.from({length:images},(_,i)=>'img-'+i)}
});
const mock=({status='NORMAL',items,models={}})=>{
 const calls=[];
 const run=async(_cfg,request)=>{
  calls.push(request.path);
  if(request.path==='/api/v2/product/get_item_list')
   return {response:{total_count:items.length,has_next_page:false,
    item:items.map(i=>({item_id:i.item_id}))}};
  if(request.path==='/api/v2/product/get_item_base_info'){
   const ids=request.query.item_id_list.split(',');
   return {response:{item_list:items.filter(i=>ids.includes(String(i.item_id)))}};
  }
  if(request.path==='/api/v2/product/get_model_list')
   return {response:{model:models[String(request.query.item_id)]||[]}};
  throw Error('Requisição inesperada: '+request.path);
 };
 const auth={shopId:123,accessToken:'test'};
 return {calls,run,auth,status};
};
test('menos de 9 fotos usa a galeria real e nunca a capa',()=>{
 assert.equal(pendingImageCount(base(100,{images:8})),8);
 assert.equal(pendingImageCount(base(100,{images:9})),9);
 assert.equal(pendingImageCount(base(100,{images:0})),0);
 assert.equal(pendingImageCount(base(100,{images:null})),null);
 assert.equal(pendingImageCount({image:{image_url_list:['a','b']}}),2);
 assert.equal(pendingImageCount({image:{image_id_list:['a','b','b']}}),2);
});
test('só NORMAL com estoque positivo e status de variação confirmado é acionável',()=>{
 const args={listingStatus:'NORMAL',stock:4,sku:'ABC',imageCount:8};
 assert.equal(pendingImageCategory(args),'active_with_stock');
 assert.equal(pendingImageCategory({...args,stock:0}),'active_no_stock');
 assert.equal(pendingImageCategory({...args,listingStatus:'UNLIST'}),'inactive');
 assert.equal(pendingImageCategory({...args,listingStatus:'REVIEWING'}),'inactive');
 assert.equal(pendingImageCategory({...args,listingStatus:'BANNED'}),'inactive');
 assert.equal(pendingImageCategory({...args,stock:null}),'unverified');
 assert.equal(pendingImageCategory({...args,sku:''}),'unverified');
 assert.equal(pendingImageCategory({...args,hasModel:true,modelStatus:'MODEL_NORMAL'}),'active_with_stock');
 assert.equal(pendingImageCategory({...args,hasModel:true,modelStatus:'MODEL_UNAVAILABLE'}),'inactive');
 assert.equal(pendingImageCategory({...args,hasModel:true,modelStatus:''}),'unverified');
 assert.equal(pendingImageCategory({...args,imageCount:9}),'complete');
});
test('variações herdam o total de fotos do anúncio e separam estoques por SKU',async()=>{
 const items=[base(101,{images:8,stock:5}),
  base(102,{images:9,hasModel:true}),
  base(103,{images:6,hasModel:true,sku:''}),
  base(104,{images:null,stock:10})];
 const models={'103':[
  {model_id:2001,model_sku:'AZUL',model_status:'MODEL_NORMAL',
   stock_info_v2:{summary_info:{total_available_stock:8}}},
  {model_id:2002,model_sku:'ROSA',model_status:'MODEL_NORMAL',
   stock_info_v2:{summary_info:{total_available_stock:0}}}
 ]};
 const m=mock({items,models});
 const page=await scanShopeePendingImagesPage({
  cfg:{},auth:m.auth,callApi:m.run,status:'NORMAL',offset:0,pageSize:25});
 assert.equal(page.totalCount,4);
 assert.equal(page.scannedListings,4);
 assert.equal(page.hasNext,false);
 assert.equal(page.rows.length,4);
 assert.equal(page.rows.find(r=>r.sku==='SKU-101').category,'active_with_stock');
 assert.equal(page.rows.find(r=>r.sku==='AZUL').category,'active_with_stock');
 assert.equal(page.rows.find(r=>r.sku==='ROSA').category,'active_no_stock');
 assert.equal(page.rows.find(r=>r.sku==='AZUL').missingImages,3);
 assert.equal(page.rows.find(r=>r.itemId==='104').category,'unverified');
 assert.equal(m.calls.filter(c=>c==='/api/v2/product/get_model_list').length,1,
  'não consultar variações de anúncio com galeria completa');
});
test('anúncio UNLIST com estoque positivo continua inativo e não vira prioridade',async()=>{
 const x=base(201,{status:'UNLIST',images:4,stock:19});
 const report=await scanShopeePendingImagesPage({
  cfg:{},auth:mock({items:[]}).auth,
  callApi:mock({items:[x]}).run,status:'UNLIST',offset:0,pageSize:25});
 assert.equal(report.rows[0].category,'inactive');
 assert.equal(report.rows[0].stock,19);
});
test('falha de base_info impede declarar relatório parcial como definitivo',async()=>{
 const auth=mock({items:[base(301)]}).auth;
 await assert.rejects(()=>scanShopeePendingImagesPage({cfg:{},auth,status:'NORMAL',offset:0,
  callApi:async(_cfg,request)=>{
   if(request.path.endsWith('/get_item_list'))
    return {response:{total_count:1,item:[{item_id:301}],has_next_page:false}};
   return {response:{item_list:[]}};
  }}),/Leitura incompleta/);
});
test('menu e API estão ligados ao roteador e não executam update_item',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/pending-images.js',import.meta.url),'utf8');
 assert.match(html,/data-tab="pending-images"/);
 assert.match(html,/id="tab-pending-images"/);
 assert.match(html,/id="pendingImagesActive"/);
 assert.match(html,/id="pendingImagesNoStock"/);
 assert.match(html,/id="pendingImagesInactive"/);
 assert.match(html,/pending-images\.js\?v=/);
 assert.match(app,/slug:'otimizacao-pendente'/);
 assert.match(app,/globalThis\.RAOpenPendingImageSku=sku/);
 assert.match(server,/\/api\/shopee\/optimizer\/pending-images\/page/);
 assert.match(server,/'otimizacao-pendente'/);
 assert.match(server,/mustLogin,requireWeDropAdmin/);
 assert.match(client,/status.*offset/);
 assert.doesNotMatch(client,/\/execution\/execute|update_item/);
});

test('confirmação pontual só dá OK 9/9 após consulta oficial ao Item ID',async()=>{
 const sample=base(401,{images:9});
 const m=mock({items:[sample]});
 const good=await verifyShopeePendingImageItem({
  cfg:{},auth:m.auth,callApi:m.run,itemId:'401'
 });
 assert.equal(good.status,'confirmed');
 assert.equal(good.complete,true);
 assert.equal(good.imageCount,9);
 assert.equal(good.missingImages,0);
 assert.equal(good.itemId,'401');
 assert.deepEqual(m.calls,['/api/v2/product/get_item_base_info']);
});
test('8 imagens ou menos continuam pendentes e não podem dar OK',async()=>{
 const m=mock({items:[base(402,{images:8})]});
 const status=await verifyShopeePendingImageItem({
  cfg:{},auth:m.auth,callApi:m.run,itemId:'402'
 });
 assert.equal(status.status,'pending');
 assert.equal(status.complete,false);
 assert.equal(status.missingImages,1);
 assert.equal(pendingImageRows({status:'NORMAL',item:base(402,{images:9})}).length,0);
});
test('API sem galeria ou com Item ID divergente não elimina pendência',async()=>{
 const auth=mock({items:[]}).auth;
 const unverified=await verifyShopeePendingImageItem({
  cfg:{},auth,itemId:'403',
  callApi:async()=>({response:{item_list:[base(403,{images:null})]}})
 });
 assert.equal(unverified.complete,false);
 assert.equal(unverified.status,'unverified');
 await assert.rejects(()=>verifyShopeePendingImageItem({
  cfg:{},auth,itemId:'403',
  callApi:async()=>({response:{item_list:[base(404,{images:9})]}})
 }),/não confirmou a galeria exata/);
});
test('menu revalida cada clique, mostra OK e remove anúncio-pai de todas as variações',()=>{
 const client=readFileSync(new URL('../public/pending-images.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(client,/verifyItem\(row\.itemId,\{force:true\}\)/);
 assert.match(client,/result\.imageCount>=9/);
 assert.match(client,/if\(result\.snapshot\)applySnapshot\(result\.snapshot\)/);
 assert.match(client,/confirmed\.set\(String\(id\),value\)/);
 assert.match(client,/if\(!exists\)await run\(\)/);
 assert.match(client,/globalThis\.PendingImagesUI=\{onOpen,refresh:/);
 assert.match(app,/PendingImagesUI\?\.verifyItem\?\.\(current\.itemId\)/);
 assert.match(html,/id="pendingImagesConfirmed"/);
 assert.match(server,/\/api\/shopee\/optimizer\/pending-images\/verify/);
});
