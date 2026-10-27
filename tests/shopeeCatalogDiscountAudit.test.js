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