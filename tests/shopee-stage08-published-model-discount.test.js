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
  optimizerModelDiscountState:()=>({reviewed:false,verified:false}),
  optimizerDiscountFinalQuote:{calculatedAt:'2026-11-19T23:00:00Z'},
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
test('Etapa 08 de variações conhecidas abre prévia por modelo sem GET pesado ou escrita',async()=>{
 const s=makeContext();
 assert.equal(await s.fn(product,campaign,key),true);
 assert.equal(s.requests.length,0);
 assert.equal(s.nodes['#optimizerFinalCampaignId'].value,campaign);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,true);
 assert.equal(s.nodes['#optimizerFinalPending'].hidden,false);
 assert.equal(s.views[0],'execution');
});
test('Sem variações no rascunho usa a consulta normal e mantém caminho de item único',async()=>{
 const s=makeContext({withModels:false});
 const plain={...product,variationConfig:{enabled:false}};
 s.ctx.optimizerWorkflowPlan=plain;
 assert.equal(await s.fn(plain,campaign,key),false);
 assert.equal(s.requests.length,1);
 assert.match(s.requests[0].url,/variants\/draft\?/);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,undefined);
});
test('Modelo não reconhecido no fallback nunca libera promoção',async()=>{
 const s=makeContext({data:{...state,allModelsConfirmed:false}});
 const plain={...product,variationConfig:{enabled:false}};
 s.ctx.optimizerWorkflowPlan=plain;
 await assert.rejects(s.fn(plain,campaign,key),/não coincidem/);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,undefined);
});
test('Erro com modelos suspeitos não cai no desconto de item único',async()=>{
 const s=makeContext({success:false});
 const plain={...product,variationConfig:{enabled:false}};
 s.ctx.optimizerWorkflowPlan=plain;s.ctx.optimizerExecPlan={modelVariations:{}};
 await assert.rejects(s.fn(plain,campaign,key),/Não foi possível conferir as variações/);
 assert.equal(s.nodes['#optimizerFinalDiscountOpen'].clicked,undefined);
});
test('Check da etapa 08 depende da prévia assinada e da identidade atual da campanha',()=>{
 const a=app.indexOf('function optimizerModelDiscountState(');
 const b=app.indexOf('const finalDiscountNotice=',a);
 assert.ok(a>0&&b>a);
 const fn=app.slice(a,b);
 const ctx={Date,optimizerDiscountFinalIdentityOf:w=>[w.sku,w.itemId,w.modelId].join('|'),
  optimizerModelDiscountApproval:{key,campaign,modelCount:3,quoteAt:'2026-11-19T23:00:00Z',
   receivedAt:Date.now(),token:'signed'},
  optimizerModelDiscountVerified:null};
 const state=vm.runInNewContext(fn+'\noptimizerModelDiscountState;',ctx);
 const quote={calculatedAt:'2026-11-19T23:00:00Z'};
 assert.equal(state(product,quote,campaign).reviewed,true);
 assert.equal(state(product,quote,'999').reviewed,false);
 assert.equal(state(product,{calculatedAt:'other'},campaign).reviewed,false);
 ctx.optimizerModelDiscountApproval.receivedAt=Date.now()-9*60*1000;
 assert.equal(state(product,quote,campaign).reviewed,false);
 ctx.optimizerModelDiscountVerified={key,campaign,modelCount:3,quoteAt:quote.calculatedAt};
 assert.equal(state(product,quote,campaign).verified,true);
 assert.equal(state(product,quote,'999').verified,false);
 assert.match(app,/optimizerDiscountFinalPaint\(\);\n  optimizerDiscountFinalStatus\(p.action/);
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
