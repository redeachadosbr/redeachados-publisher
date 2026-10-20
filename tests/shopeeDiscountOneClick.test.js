import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/shopee-discount-one-click.css',import.meta.url),'utf8');
const start=source.indexOf('let discountLoadRequestId=0,discountRefreshBusy=false;');
const end=source.indexOf('let discountPromoPreview=',start);
const oneClickSource=source.slice(start,end);

function simulatedPage({previewAction='add',successful=true,previewError=false}={}){
 const calls=[];
 const nodes={
  '#discountOneClickExecute':{disabled:false,textContent:'',addEventListener:(_,fn)=>{nodes.onclick=fn;}},
  '#discountOneClickSku':{value:'0',disabled:false,addEventListener:(_,fn)=>{nodes.onSelect=fn;}},
  '#discountOneClickStatus':{textContent:'',dataset:{}},
  '#discountPromotionId':{value:'512820626272845'},
  '#discountSavedBadgeLabel':{textContent:''},
  '#discountPlanNotice':{textContent:''}
 };
 const quote={sku:'TRC1525',itemId:'22095398152',modelId:'0',
  grossPrice:219.60,discountPct:20,minMarginPct:5,netMarginPct:10.01};
 const preview={approvalToken:'signed-preflight',preview:{
  sku:quote.sku,itemId:quote.itemId,modelId:quote.modelId,
  gross:219.60,originalPrice:280.99,action:previewAction,needsBasePriceUpdate:true
 }};
 const context={
  $:sel=>nodes[sel],shDiscountQuote:quote,shPriceMoney:value=>'R$ '+value,
  discountPromoPublished:false,shDiscountChoose:async()=>{},
  AbortSignal:{timeout:()=>({})},
  json:async(url)=>{
   calls.push({type:'preview',url});
   if(previewError)throw Error('Promoção não disponível');
   return preview;
  },
  fetch:async(url,req)=>{
   calls.push({type:'execute',url,payload:JSON.parse(req.body)});
   return {ok:successful,json:async()=>successful
    ?{verified:true,message:'Confirmado na Shopee'}
    :{error:'Recusa Shopee',basePriceUpdated:true}};
  }
 };
 assert.ok(start>=0&&end>start,'Lógica de um clique não encontrada');
 vm.runInNewContext(oneClickSource,context);
 return {nodes,calls,context};
}

test('Somente um botão de execução visível no layout simplificado',()=>{
 assert.equal((html.match(/id="discountOneClickExecute"/g)||[]).length,1);
 assert.match(css,/#tab-discounts \.discount-v2-detail-grid,[\s\S]*?\.discount-publish-panel,[\s\S]*?\.discount-v2-actions,[\s\S]*?\.discount-v2-recent\{display:none!important\}/);
 assert.match(html,/<select id="discountOneClickSku"/);
 assert.match(html,/<button id="discountOneClickExecute"/);
 assert.doesNotMatch(oneClickSource, /discountPromotionConfirm|discountPromotionAllowPrice|data-discount-review/);
});

test('Um clique faz prévia autenticada e execução sem caixas de marcação',async()=>{
 const sim=simulatedPage();
 await sim.nodes.onclick();
 assert.deepEqual(sim.calls.map(x=>x.type),['preview','execute']);
 assert.equal(sim.calls[1].payload.confirm,true);
 assert.equal(sim.calls[1].payload.allowPriceChange,true);
 assert.equal(sim.calls[1].payload.approvalToken,'signed-preflight');
 assert.equal(sim.nodes['#discountOneClickStatus'].dataset.state,'success');
 assert.equal(sim.nodes['#discountOneClickExecute'].disabled,true,
  'Não permitir reenviar automaticamente a mesma operação');
});

test('SKU já aplicada não é reenviada',async()=>{
 const sim=simulatedPage({previewAction:'already'});
 await sim.nodes.onclick();
 assert.deepEqual(sim.calls.map(x=>x.type),['preview']);
 assert.equal(sim.nodes['#discountOneClickStatus'].dataset.state,'success');
});

test('Erro na conferência não chama a API de alteração',async()=>{
 const sim=simulatedPage({previewError:true});
 await sim.nodes.onclick();
 assert.deepEqual(sim.calls.map(x=>x.type),['preview']);
 assert.equal(sim.nodes['#discountOneClickStatus'].dataset.state,'error');
 assert.equal(sim.nodes['#discountOneClickExecute'].disabled,false);
});

test('Falha após tentativa de publicação impede reenvio duplo e mostra risco do preço',async()=>{
 const sim=simulatedPage({successful:false});
 await sim.nodes.onclick();
 assert.equal(sim.nodes['#discountOneClickStatus'].dataset.state,'error');
 assert.match(sim.nodes['#discountOneClickStatus'].textContent,/preço bruto pode ter sido atualizado/);
 assert.equal(sim.nodes['#discountOneClickExecute'].disabled,true);
});
