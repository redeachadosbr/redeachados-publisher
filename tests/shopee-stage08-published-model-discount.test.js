import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const begin=app.indexOf('async function optimizerDiscountRoutePublishedModels(');
const end=app.indexOf('async function optimizerDiscountFinalPrepare(',begin);
assert.ok(begin>=0&&end>begin,'A rotina de conferência por modelo deve existir');
const fnSource=app.slice(begin,end);

const product={sku:'HK40040VM',itemId:'58273557203',modelId:'0',variationConfig:{enabled:true}};
const campaign='512820626272845';
const key=[product.sku,product.itemId,product.modelId].join('|');
const state={ok:true,liveHasModel:true,allModelsConfirmed:true,
 modelSkus:['HK40040VM-VERMELHA','HK40040VM-AZUL','HK40040VM-PRETA'],
 details:{type:'Cor',options:[
  {name:'Vermelha',sku:'HK40040VM-VERMELHA'},
  {name:'Azul',sku:'HK40040VM-AZUL'},
  {name:'Preta',sku:'HK40040VM-PRETA'}
 ]}};
function makeContext({data=state,success=true,withModels=true}={}){
 const nodes={
  '#optimizerFinalCampaignId':{value:''},
  '#optimizerFinalPending':{hidden:true,scrollIntoView(){this.scrolled=true}},
  '#optimizerFinalDiscountOpen':{click(){this.clicked=true}}
 };
 const messages=[],requests=[],views=[];
 const ctx=vm.createContext({
  URLSearchParams,AbortSignal,Date,Error,
  optimizerWorkflowPlan:product,optimizerExecPlan:null,
  optimizerFinalSnapshot:null,optimizerFinalSnapshotKey:'',
  optimizerDiscountFinalIdentityOf:w=>[w.sku,w.itemId,w.modelId].join('|'),
  optimizerFinalPendingPaint:value=>views.push(value),
  optimizerWorkflowActivateOnly:view=>views.push(view),
  optimizerDiscountFinalStatus:(...args)=>messages.push(args),
  $:sel=>nodes[sel],
  fetch:async(url,options)=>{
   requests.push({url,options});
   return {ok:success,status:success?200:400,json:async()=>({...data,liveHasModel:withModels?data.liveHasModel:false})};
  }
 });
 const fn=vm.runInContext(fnSource+'\noptimizerDiscountRoutePublishedModels;',ctx);
 return {fn,ctx,nodes,requests,views,messages};
}
test('Etapa 08 confere modelos publicados e abre prévia específica sem executar POST',async()=>{
 const s=makeContext();
 assert.equal(await s.fn(product,campaign,key),true);
 assert.equal(s.requests.length,1);
 assert.equal(s.requests[0].options.method,undefined);
 assert.match(s.requests[0].url,/variants\/draft\?/);
 assert.equal(s.nodes['#optimizerFinalCampaignId'].value,campaign);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,true);
 assert.equal(s.nodes['#optimizerFinalPending'].hidden,false);
 assert.equal(s.views[1],'execution');
 assert.equal(s.ctx.optimizerFinalSnapshot.modelSkus.length,3);
});
test('Anúncio sem modelos mantém a rotina de item único',async()=>{
 const s=makeContext({withModels:false});
 assert.equal(await s.fn(product,campaign,key),false);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,undefined);
});
test('Modelos publicados que não conferem com o rascunho jamais liberam promoção',async()=>{
 const s=makeContext({data:{...state,allModelsConfirmed:false}});
 await assert.rejects(s.fn(product,campaign,key),/não coincidem/);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,undefined);
});
test('Erro de consulta de anúncio com variações não cai silenciosamente no desconto de item único',async()=>{
 const s=makeContext({success:false});
 await assert.rejects(s.fn(product,campaign,key),/Não foi possível conferir as variações/);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,undefined);
});
test('Desconto de modelos já publicados não exige republicar fotos; preço/identidade são verificados',()=>{
 const start=server.indexOf('async function variationModelDiscountContext(req){');
 const end=server.indexOf("app.post('/api/shopee/optimizer/variants-discount/preview'",start);
 assert.ok(start>0&&end>start);
 const code=server.slice(start,end);
 assert.match(code,/live\.has_model!==true/);
 assert.match(code,/validateVariationDetails\(x\.details,\{requirePhotos:false/);
 assert.match(code,/models\.length!==details\.options\.length/);
 assert.match(code,/m\.model_sku/);
 assert.doesNotMatch(code,/Math\.abs\(link\.unitCost-Number\(quote\.unitCost\)\)/);
 assert.match(code,/const modelQuote=quoteShopeePrice\(\{unitCost:Number\(link\.unitCost\)/);
 assert.match(code,/modelQuote\.marketplaceDisplayPrice/);
 assert.match(code,/modelQuote\.netMarginPct/);
 assert.match(code,/buyerAfterCoupon>reference\*1\.25/);
 assert.match(code,/Math\.min\(\.\.\.checked\.map\(m=>m\.margin\)\)/);
 const execute=server.slice(server.indexOf("app.post('/api/shopee/optimizer/variants-discount/execute'"));
 assert.match(execute,/verifyDiscountPreview/);
 assert.match(execute,/JSON\.stringify\(fresh\.snapshot\)!==JSON\.stringify\(approvedValues\)/);
 assert.match(execute,/model_promotion_price/);
 assert.match(execute,/const verified=approved\.models\.every/);
 assert.match(app,/if\(data\.verified===true&&p\.key===optimizerDiscountFinalIdentityOf\(optimizerWorkflowPlan\)\)/);
});
