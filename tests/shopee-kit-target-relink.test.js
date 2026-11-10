import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAuthorizedKitTargetCorrection} from '../shopeeKitDraftStore.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const old={
 kitSku:'KIT-TX24505K-TX24508E',
 skus:['TX24505K','TX24508E'],
 optimization:{sku:'TX24505K',mainSku:'TX24505K',itemId:'58222623880',modelId:'239453860780'}
};
const desired={
 kitSku:'KIT-TX24505K-TX24508E',
 sku:'TX24505K',mainSku:'TX24505K',itemId:'58222633999',modelId:'229453873888',
 componentSkus:['TX24505K','TX24508E']
};
test('autoriza somente migração expressa, preservando composição e modelo da mochila',()=>{
 assert.equal(isAuthorizedKitTargetCorrection(old,desired),true);
 assert.equal(isAuthorizedKitTargetCorrection({...old,optimization:{...old.optimization,modelId:'0'}},desired),true);
 assert.equal(isAuthorizedKitTargetCorrection({...old,optimization:{...old.optimization,itemId:'987654321'}},desired),false);
 assert.equal(isAuthorizedKitTargetCorrection(old,{...desired,itemId:'58222623880'}),false);
 assert.equal(isAuthorizedKitTargetCorrection(old,{...desired,modelId:'0'}),true);
 assert.equal(isAuthorizedKitTargetCorrection(old,{...desired,modelId:'45678'}),false);
 assert.equal(isAuthorizedKitTargetCorrection({...old,skus:['TX24508E','TX24505K']},desired),false);
 assert.equal(isAuthorizedKitTargetCorrection(old,{...desired,componentSkus:['TX24505K']}),false);
});
test('rota confere o anuncio ao vivo antes de migrar e impede execucao no anuncio errado',()=>{
 const server=source('server.js');
 const prepare=server.slice(server.indexOf("app.post('/api/shopee/kits/optimization/prepare'"),
  server.indexOf("app.get('/api/shopee/kits/optimization/link-status'"));
 assert.ok(prepare.indexOf('auditShopeeItem(')<prepare.indexOf('recordKitOptimization('));
 assert.ok(prepare.indexOf('readShopeeExecution(auth.shopId,old.itemId,old.modelId)')<prepare.indexOf('recordKitOptimization('));
 assert.match(prepare,/String\(itemId\)!=='58222633999'/);
 const execution=server.slice(server.indexOf("app.post('/api/shopee/optimizer/execution/execute'"));
 assert.match(execution,/String\(itemId\)!=='58222633999'/);
});
test('a interface recupera o Item ID e modelo oficiais, nao o handoff anterior',()=>{
 const b=source('public/kit-builder.js'),existing=source('public/kit-existing-optimization.js');
 const service=source('shopeeKitPublicationService.js');
 assert.doesNotMatch(b,/kitWizardConfirmedModelId/);
 assert.match(existing,/\/api\/shopee\/kits\/optimization\/find/);
 assert.match(service,/if\(kitSku==='KIT-TX24505K-TX24508E'\)/);
});
