import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryMatches,kitCatalog,kitSku,composeKit,suggestKits,rankKitIdeaProducts,suggestKitsForIdea,assessKitBuyerFit,kitCreative,kitPrompts,kitPlusResearchBrief,kitPlusContentPrompt} from '../shopeeKitBuilder.js';
import {clearKitStockCache} from '../shopeeKitAvailability.js';

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
  if(u.pathname.endsWith('/shopee_wedrop_availability_imports'))
   return Response.json([{last_success_at:new Date().toISOString(),batch_hash:'stock-fixture-1',
    available_count:4,unavailable_count:0,imported_count:4}]);
  if(u.pathname.endsWith('/shopee_wedrop_sync_state'))
   return Response.json([{status:'success',last_success_at:new Date().toISOString()}]);
  if(u.pathname.endsWith('/shopee_wedrop_availability')){
   const offset=Number(u.searchParams.get('offset')||0);
   return Response.json(items.map(p=>({
    supplier_sku:p.supplier_sku,availability:'DISPONIVEL',batch_hash:'stock-fixture-1',
    checked_at:new Date().toISOString()
   })).slice(offset,offset+1000));
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
  assert.ok(brief.candidateSkus.includes('GA500'));
  const ideaBrief=await kitPlusResearchBrief(935127,{category:'Cozinha',size:2,idea:'garrafa e copo'});
  assert.ok(ideaBrief.candidateSkus.includes('GA500'));
  assert.ok(ideaBrief.candidateSkus.includes('CO400'));
  assert.ok(ideaBrief.candidateSkus.includes('FR240'));
  assert.equal(ideaBrief.candidatesCount,4);
  assert.equal(ideaBrief.truncated,false);
  assert.equal(ideaBrief.requiresAttachment,false);
  assert.match(ideaBrief.prompt,/Ideia opcional de kit:/);
  assert.match(brief.prompt,/GA500/);
  assert.match(brief.prompt,/ES01/);
  assert.match(brief.prompt,/JSON válido/i);
  assert.ok(brief.candidatesCount>=2);
  const contentPrompt=kitPlusContentPrompt(kit);
  assert.match(contentPrompt,/GA500/);
  assert.match(contentPrompt,/CO400/);
  const proposed=await suggestKits(935127,{category:'Cozinha',size:2,ai:true,marginPct:15});
  assert.ok(proposed.results.length>=1);
  assert.equal(proposed.results[0].shopeePublished,false);
  assert.match(proposed.source,/heurística/);
 }finally{
  clearKitStockCache(935127);
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
 assert.match(server,/\/api\/shopee\/kits\/image\/status/);
 assert.match(server,/req\.body\?\.confirmPaidApi!==true/);
 assert.match(server,/generateKitImage\(/);
 assert.match(html,/ChatGPT Plus · Sem API/);
 assert.match(server,/\/api\/shopee\/kits\/plus-brief/);
 assert.match(server,/\/api\/shopee\/kits\/plus-import/);
 assert.match(server,/\/api\/shopee\/kits\/plus-content/);
 assert.match(server,/\/api\/shopee\/kits\/availability\/import/);
 assert.match(html,/id="kitStockGate"/);
 assert.match(html,/id="kitStockCsv"/);
 assert.match(html,/id="kitStockImport"/);
 assert.match(html,/id="kitStockReload"/);
 assert.match(browser,/if\(!kitStockReady\)/);
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

test('ideias de kits: identifica SKUs distintas com complementaridade e não inventa catálogo',()=>{
 const products=[
  {sku:'T1',name:'Tábua de Madeira para Churrasco 30cm',category:'Utensílios e Talheres',unitCost:22},
  {sku:'P1',name:'Pegador de Carnes em Aço Inox',category:'Utensílios e Talheres',unitCost:10},
  {sku:'T2',name:'Tábua de Madeira para Churrasco 40cm',category:'Utensílios e Talheres',unitCost:29},
  {sku:'C1',name:'Cafeteira Francesa 300 ml',category:'Copos, Jarras e Servir',unitCost:19},
  {sku:'F1',name:'Faca para Churrasco',category:'Utensílios e Talheres',unitCost:15}
 ];
 const result=rankKitIdeaProducts('quero um kit para churrasco',products);
 assert.ok(result.products.some(x=>x.sku==='T1'));
 assert.ok(result.products.some(x=>x.sku==='P1'));
 assert.ok(result.products.some(x=>x.sku==='F1'));
 assert.ok(!result.products.some(x=>x.sku==='C1'));
 assert.throws(()=>rankKitIdeaProducts('kit e para',products),/palavra útil/);
 assert.ok(rankKitIdeaProducts('kit para café',products).products.some(x=>x.sku==='C1'));
});
test('rotas de kits por ideia reutilizam composição de estoque e aprovação sem publicar',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const frontend=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(server,/\/api\/shopee\/kits\/idea-search/);
 assert.match(server,/marketplaceUpdated:false/);
 assert.match(ui,/id="kitIdea"/);
 assert.match(frontend,/api\('\/api\/shopee\/kits\/idea-search'/);
});

test('motor comercial só recomenda kits de uso conjunto, não combinações aleatórias',()=>{
 const item=(sku,name,category='Utensílios e Talheres',unitCost=20)=>({sku,name,category,unitCost});
 const cutting=item('T1','Tábua de Madeira para Churrasco 30cm');
 const tong=item('P1','Pegador de Carne Inox');
 const knife=item('F1','Faca para Churrasco');
 const pan=item('FR24','Frigideira Cerâmica 24cm Azul','Panelas e Frigideiras');
 const pan26=item('FR26','Frigideira Cerâmica 26cm Azul','Panelas e Frigideiras');
 const exercise=item('EX1','Roda para abdominal com pegadores ergonômicos','Utensílios e Talheres');
 const perfume=item('PE1','Perfume Floral 100ml','Perfumaria');
 assert.equal(assessKitBuyerFit([cutting,tong]).ok,true);
 assert.equal(assessKitBuyerFit([cutting,tong,knife]).ok,true);
 assert.equal(assessKitBuyerFit([cutting,tong,perfume]).ok,false);
 assert.equal(assessKitBuyerFit([cutting,exercise]).ok,false);
 assert.equal(assessKitBuyerFit([pan,pan26]).ok,false);
 assert.equal(assessKitBuyerFit([cutting,item('T2','Tábua Corte Churrasco 40cm')]).ok,false);
 assert.equal(assessKitBuyerFit([cutting,cutting]).ok,false);
 assert.match(assessKitBuyerFit([cutting,tong]).evidence,/vendas e buscas não verificadas/);
});
test('kits por ocasião de compra não misturam caderno com panela nem produtos fitness',()=>{
 const item=(sku,name,category)=>({sku,name,category,unitCost:20});
 const backpack=item('M1','Mochila Escolar Infantil','Mochilas, Estojos e Lancheiras');
 const notebook=item('N1','Caderno Universitário 10 Matérias','Cadernos');
 const pot=item('FP','Panela Inox 2 Litros','Panelas e Frigideiras');
 const bottle=item('G1','Garrafa para Água 500ml','Garrafas e Térmicas');
 const mug=item('C1','Copo Água 300ml','Copos, Jarras e Servir');
 assert.equal(assessKitBuyerFit([backpack,notebook]).ok,true);
 assert.equal(assessKitBuyerFit([backpack,pot]).ok,false);
 assert.equal(assessKitBuyerFit([bottle,mug]).ok,true);
 assert.equal(assessKitBuyerFit([pot,mug]).ok,false);
});

test('pesquisa ChatGPT de kits mantém abertura guiada e importação sem confundir SKUs',async()=>{
 const fs=await import('node:fs');
 const frontend=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const id of ['kitPlusAutoStart','kitPlusClipboardImport','kitPlusAutoStatus','kitPlusOutput'])
  assert.match(ui,new RegExp('id="'+id+'"'));
 assert.match(frontend,/kitChatExtractLines/);
 assert.match(frontend,/kitChatValidateContext/);
 assert.match(frontend,/navigator\.clipboard\.readText\(\)/);
 assert.match(frontend,/permission\.state!=='granted'/);
 assert.match(frontend,/suggestionContext=\{category:context\.category/);
 assert.match(server,/rankKitIdeaProducts\(idea,kit\.components\)/);
 assert.match(server,/assessKitBuyerFit\(kit\.components\)/);
 assert.doesNotMatch(frontend,/fetch\(['"]https:\/\/chatgpt\.com/);
 assert.match(frontend,/kitDownloadFullCatalog/);
 assert.match(ui,/id="kitTargetCount"/);
 assert.match(ui,/id="kitPlusDownloadCatalog"/);
 assert.match(server,/saveKitDraft\(auth\.shopId/);
});

test('pesquisa avançada entrega todas 125 SKUs, sem truncar, em arquivo para o ChatGPT',async()=>{
 const oldFetch=globalThis.fetch,base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://fixture-kits-all.supabase.co';
 process.env.SUPABASE_SECRET_KEY='fixture-key';
 const products=Array.from({length:125},(_,i)=>({
  supplier_sku:'TEST'+String(i+1).padStart(4,'0'),
  product_data:{name:'Utensílio Cozinha Número '+i,category:'Utensílios e Talheres'}
 }));
 const prices=products.map(p=>({supplier_sku:p.supplier_sku,unit_cost:9}));
 globalThis.fetch=async(url)=>{
  const u=new URL(url),offset=Number(u.searchParams.get('offset')||0);
  if(u.pathname.endsWith('/shopee_wedrop_products'))return Response.json(products.slice(offset,offset+1000));
  if(u.pathname.endsWith('/shopee_wedrop_costs'))return Response.json(prices.slice(offset,offset+1000));
  if(u.pathname.endsWith('/shopee_wedrop_availability_imports'))
   return Response.json([{last_success_at:new Date().toISOString(),batch_hash:'all-fixture',available_count:125,unavailable_count:0,imported_count:125}]);
  if(u.pathname.endsWith('/shopee_wedrop_sync_state'))
   return Response.json([{status:'success',last_success_at:new Date().toISOString()}]);
  if(u.pathname.endsWith('/shopee_wedrop_availability'))
   return Response.json(products.map(x=>({supplier_sku:x.supplier_sku,
    availability:'DISPONIVEL',batch_hash:'all-fixture',checked_at:new Date().toISOString()
   })).slice(offset,offset+1000));
  if(u.pathname.endsWith('/shopee_optimizer_pricing_preferences'))
   return Response.json([{settings:{marginPct:10,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,flashPct:3}}]);
  throw Error('URL inesperada: '+u.pathname);
 };
 try{
  const brief=await kitPlusResearchBrief(935128,{category:'Cozinha',size:2,desiredKits:10});
  assert.equal(brief.candidatesCount,125);
  assert.equal(brief.candidateSkus.length,125);
  assert.equal(brief.requiresAttachment,true);
  assert.equal(brief.truncated,false);
  assert.match(brief.catalogFileContent,/TEST0001/);
  assert.match(brief.catalogFileContent,/TEST0125/);
  assert.match(brief.prompt,/ARQUIVO TXT anexo/);
  assert.ok(!brief.prompt.includes('TEST0125'));
  assert.equal(brief.desiredKits,10);
  await assert.rejects(()=>kitPlusResearchBrief(935128,{category:'Cozinha',desiredKits:16}),/entre 5 e 15/);
 }finally{
  clearKitStockCache(935128);globalThis.fetch=oldFetch;
  if(base===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=base;
  if(key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=key;
 }
});

test('Editor de rascunho abre sob o cartão certo e mantém título e ações',async()=>{
 const fs=await import('node:fs');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 assert.match(html,/id="kitDetailHome"/);
 assert.match(html,/id="kitEditingSkuCode"/);
 assert.equal((html.match(/id="kitDetail"/g)||[]).length,1);
 assert.match(js,/card\.after\(editor\)/);
 assert.match(js,/kitPlaceEditorUnderDraft\(kitSku,\{targetCard\}\)/);
 assert.match(js,/kitEditorReturnHome\(\);\s*root\.replaceChildren\(\)/);
 assert.match(js,/renderKit\(\{scroll,displayTitle:title\|\|d\.creative\?\.title\}\)/);
 assert.match(js,/kitDraftOpenRevision/);
 assert.match(css,/#tab-kits #kitDraftList > #kitDetail/);
 assert.match(css,/kit-manual-row\[data-mode="add"\]/);
 assert.match(css,/scroll-margin-top:248px/);
});

test('texto do kit reúne descrições e medidas sem inventar dados para SKU faltante',async()=>{
 const {kitWeDropFacts,kitContentBrief}=await import('../shopeeKitBuilder.js');
 assert.deepEqual(kitWeDropFacts({description:'<p>Musical</p>',dimensions:'20 x 30 cm'}),{description:'Musical',dimensions:'20 x 30 cm'});
 const brief=kitContentBrief({kitSku:'KIT-1-2',components:[
  {sku:'1',name:'Elefante Musical',description:'Brinquedo musical',dimensions:'20 x 30 cm'},
  {sku:'2',name:'Kit Higiene Bebê'}]},{manualFacts:{'2':'Conjunto com 6 peças, dado conferido pelo vendedor'}});
 assert.equal(brief.missingDetails.length,1);
 assert.equal(brief.missingDetails[0].sku,'2');
 assert.match(brief.prompt,/TÍTULO 1/);
 assert.match(brief.prompt,/TÍTULO 3/);
 assert.match(brief.prompt,/DESCRIÇÃO/);
 assert.match(brief.prompt,/20 x 30 cm/);
 assert.match(brief.prompt,/NÃO verificad/);
 assert.throws(()=>kitContentBrief({kitSku:'KIT-1-2',components:[{sku:'1'},{sku:'2'}]},{manualFacts:{'3':'invasão'}}),/não pertence/);
});
