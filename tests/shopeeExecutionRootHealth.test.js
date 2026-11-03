import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRootShopeeExecution,ROOT_EXECUTION_STAGES} from '../shopeeExecutionHealth.js';
import {shouldAttachCommercialDiscount} from '../shopeeExecutionPlan.js';

const itemId='58272041645';
const base=()=>({
 sku:'1.26051.01.1000',itemId,
 record:{sku:'1.26051.01.1000',itemId,selectedModelId:'0'},
 live:{item_id:Number(itemId),item_name:'Produto revisado',description:'Descrição revisada',
  has_model:false,image:{image_id_list:[]},video_info:[],tax_info:{}},
 review:{stages:{images:{reviewed:true},video:{reviewed:true},
  seo:{reviewed:true},description:{reviewed:true},fiscal:{reviewed:true}},
  draftTitle:'Produto revisado',draftDescription:'Descrição revisada'},
 job:{state:'verified',plan:{selectedStage:'discount',kitDiscount:{}},result:{discount:{status:'verified'}}}
});
test('motor raiz possui 8 etapas de publicação mais conferência final',()=>{
 assert.equal(ROOT_EXECUTION_STAGES.length,9);
 const a=auditRootShopeeExecution(base());
 assert.equal(a.stages.length,9);
 assert.equal(a.stages.at(-1).id,'final');
 assert.equal(a.complete,false);
 assert.equal(a.stages.find(x=>x.id==='seo').status,'confirmed');
 assert.equal(a.stages.find(x=>x.id==='description').status,'confirmed');
 assert.equal(a.stages.find(x=>x.id==='images').status,'pending');
 assert.equal(a.stages.find(x=>x.id==='video').status,'pending');
 assert.equal(a.stages.find(x=>x.id==='discount').status,'pending');
 assert.equal(a.stages.find(x=>x.id==='variants').status,'not_applicable');
});
test('desconto confirmado isoladamente nao valida imagens ou a auditoria final',()=>{
 const a=base();
 a.live.image.image_id_list=Array.from({length:9},(_,i)=>'live-'+i);
 a.images=Array.from({length:9},(_,i)=>({shopee_image_id:'outro-'+i}));
 const audit=auditRootShopeeExecution(a);
 assert.equal(audit.complete,false);
 assert.equal(audit.stages.find(x=>x.id==='images').status,'pending');
 assert.equal(audit.stages.find(x=>x.id==='final').status,'pending');
 assert.equal(audit.latestJobPartial,true);
});
test('a conferência de imagens usa a ordem e os IDs atuais no anúncio',()=>{
 const a=base();
 a.images=Array.from({length:9},(_,i)=>({shopee_image_id:'imagem-'+i}));
 a.live.image.image_id_list=a.images.map(x=>x.shopee_image_id);
 const ok=auditRootShopeeExecution(a);
 assert.equal(ok.stages.find(x=>x.id==='images').status,'confirmed');
 a.live.image.image_id_list.reverse();
 assert.equal(auditRootShopeeExecution(a).stages.find(x=>x.id==='images').status,'pending');
});
test('SKU sem Item ID validado nunca pode ser concluída',()=>{
 const a=base();a.live.item_id=12;
 const result=auditRootShopeeExecution(a);
 assert.equal(result.complete,false);
 assert.equal(result.pending.length,9);
});

test('desconto lido na campanha real continua confirmado após novo job prepared',()=>{
 const x=base();
 x.job={state:'prepared',plan:{selectedStage:'discount_adjust'},result:null};
 x.discountReadback=true;
 const audit=auditRootShopeeExecution(x);
 assert.equal(audit.stages.find(stage=>stage.id==='discount').status,'confirmed');
 assert.equal(audit.stages.find(stage=>stage.id==='images').status,'pending');
});
test('desconto não consultado não é rotulado falsamente como não executado',()=>{
 const audit=auditRootShopeeExecution(base());
 const discount=audit.stages.find(stage=>stage.id==='discount');
 assert.equal(discount.status,'pending');
 assert.match(discount.reason,/não verificado/i);
});
test('execução completa anexa desconto assinado junto com ações independentes',()=>{
 const onlyContent={selectedStage:'all',canExecute:true,
  actions:['item_name','description'],confirmedStages:{},proposed:{item_name:'Novo título'}};
 assert.equal(shouldAttachCommercialDiscount(onlyContent),false);
 assert.equal(shouldAttachCommercialDiscount(onlyContent,{hasSignedApproval:true}),true);
 assert.equal(shouldAttachCommercialDiscount(onlyContent,{hasSignedApproval:true,linkedKit:true}),false);
 assert.equal(shouldAttachCommercialDiscount({...onlyContent,selectedStage:'video'},{hasSignedApproval:true}),false);
 const discountOnly={selectedStage:'discount_adjust',canExecute:true,
  actions:['discount'],discountOnly:true};
 assert.equal(shouldAttachCommercialDiscount(discountOnly),true);
});
