import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedTitle,approvedDescription} from './fixtures/approved-content.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';
import {ROOT_EXECUTION_STAGES,auditRootShopeeExecution} from '../shopeeExecutionHealth.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const record={sku:'1.26088.80.0001',itemId:'58222014306',selectedModelId:'0',
 status:'NORMAL',imageCount:1,attributeAudit:{missingMandatory:0,attributes:[]}};
const live={item_id:58222014306,item_name:'Anúncio antigo',description:'Descrição anterior',
 description_type:'normal',has_model:false,image:{image_id_list:[]},tax_info:{},video_info:[]};
const review={stages:{images:{reviewed:true},seo:{reviewed:true},description:{reviewed:true}},
 draftTitle:approvedTitle,draftDescription:approvedDescription};
const input={shopId:852701218,itemId:'58222014306',modelId:'0',
 sku:record.sku,record,live,review,manualImages:[{slot:1,shopee_image_id:'imagem-1'}]};

test('modo completo prepara título e descrição mesmo com somente 1/9 imagens',()=>{
 const p=compileShopeeExecutionPlan({...input,manualImages:[] ,selectedStage:'all'});
 assert.equal(p.selectedStage,'all');
 assert.equal(p.canExecute,true);
 assert.ok(p.actions.includes('item_name'));
 assert.ok(p.actions.includes('description'));
 assert.deepEqual(p.images,[]);
 assert.ok(p.warnings.some(x=>/Imagens pendentes: 0\/9/.test(x)));
 assert.equal(p.blocked.some(x=>/imagens/i.test(x)),false);
 const isolated=compileShopeeExecutionPlan({...input,manualImages:[],selectedStage:'images'});
 assert.equal(isolated.canExecute,false);
 assert.ok(isolated.blocked.some(x=>/imagens pendentes/i.test(x)));
});
test('o motor raiz possui nove cartões mas nunca interpreta conferência local como publicação',()=>{
 assert.equal(ROOT_EXECUTION_STAGES.length,9);
 const audit=auditRootShopeeExecution({
  sku:record.sku,itemId:record.itemId,record,live,review,
  images:[],video:null,discountReadback:null
 });
 assert.equal(audit.complete,false);
 assert.equal(audit.stages.length,9);
 assert.equal(audit.stages.find(x=>x.id==='images').status,'pending');
 assert.equal(audit.stages.find(x=>x.id==='final').status,'pending');
 assert.equal(audit.stages.find(x=>x.id==='variants').status,'not_applicable');
});
test('a Etapa 10 não força mídia/fiscal e o executor completo inclui tudo revisado',()=>{
 const app=source('public/app.js'),wizard=source('public/kit-builder.js'),html=source('public/index.html');
 const start=app.indexOf('globalThis.RAKitExecutePendingAllStages=async');
 const end=app.indexOf("$('#optimizerExecutionLaunch')",start);
 const executor=app.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.ok(executor.includes("scope.value=executionScope"));
 assert.ok(executor.includes("onlyDiscount?'discount':kitAutoSweepPreferredStage(audit)"));
 assert.ok(executor.includes('optimizerRootAuditRefresh(true)'));
 assert.ok(executor.includes('kitAutoSweepChoosePlan({kitSku,sku,itemId,modelId},audit,executionScope)'));
 assert.ok(app.includes("pending.has('fiscal')?['fiscal']:[]"));
 assert.ok(app.includes("pending.has('discount')?['discount']:[]"));
 assert.ok(executor.includes('optimizerExecuteApproved(false)'));
 assert.equal(executor.includes("scope.value='media_fiscal'"),false);
 assert.ok(wizard.includes('globalThis.RAKitExecutePendingAllStages?.('));
 assert.ok(!wizard.includes('globalThis.RAKitExecutePendingMediaFiscal?.('));
 assert.ok(html.includes('<option value="all" selected>TODAS as 9 etapas'));
});
test('desconto não aprovado fica pendente sem impedir conteúdo seguro',()=>{
 const server=source('server.js');
 assert.ok(server.includes("if(selectedStage!=='all')throw error;"));
 assert.ok(server.includes('discountPreparationWarning'));
 assert.ok(server.includes('kitDiscountPlan=null'));
 assert.ok(server.includes('plan.warnings.push(discountPreparationWarning)'));
 const app=source('public/app.js');
 assert.ok(app.includes("if(plan?.selectedStage==='all')return true;"));
});
