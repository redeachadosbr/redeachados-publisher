import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIndividualRoasDraft,individualRoasPayload,individualRoasPreview,
 individualRoasToken,decodeIndividualRoasToken,PRODUCT_ROAS_CREATE_PATH} from '../shopeeAdsIndividualRoas.js';

const now=new Date('2026-10-22T12:00:00Z');
const form={sku:'SKU-PR-20',itemId:'58205966210',dailyBudget:10,
 roasTarget:5.6,reservePct:8,startDate:'23-10-2026',endDate:'',priceConfirmed:true};
const item={sku:form.sku,itemId:String(form.itemId),stock:12,title:'Escova Secadora',status:'NORMAL'};
const plan={sku:form.sku,itemId:String(form.itemId),quote:{customerPrice:100,unitCost:40,
 adsBudgetEnabled:true,adsBudgetPct:8,netMarginPct:12,netProfit:12},updatedAt:new Date().toISOString()};
test('GMV Max: produto individual e lance automático com Meta de ROAS, sem palavras-chave',()=>{
 const draft=validateIndividualRoasDraft(form,{today:now});
 assert.equal(draft.productSelection,'manual');
 assert.equal(draft.biddingMethod,'auto');
 assert.equal(draft.roasTarget,5.6);
 const request=individualRoasPayload(draft,'ref-unique');
 assert.equal(request.path,PRODUCT_ROAS_CREATE_PATH);
 assert.equal(request.body.item_id,58205966210);
 assert.equal(request.body.bidding_method,'auto');
 assert.equal(request.body.roas_target,5.6);
 assert.equal(request.body.budget,10);
 assert.equal(request.body.reference_id,'ref-unique');
 assert.equal(request.body.start_date,'23-10-2026');
 assert.ok(!('selected_keywords' in request.body));
 assert.ok(!('product_selection' in request.body));
});
test('prévia mantém reserva no preço e nunca publica',()=>{
 const result=individualRoasPreview(form,[item],[plan],{today:now});
 assert.equal(result.draft.roasTarget,5.6);
 assert.equal(result.reserve.additionalReservePct,0);
 assert.equal(result.product.sku,form.sku);
 assert.equal(result.requiresConfirmation,true);
});
test('recusa reserva não incluída no plano, sem aprovação ou sem estoque',()=>{
 assert.throws(()=>individualRoasPreview({...form,reservePct:12},[item],[plan],{today:now}),/Reserva Ads insuficiente/);
 assert.throws(()=>individualRoasPreview({...form,priceConfirmed:false},[item],[plan],{today:now}),/Confirme/);
 assert.throws(()=>individualRoasPreview(form,[{...item,stock:0}],[plan],{today:now}),/estoque/);
});
test('rejeita lance manual CPC no modo Meta de ROAS e ROAS-alvo inválido',()=>{
 assert.throws(()=>validateIndividualRoasDraft({...form,keywords:[{keyword:'teste'}]},{today:now}),/não permitido/);
 assert.throws(()=>validateIndividualRoasDraft({...form,roasTarget:0},{today:now}),/ROAS/);
 assert.throws(()=>validateIndividualRoasDraft({...form,dailyBudget:-3},{today:now}),/Orçamento/);
 assert.throws(()=>validateIndividualRoasDraft({...form,startDate:'01-10-2026'},{today:now}),/Início/);
});
test('prévia assinada expira, exige loja certa e não aceita adulteração',()=>{
 const draft=validateIndividualRoasDraft(form,{today:now});
 const secret='secret-for-gmv-max-review-12345678987654321';
 const token=individualRoasToken({shopId:'123',at:now.getTime(),nonce:'nonce-individual-2345',draft},secret);
 assert.equal(decodeIndividualRoasToken(token,secret,{shopId:'123',now:now.getTime()+1000}).draft.roasTarget,5.6);
 assert.throws(()=>decodeIndividualRoasToken(token,secret,{shopId:'999',now:now.getTime()}),/outra loja/);
 assert.throws(()=>decodeIndividualRoasToken(token,secret,{shopId:'123',now:now.getTime()+400000}),/expirada/);
 assert.throws(()=>decodeIndividualRoasToken(token+'x',secret,{shopId:'123',now:now.getTime()}),/Assinatura/);
});
