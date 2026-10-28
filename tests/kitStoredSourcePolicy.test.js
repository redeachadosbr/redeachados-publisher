import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {storedKitSourceState,KIT_IMPORT_STALE_WARNING_MS} from '../shopeeKitStoredSourcePolicy.js';

const now=Date.parse('2026-10-28T15:00:00Z');
test('catálogo e disponibilidade já importados não vencem em 24 horas',()=>{
 const catalog=now-30*24*3600000;
 const stock=now-29*24*3600000;
 const data=storedKitSourceState({catalogTimestamp:catalog,stockTimestamp:stock,
  verifiedSkuCount:2,now});
 assert.equal(data.ready,true);
 assert.equal(data.catalogImported,true);
 assert.equal(data.stockImported,true);
 assert.equal(data.catalogRecent,false);
 assert.equal(data.stockRecent,false);
 assert.equal(data.warningOutdated,true);
 assert.match(data.reason,/salvos e liberados/);
});
test('importar catálogo mais novo que estoque não obriga nova importação diária',()=>{
 const data=storedKitSourceState({catalogTimestamp:now-3600000,
  stockTimestamp:now-3*3600000,verifiedSkuCount:2,now});
 assert.equal(data.ready,true);
 assert.equal(data.stockAfterCatalog,false);
 assert.equal(data.warningOutdated,false);
});
test('ausência de catálogo ou de status verificável continua bloqueada',()=>{
 const withoutCatalog=storedKitSourceState({catalogTimestamp:0,stockTimestamp:now-100,
  verifiedSkuCount:10,now});
 assert.equal(withoutCatalog.ready,false);
 const noStock=storedKitSourceState({catalogTimestamp:now-100,stockTimestamp:0,
  verifiedSkuCount:0,now});
 assert.equal(noStock.ready,false);
 const noRows=storedKitSourceState({catalogTimestamp:now-100,stockTimestamp:now-100,
  verifiedSkuCount:0,now});
 assert.equal(noRows.ready,false);
 assert.equal(KIT_IMPORT_STALE_WARNING_MS,86400000);
});
test('interface disponibiliza uso do catálogo salvo e corrige texto da confirmação',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const stock=fs.readFileSync(new URL('../shopeeKitAvailability.js',import.meta.url),'utf8');
 assert.equal((html.match(/id="kitCostUseSaved"/g)||[]).length,1);
 assert.match(html,/id="kitCostConfirm"[^>]+><span>Confirmo que a coluna/);
 assert.match(css,/kit-cost-approve span/);
 assert.match(js,/kitCostUseSaved'\)\?\.addEventListener/);
 assert.match(js,/Catálogo WeDrop salvo e liberado/);
 assert.match(js,/kitDraftNeedsRefresh\|\|!kitStockReady/);
 assert.match(stock,/storedKitSourceState\(/);
 assert.doesNotMatch(stock,/ready=Boolean\(recent&&catalogRecent&&newerThanCatalog\)/);
});
