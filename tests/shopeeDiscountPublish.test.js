import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {promotionFromQuote,promotionBasePrice,promotionMember,discountPlanSnapshot,
  readDiscountPages,signDiscountPreview,verifyDiscountPreview,
  shopDiscountMembershipSignal} from '../shopeeDiscountPublish.js';

const q={sku:'TRC1525',itemId:'22095398152',modelId:'0',grossPrice:219.6,
 discountPct:20,couponPct:1,customerPrice:173.92,unitCost:99.99,
 netMarginPct:10.01,minMarginPct:5,readyForManualReview:true,
 appliedInShopee:false,calculatedAt:new Date().toISOString()};
const activity={discount_id:512820626272845,status:'ongoing',
 discount_name:'Desconto Produtos 07/04/2027',
 end_time:Math.floor(Date.now()/1000)+86400,item_list:[],more:false};
test('Preço enviado na campanha exclui o cupom que já é deduzido separadamente',()=>{
 const v=promotionFromQuote(q);
 assert.equal(v.gross,219.60);
 assert.equal(v.promo,175.68);
 assert.equal(v.buyerAfterCoupon,173.92);
 assert.equal(v.discountPct,20);
});
test('Prévia detecta adição, atualização e desconto já aplicado sem duplicar',()=>{
 const base={shopId:'1234',sku:q.sku,itemId:q.itemId,modelId:'0',
  discountId:String(activity.discount_id),quote:q,record:activity,originalPrice:219.6};
 assert.equal(discountPlanSnapshot({...base,existing:null}).action,'add');
 assert.equal(discountPlanSnapshot({...base,existing:{item_id:q.itemId,item_promotion_price:169}}).action,'update');
 assert.equal(discountPlanSnapshot({...base,existing:{item_id:q.itemId,item_promotion_price:175.68}}).action,'already');
 const changed=discountPlanSnapshot({...base,originalPrice:149.9,
  existing:{item_id:q.itemId,item_promotion_price:175.68}});
 assert.equal(changed.action,'update');
 assert.equal(changed.needsBasePriceUpdate,true);
});
test('Recusa produto com variantes, preço desconhecido ou moeda diferente',()=>{
 assert.equal(promotionBasePrice({has_model:false,price_info:[{original_price:219.6,currency:'BRL'}]}),219.6);
 assert.throws(()=>promotionBasePrice({has_model:true,price_info:[{original_price:219.6}]}),/variações/);
 assert.throws(()=>promotionBasePrice({price_info:[]}),/preço original/);
 assert.throws(()=>promotionBasePrice({price_info:[{original_price:219.6,currency:'USD'}]}),/BRL/);
});
test('Prévia exige correspondência de campanha e pagina todos os itens',async()=>{
 const result=await readDiscountPages(async(_cfg,{query})=>({response:{
  ...activity,item_list:query.page_no===1?[{item_id:'10'}]:[{item_id:q.itemId,item_promotion_price:175.68}],
  more:query.page_no<2
 }}),{cfg:{},auth:{accessToken:'test',shopId:'1234'},discountId:String(activity.discount_id)});
 assert.equal(result.pages.length,2);
 assert.equal(promotionMember(result.pages,q.itemId).item_promotion_price,175.68);
});
test('Aprovação assinada é vinculada à loja e expira',()=>{
 const preview=discountPlanSnapshot({shopId:'1234',sku:q.sku,itemId:q.itemId,
  modelId:'0',discountId:String(activity.discount_id),quote:q,record:activity,
  originalPrice:219.6,existing:null});
 const secret='test-secret-very-long';
 const signed=signDiscountPreview(preview,secret);
 const value=verifyDiscountPreview(signed,secret,'1234');
 assert.equal(value.promo,175.68);
 assert.throws(()=>verifyDiscountPreview(signed,secret,'9999'),/outra loja/);
 assert.throws(()=>verifyDiscountPreview(signed+'x',secret,'1234'),/alterada/);
});
test('Descontos têm botão executar e prévia, sem execução automática',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 for(const id of ['discountPromotionId','discountPromotionPreview','discountPromotionExecute',
  'discountPromotionConfirm','discountPromotionAllowPrice']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(js,/discountPromotionExecute.*addEventListener/);
 assert.match(js,/\/api\/shopee\/optimizer\/discounts\/preview/);
 assert.match(js,/\/api\/shopee\/optimizer\/discounts\/execute/);
});

test('has_promotion=true sozinho não afirma participação em outra Minha Promoção',()=>{
 const signal=shopDiscountMembershipSignal({has_promotion:true},null);
 assert.equal(signal.kind,'unclassified_promotion');
 assert.match(signal.warning,/não comprova participação/);
 assert.doesNotMatch(signal.warning,/já participa de outra promoção/);
 const noPromotion=shopDiscountMembershipSignal({has_promotion:false},null);
 assert.equal(noPromotion.kind,'not_in_selected_discount');
 assert.match(noPromotion.warning,/não consta/);
 const active=shopDiscountMembershipSignal({has_promotion:true},{item_id:q.itemId});
 assert.equal(active.kind,'included_in_selected_discount');
 assert.equal(active.warning,null);
});
test('Servidor não bloqueia prévia por sinal promocional genérico',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.doesNotMatch(server,/if\s*\(live\.has_promotion===true\s*&&\s*!existing\)\s*throw/);
 assert.match(server,/shopDiscountMembershipSignal\(live,existing\)/);
 assert.match(server,/promotionSignal:promoMembership\.kind/);
 assert.match(server,/discountExecutionInputs\(req,approved\.sku/);
 assert.match(server,/add_discount_item/);
});

test('Botão Executar libera com a prévia correta e apenas as confirmações da seção de execução',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=js.indexOf('function discountPromoApproval(){');
 const end=js.indexOf('function discountPromoRenderPreview(data){',start);
 assert.ok(start>0&&end>start,'Lógica de aprovação não encontrada');
 const evaluator=js.slice(start,end);
 const preview={sku:'TRC1525',itemId:'22095398152',modelId:'0',action:'add',
  originalPrice:280.99,gross:219.6,needsBasePriceUpdate:true};
 function check({confirm=true,price=true,sku='TRC1525',inProgress=false,
  token='signed-token',action='add',requiresPrice=true}={}){
  const elements={
   '#discountPromotionExecute':{disabled:true},
   '#discountPromotionConfirm':{checked:confirm},
   '#discountPromotionAllowPrice':{checked:price},
   '#discountPublishBadge':{textContent:'',dataset:{}}
  };
  const context={
   discountPromoPreview:{approvalToken:token,preview:{...preview,
    action,needsBasePriceUpdate:requiresPrice}},
   shDiscountQuote:{sku,itemId:preview.itemId,modelId:preview.modelId},
   discountPromoExecuting:inProgress,
   $:selector=>elements[selector],
   discountPromoStatus:()=>{},
   shPriceMoney:value=>String(value)
  };
  const fn=vm.runInNewContext(evaluator+'\n discountPromoApproval;',context);
  const enabled=fn();
  assert.equal(elements['#discountPromotionExecute'].disabled,!enabled);
  return enabled;
 }
 assert.equal(check(),true,'Duas autorizações permitem executar sem o checklist adicional');
 assert.equal(check({confirm:false}),false,'Sem confirmação do envio permanece bloqueado');
 assert.equal(check({price:false}),false,'Preço bruto alterado exige autorização específica');
 assert.equal(check({requiresPrice:false,price:false}),true,
  'Se o preço bruto já está correto, não exige autorização de alteração');
 assert.equal(check({sku:'OUTRA-SKU'}),false,'Prévia de outra SKU não pode executar');
 assert.equal(check({token:''}),false,'Prévia sem token não pode executar');
 assert.equal(check({action:'already'}),false,'SKU já incluída não deve ser reenviada');
 assert.equal(check({inProgress:true}),false,'Execução em andamento não pode ser repetida');
 assert.doesNotMatch(evaluator,/\[data-discount-review\]/,
  'Checklist informativo não pode interferir no botão Executar');
});
