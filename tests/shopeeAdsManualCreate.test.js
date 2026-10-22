import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateManualAdsDraft,manualAdsPayload,manualAdsPreview,manualAdsToken,decodeManualAdsToken,calculateAdsReserve} from '../shopeeAdsManualCreate.js';
const today=new Date('2026-10-22T12:00:00Z');
const draft={sku:'AAA1',itemId:'12345',dailyBudget:12,roasReference:5.2,
 reservePct:6,startDate:'23-10-2026',endDate:'',
 keywords:[{keyword:'mochila ferramentas',matchType:'exact',bid:.35}],
 priceConfirmed:true};
const catalog=[{itemId:'12345',sku:'AAA1',status:'NORMAL',stock:15,title:'Mochila',imageUrl:'https://cf.shopee.com.br/file/a'}];
const plans=[{itemId:'12345',sku:'AAA1',updatedAt:new Date().toISOString(),quote:{
 adsBudgetEnabled:true,adsBudgetPct:6,customerPrice:100,netMarginPct:12,netProfit:12}}];
test('manual Ads usa CPC e palavras-chave e não envia roas_target',()=>{
 const out=manualAdsPreview(draft,catalog,plans,{today});
 assert.equal(out.draft.biddingMethod,'manual');
 const request=manualAdsPayload(out.draft,'my-reference');
 assert.equal(request.path,'/api/v2/ads/create_manual_product_ads');
 assert.equal(request.body.bidding_method,'manual');
 assert.equal(request.body.selected_keywords[0].bid_price_per_click,.35);
 assert.equal(request.body.enhanced_cpc,false);
 assert.equal(request.body.budget,12);
 assert.equal(request.body.reference_id,'my-reference');
 assert.equal(Object.hasOwn(request.body,'roas_target'),false);
});
test('reserva não altera preço publicado e exige recálculo de taxa real',()=>{
 const out=calculateAdsReserve({currentPrice:100,currentAdsPct:0,desiredAdsPct:6,netMarginPct:12});
 assert.equal(out.additionalReservePct,6);
 assert.equal(out.reservedPerSale,6);
 assert.equal(out.needsRepricing,true);
 assert.match(out.warning,/NÃO é novo preço autorizado/);
});
test('bloquear sem reserva, custo e aprovação de preço publicados',()=>{
 assert.throws(()=>manualAdsPreview({...draft,priceConfirmed:false},catalog,plans,{today}),/Confirme/);
 assert.throws(()=>manualAdsPreview(draft,catalog,[{...plans[0],quote:{...plans[0].quote,adsBudgetEnabled:false}}],{today}),/Reserva/);
 assert.throws(()=>manualAdsPreview(draft,catalog,[{...plans[0],quote:{...plans[0].quote,adsBudgetPct:2}}],{today}),/Reserva/);
 assert.throws(()=>manualAdsPreview(draft,catalog,[{...plans[0],quote:{...plans[0].quote,netMarginPct:3}}],{today}),/lucro/);
});
test('proteger orçamento, data, duplicação de palavras e match type',()=>{
 assert.throws(()=>validateManualAdsDraft({...draft,dailyBudget:1000},{today}),/Orçamento/);
 assert.throws(()=>validateManualAdsDraft({...draft,startDate:'20-10-2026'},{today}),/anterior/);
 assert.throws(()=>validateManualAdsDraft({...draft,keywords:[{keyword:'x',matchType:'smart',bid:.4}]},{today}),/Correspondência/);
 assert.throws(()=>validateManualAdsDraft({...draft,keywords:[...draft.keywords,...draft.keywords]},{today}),/duplicadas/);
});
test('apenas aprovação assinada da loja e ainda no prazo autoriza criação',()=>{
 const secret='this is a long secret enough for ads approvals 2026';
 const token=manualAdsToken({shopId:'123',nonce:'01234567890123456789',at:today.getTime(),draft},secret);
 const restored=decodeManualAdsToken(token,secret,{shopId:'123',now:today.getTime()+1000});
 assert.equal(restored.draft.sku,'AAA1');
 assert.throws(()=>decodeManualAdsToken(token,secret,{shopId:'456',now:today.getTime()}),/outra loja/);
 assert.throws(()=>decodeManualAdsToken(token,secret,{shopId:'123',now:today.getTime()+400000}),/expirou/);
 assert.throws(()=>decodeManualAdsToken(token+'x',secret,{shopId:'123',now:today.getTime()}),/Assinatura/);
});
test('página mostra contador de aptos e formulário de campanha manual',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const front=readFileSync(new URL('../public/ads-manual.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(html,/id="adsSeoReadyCount"/);
 assert.match(html,/ads-manual\.js\?v=/);
 assert.match(front,/redeAdsPrepareReserve/);
 assert.match(front,/\/api\/shopee\/ads\/manual\/preview/);
 assert.match(front,/\/api\/shopee\/ads\/manual\/create/);
 assert.match(app,/adsReserveAwaitDiscountSku/);
 assert.match(app,/setTab\('discounts'\)/);
 assert.match(server,/\/api\/shopee\/ads\/manual\/create/);
 assert.match(server,/manualAdsPayload\(signed\.draft,signed\.nonce\)/);
});
