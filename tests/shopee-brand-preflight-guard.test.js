import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertShopeeSupplierBrand} from '../shopeeMatrixRules.js';
test('seller cannot execute listing with Novo as brand from NEW condition',()=>{
 const record={attributeAudit:{attributes:[{id:100413,name:'Marca',values:[{name:'Novo'}]}]}};
 const supplier={product_data:{brand:'Top Rio'}};
 assert.throws(()=>assertShopeeSupplierBrand({record,attributes:[],supplier}),/Marca.*Novo.*Top Rio/);
 assert.doesNotThrow(()=>assertShopeeSupplierBrand({record,
   attributes:[{attributeId:100413,values:[{valueName:'Top Rio'}]}],supplier}));
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const a of [server.indexOf("app.post('/api/shopee/optimizer/execution/prepare'"),
                server.indexOf("app.post('/api/shopee/optimizer/execution/execute'")]){
  const segment=server.slice(a,a+4100);
  assert.match(segment,/assertShopeeSupplierBrand\(\{record,attributes:reviewState\.stages\?\.technical\?\.reviewed\?/);
 }
});
