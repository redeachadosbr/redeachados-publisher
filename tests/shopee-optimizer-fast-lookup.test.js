import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('typing a new SKU immediately cancels an older in-flight request',()=>{
 assert.match(app,/optimizerSkuRequest\.abort\(\)/);
 assert.match(app,/\+\+optimizerSkuLookupSerial;\s*optimizerCancelSkuLookup\(\)/);
 assert.match(app,/optimizerSkuRequest===controller/);
 assert.match(app,/AbortSignal\.any\(\[controller\.signal,AbortSignal\.timeout/);
 assert.doesNotMatch(app,/optimizerSkuPending/);
});
test('short partial SKU does not trigger automatic expensive lookup',()=>{
 assert.match(app,/if\(value\.length<4\)/);
 assert.match(app,/setTimeout\(\(\)=>void optimizerFindSku\(\),350\)/);
 assert.match(app,/if\(event\.key==='Enter'\)/);
});
test('fast lookup offers explicit deeper lookup and preserves full verification',()=>{
 assert.match(app,/Busca aprofundada/);
 assert.match(app,/optimizerFindSku\(\{deep:true\}\)/);
 assert.match(server,/const deep=req\.query\.deep==='1'/);
 assert.match(server,/findLiveShopeeSku\(cfg,auth,callShopeeShopApi,sku,\{fastOnly:!deep\}\)/);
 assert.match(server,/canDeepSearch:!deep&&!matches\.length/);
});

test('busca vazia usa consulta SKU direta e nao varre 15 paginas antes da precificacao',()=>{
 assert.match(server,/if\(!deep&&!cached\.length\)/);
 assert.match(server,/fastOnly:true/);
 assert.match(server,/lookup:'direct_not_found'/);
 assert.match(server,/verifiedLive:false/);
 assert.match(app,/void shPricePreviewSupplierSku\(sku,serial\)/);
 assert.match(app,/pricingError/);
 assert.match(app,/Custo WeDrop/);
});
