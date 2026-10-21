import test from 'node:test';
import assert from 'node:assert/strict';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';
import {approvedTitle} from './fixtures/approved-content.js';

const sku='TUD0667';
const record={shopId:9,itemId:'22095398152',selectedModelId:'0',sku,
 status:'NORMAL',imageCount:0,videoStatus:'Sem vídeo',
 attributeAudit:{attributes:[],missingMandatory:0}};
const live={item_id:22095398152,item_name:'Título anterior',description:'Descrição anterior',
 description_type:'normal',category_id:101,item_status:'NORMAL',
 tax_info:{},image:{image_id_list:[]},attribute_list:[],video_info:[]};
const tax={ncm:'95030099',cest:'',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
 csosn:'102',evidence:'NCM da WeDrop conferido'};
const review={stages:{seo:{reviewed:true},fiscal:{reviewed:true}},draftTitle:approvedTitle,tax};
const base={shopId:9,itemId:record.itemId,modelId:'0',sku,record,live,
 review,omitFiscal:true,selectedStage:'all'};

test('CEST 00 ou nota fiscal modificada não invalida prévia geral SEM tax_info',()=>{
 const p1=compileShopeeExecutionPlan(base);
 const p2=compileShopeeExecutionPlan({...base,review:{...review,tax:{...tax,cest:'00',
 evidence:'Conferência fiscal posterior'}}});
 assert.equal(p1.canExecute,true);
 assert.equal(p2.canExecute,true);
 assert.equal(Object.hasOwn(p1.proposed,'tax_info'),false);
 assert.equal(Object.hasOwn(p2.proposed,'tax_info'),false);
 assert.equal(p1.fingerprint,p2.fingerprint);
 assert.deepEqual(p1.proposed,p2.proposed);
});
test('Alterações efetivas no título continuam invalidando a prévia',()=>{
 const p1=compileShopeeExecutionPlan(base);
 const title=approvedTitle.slice(0,-1)+(approvedTitle.endsWith('a')?'b':'a');
 const p2=compileShopeeExecutionPlan({...base,review:{...review,draftTitle:title}});
 assert.notEqual(p1.fingerprint,p2.fingerprint);
});
test('Modo fiscal continua dependendo dos campos fiscais confirmados',()=>{
 const fiscal={...review,stages:{fiscal:{reviewed:true}},draftTitle:''};
 const p1=compileShopeeExecutionPlan({...base,omitFiscal:false,selectedStage:'fiscal',review:fiscal});
 const p2=compileShopeeExecutionPlan({...base,omitFiscal:false,selectedStage:'fiscal',
 review:{...fiscal,tax:{...tax,same_state_cfop:'5102'}}});
 assert.notEqual(p1.fingerprint,p2.fingerprint);
});
