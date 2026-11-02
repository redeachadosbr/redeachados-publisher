import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessShopeeStableCommercialRecovery} from '../shopeeExecutionPlan.js';

const at=Date.now();
const live={item_id:58222065786,item_status:'NORMAL',item_name:'Mesa de Hóquei Infantil',
 category_id:112,image:{image_id_list:[1,2,3]},attribute_list:[],tax_info:{}};
const job=(phase,extra={})=>({
 state:'uncertain',updated_at:new Date(at-60000).toISOString(),
 plan:{itemId:'58222065786',commercialDiscount:{snapshot:{sku:'305350',gross:79.9,promo:59.9}}},
 result:{phase,imageIds:[1,2,3],...extra}
});

test('pré-escrita do desconto pode ser liberada somente após duas leituras do mesmo item',()=>{
 const outcome=assessShopeeStableCommercialRecovery(job('discount_ready'),live,structuredClone(live),at);
 assert.equal(outcome.stable,true);
 assert.equal(outcome.previewRequired,true);
 assert.equal(outcome.imagesInShop,3);
 assert.equal(outcome.previouslyUploaded,3);
});
test('escrita incerta de preço ou promoção nunca vira recuperação de prévia sem readback específico',()=>{
 for(const [phase,extra] of [
  ['discount_price_updating',{discountPriceStartedAt:at-30000}],
  ['discount_ready',{discountPriceStartedAt:at-30000}],
  ['discount_verifying',{discountStartedAt:at-30000}],
  ['discount_ready',{discountStartedAt:at-30000}]
 ]){
  assert.throws(()=>assessShopeeStableCommercialRecovery(job(phase,extra),live,live,at),
   /reconciliação específica/);
 }
});
test('duas leituras de anúncios distintos jamais liberam retomada',()=>{
 assert.throws(()=>assessShopeeStableCommercialRecovery(job('discount_ready'),live,
  {...live,item_id:123456789},at),/Item ID divergente/);
});
test('modal reutiliza executor, possui fechamento e um único comando sem requisições próprias',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const dialog=readFileSync(new URL('../public/optimizer-execution-dialog.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/optimizer-execution-dialog.css',import.meta.url),'utf8');
 assert.match(html,/optimizer-execution-dialog\.js\?v=/);
 assert.match(html,/optimizer-execution-dialog\.css\?v=/);
 assert.match(app,/RAExecutionPrimaryAction=async/);
 assert.match(app,/optimizerRootAuditRefresh\(true\)/);
 assert.match(dialog,/raExecutionDialogRun/);
 assert.match(dialog,/raExecutionDialogClose/);
 assert.match(dialog,/aria-modal/);
 assert.doesNotMatch(dialog,/fetch\(/);
 assert.match(css,/position:fixed/);
});
