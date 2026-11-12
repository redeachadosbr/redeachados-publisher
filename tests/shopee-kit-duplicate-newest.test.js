import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNewestVerifiedSkuTarget} from '../shopeeSkuActiveResolver.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('SKU duplicada: data real vence número maior de Item ID',()=>{
 const res=selectNewestVerifiedSkuTarget([
  {itemId:'99999999999',status:'NORMAL',createTime:1700000000},
  {itemId:'58222834055',status:'NORMAL',createTime:1800000000}
 ]);
 assert.equal(res.preferredItemId,'58222834055');
});
test('data ausente, empate e anúncio excluído não são escolhas seguras',()=>{
 assert.equal(selectNewestVerifiedSkuTarget([
  {itemId:'11111111111',status:'NORMAL',createTime:1800000000},
  {itemId:'22222222222',status:'NORMAL'}
 ]).preferredItemId,null);
 assert.equal(selectNewestVerifiedSkuTarget([
  {itemId:'11111111111',status:'NORMAL',createTime:1800000000},
  {itemId:'22222222222',status:'NORMAL',createTime:1800000000}
 ]).preferredItemId,null);
 assert.equal(selectNewestVerifiedSkuTarget([
  {itemId:'11111111111',status:'SELLER_DELETE',createTime:1990000000},
  {itemId:'22222222222',status:'NORMAL',createTime:1800000000}
 ]).preferredItemId,'22222222222');
});
test('ficha de kit usa descoberta exclusiva do kit e informa preenchimento real',()=>{
 const existing=source('public/kit-existing-optimization.js');
 const server=source('server.js');
 const ui=source('public/app.js');
 assert.match(existing,/\/api\/shopee\/kits\/optimization\/find\?/);
 assert.match(existing,/data\.preferredVerifiedTarget/);
 assert.match(server,/selectNewestVerifiedSkuTarget\(matches\)/);
 assert.match(ui,/preenchido\(s\) no rascunho com fontes da própria SKU/);
});
