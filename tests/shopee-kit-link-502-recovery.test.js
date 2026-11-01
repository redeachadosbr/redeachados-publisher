import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kitOptimizationLinkIsCurrent} from '../shopeeKitOptimization.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const server=source('server.js'),app=source('public/app.js');

test('readback somente local nunca dispara publicacao Shopee',()=>{
 const start=server.indexOf("app.get('/api/shopee/kits/optimization/link-status'");
 const end=server.indexOf("app.post('/api/shopee/kits/optimization/image'",start);
 assert.ok(start>0&&end>start,'endpoint de consulta deve ser independente');
 const route=server.slice(start,end);
 assert.match(route,/mustLogin,requireWeDropAdmin/);
 assert.match(route,/getWorkflowReview\(/);
 assert.match(route,/loadKitDraft\(/);
 assert.match(route,/kitOptimizationLinkIsCurrent\(/);
 assert.match(route,/draftLinked&&workflowLinked/);
 assert.doesNotMatch(route,/callShopeeShopApi|auditShopeeItem|saveWorkflowReview|recordKitOptimization/);
 assert.match(route,/marketplaceUpdated:false/);
});
test('502 consulta vinculo antes de repetir somente a preparacao local',()=>{
 const start=app.indexOf('const recoveryKey=[kitHandoff?.kitSku,sku,id,modelId]');
 const end=app.indexOf('if(linkedKit)optimizerKitResumeLinkRecovering.delete(recoveryKey);',start);
 assert.ok(start>=0&&end>start);
 const route=app.slice(start,end);
 assert.match(route,/link-status\?/);
 assert.match(route,/\\/api\\/shopee\\/kits\\/optimization\\/prepare/);
 assert.ok(route.includes('502|503|504'),'retries somente para indisponibilidade temporária');
 assert.match(route,/if\\(!retryable\\(error\\)\\)throw error/);
 assert.match(route,/optimizerKitResumeLinkRecovering\\.delete\\(recoveryKey\\)/);
 assert.match(route,/linked=await readBack/);
 assert.doesNotMatch(route,/\\/api\\/shopee\\/optimizer\\/execution\\/execute/);
});
test('vinculo parcial ou identidade/custos alterados nunca ficam autorizados',()=>{
 const link={kitSku:'KIT-126051011000-126088800001-TRC0663',sku:'1.26088.80.0001',
  mainSku:'1.26088.80.0001',itemId:'58222014306',modelId:'0',
  componentSkus:['1.26051.01.1000','1.26088.80.0001','TRC0663'],
  title:'Kit banheiro completo',description:'Descrição do kit',kitCost:61.27,grossPrice:183.80};
 const saved={kitSku:link.kitSku,skus:link.componentSkus,creative:{
  title:link.title,description:link.description},
  kit:{kitCost:link.kitCost,quote:{grossPrice:link.grossPrice}},optimization:link};
 assert.equal(kitOptimizationLinkIsCurrent(saved,link),true);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:null},link),false);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,creative:{...saved.creative,title:'Mudou'}},link),false);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,kit:{kitCost:62,quote:{grossPrice:link.grossPrice}}},link),false);
});
