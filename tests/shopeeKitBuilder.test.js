import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryMatches,kitCatalog,kitSku,composeKit,suggestKits,kitCreative,kitPrompts,kitPlusResearchBrief,kitPlusContentPrompt} from '../shopeeKitBuilder.js';

test('kits por categoria: custo exato, somatório, dois finais 0/9, prompts e proteção por SKU',async()=>{
 const oldFetch=globalThis.fetch,oldBase=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://fixture-kits.supabase.co';
 process.env.SUPABASE_SECRET_KEY='fixture-key';
 const items=[
  {supplier_sku:'GA500',product_data:{name:'Garrafa de Água 500ml',category:'Garrafas e Térmicas',brand:'Genérica',imageUrl:'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/garrafa.jpg'}},
  {supplier_sku:'CO400',product_data:{name:'Copo para Água 400ml',category:'Copos, Jarras e Servir',imageUrl:'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/copo.jpg'}},
  {supplier_sku:'FR240',product_data:{name:'Frigideira de Cozinha',category:'Panelas e Frigideiras',imageUrl:'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/frigideira.jpg'}},
  {supplier_sku:'ES01',product_data:{name:'Espátula de Cozinha',category:'Utensílios e Talheres',imageUrl:'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/espatula.jpg'}}
 ];
 const costs=[['GA500',15],['CO400',8],['FR240',28],['ES01',7]].map(([supplier_sku,unit_cost])=>({supplier_sku,unit_cost}));
 globalThis.fetch=async(url)=>{
  const u=new URL(url);
  assert.equal(u.origin,'https://fixture-kits.supabase.co');
  assert.equal(u.searchParams.get('shop_id'),'eq.935127');
  if(u.pathname.endsWith('/shopee_wedrop_products')){
   const offset=Number(u.searchParams.get('offset')||0);
   return Response.json(items.slice(offset,offset+1000));
  }
  if(u.pathname.endsWith('/shopee_wedrop_costs')){
   const offset=Number(u.searchParams.get('offset')||0);
   return Response.json(costs.slice(offset,offset+1000));
  }
  if(u.pathname.endsWith('/shopee_optimizer_pricing_preferences')){
   return Response.json([{settings:{marginPct:15,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,flashPct:3}}]);
  }
  throw Error('Tabela inesperada no teste: '+u.pathname);
 };
 try{
  assert.equal(categoryMatches('Copos, Jarras e Servir','Cozinha'),true);
  assert.equal(categoryMatches('Garrafas e Térmicas','Brinquedos'),false);
  const list=await kitCatalog(935127,{category:'Cozinha'});
  assert.equal(list.catalogCount,4);
  assert.equal(list.matched,4);
  assert.equal(list.products[0].sku,'GA500');
  assert.equal(kitSku(['GA500','CO400']),'KIT-CO400-GA500');
  assert.equal(kitSku(['CO400','GA500']),kitSku(['GA500','CO400']));
  assert.equal(kitSku(['GA500','GA500']),'KIT-GA500-GA500');
  await assert.rejects(()=>composeKit(935127,['GA500','GA500']),/distintos/);
  await assert.rejects(()=>composeKit(935127,['GA500','INVENTADO']),/não encontrada/);
  const kit=await composeKit(935127,['GA500','CO400'],{marginPct:15,packing:2,shipping:1});
  assert.equal(kit.componentCost,23);
  assert.equal(kit.kitCost,26);
  assert.equal(kit.components[0].unitCost,15);
  assert.equal(kit.components[1].unitCost,8);
  assert.ok(kit.quote.netMarginPct>=15);
  assert.ok([0,9].includes(Math.round(kit.quote.marketplacePrice*100)%10));
  assert.ok([0,9].includes(Math.round(kit.quote.afterCoupon*100)%10));
  assert.equal(kit.shopeePublished,false);
  const prompts=kitPrompts(kit);
  assert.equal(prompts.length,9);
  for(const p of prompts){assert.match(p,/GA500/);assert.match(p,/CO400/);}
  const creative=await kitCreative(935127,kit,{ai:false});
  assert.ok(creative.title.includes('Garrafa'));
  assert.ok(creative.description.includes('CO400'));
  assert.equal(creative.prompts.length,9);
  const brief=await kitPlusResearchBrief(935127,{category:'Cozinha',size:2});
  assert.match(brief.prompt,/GA500/);
  assert.match(brief.prompt,/ES01/);
  assert.match(brief.prompt,/somente uma linha por kit/i);
  assert.ok(brief.candidatesCount>=2);
  const contentPrompt=kitPlusContentPrompt(kit);
  assert.match(contentPrompt,/GA500/);
  assert.match(contentPrompt,/CO400/);
  const proposed=await suggestKits(935127,{category:'Cozinha',size:2,ai:true,marginPct:15});
  assert.ok(proposed.results.length>=1);
  assert.equal(proposed.results[0].shopeePublished,false);
  assert.match(proposed.source,/heurística/);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldBase===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldBase;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
test('interface e endpoints de kits isolam publicações',async()=>{
 const fs=await import('node:fs');
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 for(const route of ['/api/shopee/kits/catalog','/api/shopee/kits/suggest',
  '/api/shopee/kits/prepare','/api/shopee/kits/image',
  '/api/shopee/kits/drafts','/api/shopee/kits/drafts/save','/api/shopee/kits/drafts/load'])assert.ok(server.includes(route));
 assert.match(server,/getValidAuth\(req\)/);
 assert.match(server,/verifiedSameOrigin\(req\)/);
 assert.match(html,/data-tab="kits"/);
 assert.match(html,/id="tab-kits"/);
 assert.match(html,/id="kitSuggest"/);
 assert.match(html,/id="kitGenerateAll"/);
 assert.match(app,/kits:\{slug:'kits'/);
 assert.match(html,/id="kitPlusResearch"/);
 assert.match(html,/id="kitPlusImport"/);
 assert.match(html,/id="kitPlusTextResult"/);
 assert.match(html,/id="kitOpenContentPrompt"/);
 assert.match(html,/ChatGPT Plus · Sem API/);
 const builder=fs.readFileSync(new URL('../shopeeKitBuilder.js',import.meta.url),'utf8');
 const browser=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.doesNotMatch(builder,/api\.openai\.com|openAiApiKey|chatJson\(/);
 assert.doesNotMatch(browser,/\/api\/shopee\/kits\/image|generatePhoto\(/);
 assert.match(server,/Geração paga desativada para kits/);
 assert.match(server,/\/api\/shopee\/kits\/plus-brief/);
 assert.match(server,/\/api\/shopee\/kits\/plus-import/);
 assert.match(server,/\/api\/shopee\/kits\/plus-content/);
});

test('barra manual de margem dos kits é equivalente ao controle da Otimização',async()=>{
 const fs=await import('node:fs');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const engine=fs.readFileSync(new URL('../shopeeKitBuilder.js',import.meta.url),'utf8');
 assert.match(html,/id="optimizerQuickMargin"[^>]*type="range"[^>]*min="0" max="70"/);
 assert.match(html,/id="kitMargin"[^>]*type="range" min="0" max="70" step="1"/);
 assert.match(html,/id="kitMarginLabel"[^>]*>15%/);
 assert.match(html,/id="kitMarginPlus"/);
 assert.match(html,/id="kitMarginMinus"/);
 assert.doesNotMatch(html,/id="kitMargin"\s+type="number"/);
 assert.match(css,/kit-margin-slider-group input\[type=range\]/);
 assert.match(css,/kit-margin-stepper/);
 assert.match(js,/addEventListener\('input',\(\)=>setKitMargin/);
 assert.match(js,/scheduleKitMarginReprice\(\)/);
 assert.match(js,/setTimeout\(\(\)=>void repriceKitMargin\(marginRevision\),420\)/);
 assert.match(js,/api\('\/api\/shopee\/kits\/plus-import'/);
 assert.match(js,/api\('\/api\/shopee\/kits\/prepare'/);
 assert.match(js,/refreshKitPrices\(prepared\.kit\)/);
 assert.match(js,/if\(marginUpdatePending\)/);
 assert.match(engine,/n<0\|\|n>70/);
});
