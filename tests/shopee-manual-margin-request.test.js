import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('main Shopee SKU pricing POST forwards manual slider priority',()=>{
 const code=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=code.indexOf('async function shPricePrepare(');
 const end=code.indexOf('let shQuickMarginTimer=',start);
 assert.ok(start>0&&end>start);
 const body=code.slice(start,end);
 assert.match(body,/\/api\/shopee\/optimizer\/pricing\/prepare/);
 assert.match(body,/marginOverride:shManualMarginChoice/);
});
