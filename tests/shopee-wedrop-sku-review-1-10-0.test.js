import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizedSku,candidateReason,suggestSkuCandidates} from '../wedropSkuReview.js';
import {matchWeDropCosts} from '../wedropCosts.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('sugestões apenas orientam, não fazem correção silenciosa',()=>{
 assert.equal(normalizedSku(' 1792-UNI '),'1792UNI');
 assert.equal(candidateReason('991-B','991-b').rank,1);
 assert.equal(candidateReason('894939 - 48','89493948').rank,2);
 assert.equal(candidateReason('964517','CO6964517').rank,3);
 assert.equal(candidateReason('991-B','OTHER-RANDOM'),null);
 assert.equal(candidateReason('991-B','991-B'),null);
 const costs=[
  {supplier_sku:'991-b',unit_cost:11.99},
  {supplier_sku:'991-B-X',unit_cost:12.4},
  {supplier_sku:'RANDOM',unit_cost:15}
 ];
 const candidates=suggestSkuCandidates('991-B',costs);
 assert.equal(candidates[0].supplierSku,'991-b');
 assert.ok(candidates[0].reason.includes('maiúsculas'));
 assert.ok(candidates.every(x=>x.supplierSku!=='RANDOM'));
 assert.ok(candidates.every(x=>!('confidence' in x)));
});

test('vínculo depende de shop/item/model/SKU original e custo cadastrado',()=>{
 const items=[
  {item_id:100,item_name:'Kit proteção',sku:'',has_model:true,price:90},
  {item_id:101,item_name:'Escorredor',sku:'964517',has_model:false,price:81}
 ];
 const models=[{item_id:100,model_id:123,model_sku:'1792-UNI',price:80}];
 const costs=[{supplier_sku:'1792UNI',unit_cost:27},{supplier_sku:'CO6964517',unit_cost:30}];
 const links=[{item_id:100,model_id:123,shopee_sku:'1792-UNI',supplier_sku:'1792UNI'}];
 let c=matchWeDropCosts(items,models,costs,{links});
 assert.equal(c.totals.matched,1);
 assert.equal(c.totals.missingCost,1);
 assert.equal(c.rows.find(x=>x.sku==='1792-UNI').unitCost,27);
 assert.equal(c.rows.find(x=>x.sku==='1792-UNI').linkedByReview,true);
 const stale=matchWeDropCosts(items,[{...models[0],model_sku:'1792-B'}],costs,{links});
 assert.equal(stale.totals.matched,0,'SKU alterado na Shopee invalida o vínculo antigo');
 const wrongModel=matchWeDropCosts(items,models,costs,{links:[{...links[0],model_id:456}]});
 assert.equal(wrongModel.totals.matched,0);
 const unapproved=matchWeDropCosts(items,models,costs);
 assert.equal(unapproved.totals.matched,0);
});

test('interface exibe lista e ações reais por produto',()=>{
 const wd=html.slice(html.indexOf('id="tab-wedrop"'),html.indexOf('id="tab-finance"'));
 for(const id of [
  'wedropSkuReview','wedropReviewRefreshBtn','wedropReviewCards','wedropReviewMessage',
  'wedropReviewedLinks','wedropReviewedList','wedropReviewedCount','wedropGotoPending',
  'wedropCompared','wedropMissingCost','wedropImported','wedropStoredCatalog'
 ]){
  assert.equal((wd.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(js,/\/api\/shopee\/wedrop\/sku-review/);
 assert.match(js,/\/api\/shopee\/wedrop\/sku-search/);
 assert.match(js,/\/api\/shopee\/wedrop\/sku-link/);
 assert.match(js,/\/api\/shopee\/wedrop\/sku-unlink/);
 assert.match(js,/window\.confirm\(/);
 assert.match(js,/não será modificado/);
 assert.match(server,/mustLogin,requireWeDropAdmin/);
 assert.match(server,/verifiedSameOrigin/);
});

test('layout compacto e responsivo preserva telas separadas',()=>{
 assert.match(css,/#tab-wedrop \.wedrop-stats-compact/);
 assert.match(css,/min-height:91px/);
 assert.match(css,/#tab-wedrop \.sku-review-grid/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(hover:none\),\(prefers-reduced-motion:reduce\)/);
 for(const id of ['tab-products','tab-orders','tab-ads','tab-finance','tab-settings']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(html,/style\.css\?v=1\.11\.0/);
 assert.match(html,/app\.js\?v=1\.11\.0/);
});
