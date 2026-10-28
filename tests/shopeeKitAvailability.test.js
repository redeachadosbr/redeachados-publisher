import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWeDropAvailabilityCsv,normalizeSupplierAvailability,clearKitStockCache,
 readKitStockSnapshot,assertKitComponentsAvailable,assertKitStockSnapshot} from '../shopeeKitAvailability.js';
import {kitCatalog,composeKit,suggestKits,kitPlusResearchBrief} from '../shopeeKitBuilder.js';
import {identifyWeDropLayout,prepareWeDropProducts} from '../wedropCsv.js';
const example='SKU;Disponibilidade\nSKU-OK;DISPONÍVEL\nSKU-FAIL;INDISPONÍVEL\n';
test('Disponível/indisponível estritos; jamais confundir estado do fornecedor',()=>{
 assert.equal(normalizeSupplierAvailability(' DISPONÍVEL '),'DISPONIVEL');
 assert.equal(normalizeSupplierAvailability('Indisponivel'),'INDISPONIVEL');
 for(const bad of ['SP','SC','RJ','10','0','sim','não','EM ESTOQUE','ATIVO','Pendente',''])
  assert.equal(normalizeSupplierAvailability(bad),null,bad);
 const x=parseWeDropAvailabilityCsv(example);
 assert.equal(x.total,2);
 assert.equal(x.availableCount,1);
 assert.equal(x.unavailableCount,1);
 assert.throws(()=>parseWeDropAvailabilityCsv('SKU;Estado do fornecedor\nSKU-OK;SP\n'),/SKU.*Disponibilidade/);
 assert.throws(()=>parseWeDropAvailabilityCsv('SKU;Disponibilidade\nSKU-OK;EM ESTOQUE\n'),/desconhecida/);
 assert.throws(()=>parseWeDropAvailabilityCsv('SKU;Disponibilidade\nSKU-OK;DISPONÍVEL\nSKU-OK;INDISPONÍVEL\n'),/conflitante/);
});
test('Catálogo 17 colunas preserva a disponibilidade, 16 antigas não comprovam estoque',()=>{
 const base=['SKU','Nome do Produto','Marca','Categoria','Fornecedor','Estado do fornecedor','Preço','EAN','NCM','CEST',
 'Peso (kg)','Largura (cm)','Altura (cm)','Comprimento (cm)','Peso da Caixa (kg)','Imagem Principal'];
 assert.equal(identifyWeDropLayout(base).schema,'wedrop-catalog-16');
 assert.equal(identifyWeDropLayout([...base,'Disponibilidade']).schema,'wedrop-catalog-17-stock');
 const row=['SKU-OK','Jogo de copos','','Copos, Jarras e Servir','Fornecedor X','SP','12,00','','','','','','','','','','DISPONÍVEL'];
 assert.equal(prepareWeDropProducts([...base,'Disponibilidade'],[row],new Set(['SKU-OK']))[0].data.rawAvailability,'DISPONÍVEL');
});
test('Catálogo e estoque importados continuam válidos após 24 horas, sem liberar SKUs indisponíveis',async()=>{
 const shopId=852701219,backup={
  url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,fetch:globalThis.fetch
 };
 process.env.SUPABASE_URL='https://stock-fixture.supabase.co';
 process.env.SUPABASE_SECRET_KEY='key-fixture';
 let stale=false,unknown=false;
 const products=[
  {supplier_sku:'SKU-OK',product_data:{name:'Carrinho brinquedo',category:'Carrinhos e Pistas'}},
  {supplier_sku:'SKU-FAIL',product_data:{name:'Pista carrinho',category:'Carrinhos e Pistas'}},
  {supplier_sku:'SKU-UNKNOWN',product_data:{name:'Brinquedo extra',category:'Carrinhos e Pistas'}}
 ];
 globalThis.fetch=async raw=>{
  const u=new URL(raw);
  assert.equal(u.searchParams.get('shop_id'),'eq.'+shopId);
  const path=u.pathname,now=new Date().toISOString(),yesterday=new Date(Date.now()-26*3600000).toISOString();
  if(path.endsWith('shopee_wedrop_products'))return Response.json(Number(u.searchParams.get('offset')||0)===0?products:[]);
  if(path.endsWith('shopee_wedrop_costs'))return Response.json(products.map(p=>({
    supplier_sku:p.supplier_sku,unit_cost:12
  })));
  if(path.endsWith('shopee_wedrop_availability_imports'))
   return Response.json([{batch_hash:'fixture',imported_count:2,available_count:1,unavailable_count:1,
     last_success_at:stale?yesterday:now}]);
  if(path.endsWith('shopee_wedrop_availability'))return Response.json([
   {supplier_sku:'SKU-OK',availability:'DISPONIVEL',batch_hash:unknown?'old':'fixture',checked_at:now},
   {supplier_sku:'SKU-FAIL',availability:'INDISPONIVEL',batch_hash:'fixture',checked_at:now}
  ]);
  if(path.endsWith('shopee_wedrop_sync_state'))
   return Response.json([{last_success_at:stale?yesterday:now,status:'success'}]);
  if(path.endsWith('shopee_optimizer_pricing_preferences'))
   return Response.json([{settings:{marginPct:15,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,flashPct:3}}]);
  throw Error('Unexpected table '+path);
 };
 try{
  const catalog=await kitCatalog(shopId,{category:'Brinquedos'});
  assert.equal(catalog.stock.ready,true);
  assert.equal(catalog.catalogCount,3);
  assert.equal(catalog.availableMatched,1);
  assert.deepEqual(catalog.products.map(x=>x.sku),['SKU-OK']);
  const stock=await readKitStockSnapshot(shopId);
  assertKitComponentsAvailable([{sku:'SKU-OK',stockStatus:'DISPONIVEL'}],stock);
  assert.throws(()=>assertKitComponentsAvailable([{sku:'SKU-FAIL',stockStatus:'INDISPONIVEL'}],stock),/INDISPONÍVEL/);
  await assert.rejects(()=>composeKit(shopId,['SKU-OK','SKU-FAIL']),/INDISPONÍVEL/);
  await assert.rejects(()=>composeKit(shopId,['SKU-OK','SKU-UNKNOWN']),/sem disponibilidade/);
  const proposed=await suggestKits(shopId,{category:'Brinquedos',size:2});
  assert.equal(proposed.results.length,0,'não pode combinar um SKU disponível com outro indisponível');
  const brief=await kitPlusResearchBrief(shopId,{category:'Brinquedos',size:2});
  assert.match(brief.prompt,/SKU-OK/);
  assert.doesNotMatch(brief.prompt,/SKU-FAIL|SKU-UNKNOWN/);
  stale=true;clearKitStockCache(shopId);
  const overdue=await readKitStockSnapshot(shopId);
  assert.equal(overdue.ready,true,'as importações não expiram depois de 24 horas');
  assert.equal(overdue.warningOutdated,true);
  assert.equal(overdue.catalogRecent,false);
  assert.equal(overdue.stockRecent,false);
  assertKitStockSnapshot(overdue);
  assert.equal(overdue.map.get('SKU-OK'),'DISPONIVEL');
  await assert.rejects(()=>composeKit(shopId,['SKU-OK','SKU-FAIL']),/INDISPONÍVEL/);
  stale=false;unknown=true;clearKitStockCache(shopId);
  const now=await readKitStockSnapshot(shopId);
  assert.equal(now.ready,true);
  assert.notEqual(now.map.get('SKU-OK'),'DISPONIVEL');
  await assert.rejects(()=>composeKit(shopId,['SKU-OK','SKU-FAIL']),/sem disponibilidade/);
 }finally{
  clearKitStockCache(shopId);
  globalThis.fetch=backup.fetch;
  for(const [name,value] of [['SUPABASE_URL',backup.url],['SUPABASE_SECRET_KEY',backup.key]])
   if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
});
