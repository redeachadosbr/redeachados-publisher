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

test('kit nao declara dados fiscais confirmados quando CFOP CSOSN e unidade estao vazios na Shopee',()=>{
 const a=base();
 a.review.kitOptimization={kitSku:'KIT-TX24507L-TX24508E'};
 a.review.tax={ncm:'42029200',origin:'2',cest:'00',
  pis_cofins_cst:'99',evidence:'WeDrop catalogo SKU exata'};
 a.live.tax_info={ncm:'42029200',origin:'2',pis_cofins_cst:'99'};
 const result=auditRootShopeeExecution(a);
 const fiscal=result.stages.find(x=>x.id==='fiscal');
 assert.equal(fiscal.status,'pending');
 assert.match(fiscal.reason,/CFOP mesmo estado/);
 assert.match(fiscal.reason,/CSOSN/);
 assert.match(fiscal.reason,/Unidade de Medida/);
});

test('kit fiscal permanece pendente se revisao completa nao foi aplicada no anuncio',()=>{
 const a=base();
 a.review.kitOptimization={kitSku:'KIT-TX24507L-TX24508E'};
 a.review.tax={ncm:'42029200',origin:'2',cest:'00',
  same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',
  measure_unit:'UN',operation_type:'1',pis_cofins_cst:'99',
  evidence:'WeDrop catalogo SKU exata'};
 a.live.tax_info={ncm:'42029200',origin:'2',pis_cofins_cst:'99'};
 let fiscal=auditRootShopeeExecution(a).stages.find(x=>x.id==='fiscal');
 assert.equal(fiscal.status,'pending');
 assert.match(fiscal.reason,/Campos vazios na Shopee/);
 a.live.tax_info={...a.review.tax};
 fiscal=auditRootShopeeExecution(a).stages.find(x=>x.id==='fiscal');
 assert.equal(fiscal.status,'confirmed');
});

test('kit com video de 10 segundos ja publicado na Shopee encerra etapa mesmo sem upload local',()=>{
 const a=base();
 a.sku='TX24507L';a.itemId='58222301146';
 a.record={sku:a.sku,itemId:a.itemId,selectedModelId:'0'};
 a.live.item_id=58222301146;
 a.live.video_info=[{
  duration:10,
  video_url:'https://cvf.shopee.com.br/file/api/v4/11110105/video-real.mp4',
  thumbnail_url:'https://cf.shopee.com.br/file/video_cover'
 }];
 a.review.kitOptimization={kitSku:'KIT-TX24507L-TX24508E',
  sku:a.sku,mainSku:a.sku,itemId:a.itemId};
 a.video=null;
 a.job={state:'verified',plan:{selectedStage:'fiscal',video:null},result:{}};
 const audit=auditRootShopeeExecution(a);
 const stage=audit.stages.find(x=>x.id==='video');
 assert.equal(stage.status,'confirmed');
 assert.equal(stage.confirmedBy,'live_shopee_readback');
 assert.match(stage.reason,/Vídeo já publicado/);
 assert.equal(audit.pending.includes('video'),false);
});

test('video externo, processamento e ausencia de link exato nao comprovam publicacao do kit',()=>{
 const a=base();
 a.sku='TX24507L';a.itemId='58222301146';a.live.item_id=58222301146;
 a.review.kitOptimization={kitSku:'KIT-TX24507L-TX24508E',sku:a.sku,itemId:a.itemId};
 a.live.video_info=[{duration:10,video_url:'https://example.org/movie.mp4'}];
 assert.equal(auditRootShopeeExecution(a).stages.find(x=>x.id==='video').status,'pending');
 a.live.video_info=[{duration:10,video_url:'https://cvf.shopee.com.br/file/real.mp4',video_status:'PROCESSING'}];
 assert.equal(auditRootShopeeExecution(a).stages.find(x=>x.id==='video').status,'pending');
 a.live.video_info=[{duration:10,video_url:'https://cvf.shopee.com.br/file/real.mp4'}];
 a.review.kitOptimization.itemId='outro-anuncio';
 assert.equal(auditRootShopeeExecution(a).stages.find(x=>x.id==='video').status,'pending');
});

test('video importado no Manager continua exigindo correspondencia exata ao publicado',()=>{
 const a=base();
 a.sku='TX24507L';a.itemId='58222301146';a.live.item_id=58222301146;
 a.review.kitOptimization={kitSku:'KIT-TX24507L-TX24508E',sku:a.sku,itemId:a.itemId};
 a.live.video_info=[{duration:10,video_url:'https://cvf.shopee.com.br/file/old.mp4'}];
 a.video={sha256:'different-approved-video-sha',publication:null};
 assert.equal(auditRootShopeeExecution(a).stages.find(x=>x.id==='video').status,'pending');
});
