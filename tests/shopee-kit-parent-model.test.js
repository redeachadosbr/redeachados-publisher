import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveKitMainListingModel} from '../shopeeKitOptimization.js';

const sku='TX24505K';
test('SKU principal no anúncio pai usa modelo interno 0, nao ID visual',()=>{
 const base={item_id:'58222633999',item_sku:sku,has_model:false,item_status:'NORMAL'};
 assert.equal(resolveKitMainListingModel({item:base,sku}),'0');
 assert.equal(resolveKitMainListingModel({item:{...base,has_model:true},
   models:[{model_id:'229453873888',model_sku:''}],sku}),'0');
});
test('SKU somente na variacao exige modelo exato e unico da API',()=>{
 const item={item_sku:'PARENT',has_model:true};
 const model={model_id:'229453873888',model_sku:sku,model_status:'NORMAL'};
 assert.equal(resolveKitMainListingModel({item,models:[model],sku}),'229453873888');
 assert.throws(()=>resolveKitMainListingModel({item,models:[model,model],sku}),/única variação/);
 assert.throws(()=>resolveKitMainListingModel({item,models:[{...model,model_sku:'OUTRA'}],sku}),/única variação/);
 assert.throws(()=>resolveKitMainListingModel({item:{...item,has_model:false},models:[model],sku}),/não corresponde/);
 assert.throws(()=>resolveKitMainListingModel({item,models:[{...model,model_status:'UNLIST'}],sku}),/não está ativa/);
});
test('a identidade do Item ID original permanece bloqueada e o modelo não é fixo',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const wizard=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const draft=readFileSync(new URL('../shopeeKitDraftStore.js',import.meta.url),'utf8');
 const find=server.slice(server.indexOf("app.get('/api/shopee/kits/optimization/find'"),
   server.indexOf("app.get('/api/shopee/optimizer/find'"));
 assert.match(find,/resolveKitMainListingModel/);
 assert.doesNotMatch(find,/if\(storedModelId!=='0'\)/);
 assert.match(draft,/\['0','229453873888'\]\.includes/);
 assert.doesNotMatch(wizard,/kitWizardConfirmedModelId/);
 assert.match(server,/String\(itemId\)!=='58222633999'/);
});
