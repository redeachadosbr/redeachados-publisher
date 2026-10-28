import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeKitLogistics} from '../shopeeKitLogisticsDraft.js';
import {createKitLogisticsPersistence} from '../public/kit-logistics-draft-ui.js';

const kit={kitSku:'KIT-278CHOCALHO-310200',
 components:[{sku:'310200'},{sku:'278CHOCALHO'}]};
test('peso e medidas reais preservados em formulário parcial, sem pré-encomenda',()=>{
 const fields=normalizeKitLogistics({
  mainSku:'310200',logisticId:'12345678',weightKg:0.354,
  lengthCm:16,widthCm:28,heightCm:36,
  autoSyncDts:false,preOrder:true,daysToShip:7
 },kit);
 assert.deepEqual([fields.weightKg,fields.lengthCm,fields.widthCm,fields.heightCm],
  [0.354,16,28,36]);
 assert.equal(fields.mainSku,'310200');
 assert.equal(fields.logisticId,'12345678');
 assert.equal(fields.preOrder,false);
 assert.equal(fields.daysToShip,0);
 assert.ok(Date.parse(fields.updatedAt)>0);
});
test('nunca aceitar SKU de fora, canal falso ou dimensões inválidas',()=>{
 const fields=normalizeKitLogistics({
  mainSku:'XXXXX',logisticId:'abc',weightKg:100,
  lengthCm:-1,widthCm:'',heightCm:10.5,autoSyncDts:'true'
 },kit);
 assert.equal(fields.mainSku,'');
 assert.equal(fields.logisticId,'');
 assert.equal(fields.weightKg,null);
 assert.equal(fields.lengthCm,null);
 assert.equal(fields.widthCm,null);
 assert.equal(fields.heightCm,null);
 assert.equal(fields.autoSyncDts,false);
});
function mockEnvironment(){
 const ids={};
 for(const id of ['kitMainSku','kitLogisticId','kitWeightKg','kitLengthCm','kitWidthCm',
  'kitHeightCm','kitAutoSyncDts']){
  ids[id]={value:'',checked:false,options:[]};
 }
 ids.kitMainSku.options=[{value:''},{value:'310200'},{value:'278CHOCALHO'}];
 ids.kitLogisticId.options=[{value:''}];
 const values=new Map();
 globalThis.document={querySelector:selector=>ids[selector.slice(1)]};
 globalThis.localStorage={
  setItem:(key,value)=>values.set(key,value),
  getItem:key=>values.get(key)||null
 };
 return {ids,values};
}
test('reabre medidas do mesmo kit após reset e não transfere ao próximo kit',()=>{
 const {ids}=mockEnvironment();
 let sku=kit.kitSku,saved=false;
 const keeper=createKitLogisticsPersistence({
  context:()=>({sku,saved}),post:async()=>({saved:true}),
  notify:()=>{},disablePreOrder:()=>{}
 });
 ids.kitMainSku.value='310200';
 ids.kitWeightKg.value='0.354';
 ids.kitLengthCm.value='16';
 ids.kitWidthCm.value='28';
 ids.kitHeightCm.value='36';
 keeper.queue();
 keeper.reset();
 assert.equal(ids.kitWeightKg.value,'');
 keeper.restore(null,sku);
 assert.deepEqual([ids.kitWeightKg.value,ids.kitLengthCm.value,
  ids.kitWidthCm.value,ids.kitHeightCm.value],['0.354','16','28','36']);
 sku='KIT-OTHER-1234';keeper.reset();keeper.restore(null,sku);
 assert.deepEqual([ids.kitWeightKg.value,ids.kitLengthCm.value,
  ids.kitWidthCm.value,ids.kitHeightCm.value],['','','','']);
});
test('alterações em rascunho salvo disparam atualização de logística na loja',async()=>{
 const {ids}=mockEnvironment();
 const calls=[],messages=[];
 const keeper=createKitLogisticsPersistence({
  context:()=>({sku:kit.kitSku,saved:true}),
  post:async(path,payload)=>{calls.push({path,payload});return {saved:true}},
  notify:(message)=>messages.push(message),disablePreOrder:()=>{}
 });
 ids.kitWeightKg.value='0.354';ids.kitLengthCm.value='16';ids.kitWidthCm.value='28';ids.kitHeightCm.value='36';
 keeper.queue();
 await new Promise(resolve=>setTimeout(resolve,720));
 await keeper.flush();
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/api/shopee/kits/drafts/logistics');
 assert.equal(calls[0].payload.body.logistics.weightKg,0.354);
 assert.ok(messages.some(x=>x.includes('salvos automaticamente')));
});
test('botão de vídeo fica clicável com arquivo válido, mesmo se kit precisar ser salvo',()=>{
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const store=fs.readFileSync(new URL('../shopeeKitDraftStore.js',import.meta.url),'utf8');
 assert.match(js,/\$\('#kitVideoSendShopee'\)\.disabled=!valid\|\|kitVideoBusy\|\|Boolean\(kitItemId\)\|\|sent/);
 assert.match(js,/if\(!kitSaved\)\{\s*kitVideoMessage\('Salvando rascunho/);
 assert.match(js,/const saved=await saveDraft\(\)/);
 assert.match(js,/kitLogisticsKeeper\.restore\(d\.logistics,kitSku\)/);
 assert.match(js,/kitLogisticsKeeper\.apply\(draftLogistics\)/);
 assert.match(server,/kit:review\.kit,logistics:stored\.logistics\|\|null/);
 assert.match(store,/logistics:row\.draft\?\.logistics\|\|null/);
 assert.match(store,/logistics:current\.logistics\|\|null/);
 assert.match(server,/kits\/drafts\/logistics'/);
});
