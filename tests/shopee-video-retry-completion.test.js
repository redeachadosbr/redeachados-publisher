import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';
import {hasRejectedShopeeVideo,prepareRejectedVideoRetry,guardRejectedVideoCompletion} from '../shopeeExecutionVideoRecovery.js';
import {videoMatches} from '../shopeeExecutionPlan.js';

const imageIds=Array.from({length:9},(_,i)=>'image-approved-'+i);
const plan={itemId:'58272083884',sku:'TRC0413',requiresExplicitConfirmation:true,canExecute:true,
 selectedStage:'all',proposed:{item_name:'Escova aprovada'},images:imageIds.map((id,slot)=>({slot,shopee_image_id:id})),
 video:{sha256:'b'.repeat(64),filename:'escova.mp4'},
 original:{item_name:'Antes',description:'',description_type:'normal',video_info:[],image:{image_id_list:imageIds}}};
const live=()=>({item_id:58272083884,item_status:'NORMAL',item_name:'Escova aprovada',
 description:'',description_type:'normal',image:{image_id_list:imageIds},video_info:[]});
const result=()=>({phase:'video_attach_ready',contentVerified:true,imageIds,
 video:{id:'old-task',phase:'ready',videoInfo:{video_url_list:[]}}});
const job=()=>({state:'running',plan,result:result()});

test('tarefa recusada renova somente vídeo e exige readback real antes de concluir',async()=>{
 let current=live(),j=job(),starts=0,downloads=0;
 const writes=[],checkpoints=[];
 const io={read:async()=>current,validateIdentity:async()=>{},
  beforeWrite:async r=>checkpoints.push(r.phase),
  download:async asset=>{assert.equal(asset.sha256,plan.video.sha256);downloads++;return Buffer.from('video');},
  media:{init:async()=>{starts++;return {video_upload_id:'fresh-task'};},part:async()=>{},
   result:async()=>({status:'SUCCEEDED',video_info:{video_url_list:[{video_url:'https://cvf.shopee.com.br/new.mp4'}]}})},
  update:async body=>{
   writes.push(body);
   if(body.video_upload_id[0]==='old-task')throw Error('video task not found');
   return {request_id:'accepted-new-video'};
  }};
 let out=await advanceShopeeExecution(j,io);
 assert.equal(out.result.phase,'video_retry_upload');
 assert.equal(out.result.videoRetryCount,1);
 assert.equal(out.result.video,null);
 for(let i=0;i<5;i++){
  j={...j,state:out.state,result:out.result};
  out=await advanceShopeeExecution(j,io);
 }
 assert.equal(starts,1);
 assert.ok(downloads>0);
 assert.equal(out.state,'running');
 assert.equal(out.result.phase,'video_attach_verifying');
 assert.equal(writes.length,2);
 for(const body of writes)assert.deepEqual(Object.keys(body).sort(),['item_id','video_upload_id']);
 assert.deepEqual(writes.map(x=>x.video_upload_id[0]),['old-task','fresh-task']);
 assert.deepEqual(checkpoints,['video_attach_updating','video_attach_updating']);
 assert.equal(shopeeExecutionProgress({...j,result:out.result}).videoPublished,false);
 current={...current,video_info:[{video_id:'fresh-task',video_url:'https://cvf.shopee.com.br/new.mp4'}]};
 out=await advanceShopeeExecution({...j,result:out.result},io);
 assert.equal(out.state,'verified');
 assert.equal(out.result.videoReadbackConfirmed,true);
 assert.equal(out.result.videoExactReadbackConfirmed,true);
 assert.equal(out.result.videoRejected,false);
 assert.equal(writes.length,2);
});

test('concluir desconto não apaga falha do vídeo nem nove imagens confirmadas',async()=>{
 const snapshot={shopId:1,sku:'TRC0413',itemId:plan.itemId,modelId:0,discountId:7,
  gross:68.90,promo:48.59,originalPrice:68.90,action:'already'};
 const j={...job(),plan:{...plan,commercialDiscount:{snapshot}},result:{...result(),
  phase:'discount_verifying',primaryVerified:true,videoRejected:true,videoError:'video task not found',videoRetryCount:1}};
 const out=await advanceShopeeExecution(j,{discountRead:async()=>snapshot});
 assert.equal(out.state,'failed');
 assert.equal(out.result.phase,'video_attach_rejected');
 assert.equal(out.result.discount.status,'verified');
 assert.equal(out.result.verified,false);
 assert.match(out.lastError,/video task not found/);
 const p=shopeeExecutionProgress({...j,state:out.state,result:out.result,last_error:out.lastError});
 assert.equal(p.imagesPublished,9);
 assert.equal(p.videoPublished,false);
 assert.equal(p.verified,false);
 assert.equal(p.steps.find(x=>x.id==='discount').status,'done');
});

test('recupera legado verified sem last_error e mantém etapas concluídas',()=>{
 const old={...job(),state:'verified',last_error:null,result:{...result(),phase:'verified',
  videoRejected:true,videoError:'video task not found',discount:{status:'verified'},fiscal:{status:'verified'}}};
 assert.equal(hasRejectedShopeeVideo(old),true);
 const out=guardRejectedVideoCompletion({state:old.state,result:old.result},plan);
 assert.equal(out.state,'failed');
 const retry=prepareRejectedVideoRetry(old,live(),{explicit:true});
 assert.equal(retry.discount.status,'verified');
 assert.equal(retry.fiscal.status,'verified');
 assert.equal(retry.video,null);
 assert.deepEqual(retry.imageIds,imageIds);
});

test('não renova após resultado incerto, mudança de vídeo ou limite de tentativas',()=>{
 const rejected={...job(),state:'failed',last_error:'video task not found',
  result:{...result(),videoRejected:true,videoError:'video task not found'}};
 assert.throws(()=>prepareRejectedVideoRetry({...rejected,last_error:'timeout',
  result:{...result(),videoError:'timeout'}},live()),/falha de vídeo/);
 assert.throws(()=>prepareRejectedVideoRetry(rejected,{...live(),item_id:1}),/diverge/);
 assert.throws(()=>prepareRejectedVideoRetry(rejected,{...live(),video_info:[{video_id:'other'}]}),/publicado/);
 assert.throws(()=>prepareRejectedVideoRetry({...rejected,result:{...rejected.result,videoRetryCount:1}},live()),/também foi recusada/);
});

test('falha ou vídeo já publicado não causa nova escrita e retomada nunca repete fiscal/desconto',async()=>{
 const published={...live(),video_info:[{video_id:'fresh-task'}]};
 const out=await advanceShopeeExecution({...job(),plan:{...plan,finalFiscal:{origin:'2'},commercialDiscount:{}},
  result:{...result(),phase:'video_retry_upload',videoRetryCount:1,videoRejected:true,
   video:{id:'fresh-task',phase:'ready'},fiscal:{status:'verified'},discount:{status:'verified'}}},{
   validateIdentity:async()=>{},read:async()=>published,
   download:async()=>{throw Error('Não baixar');},update:async()=>{throw Error('Não escrever');}});
 assert.equal(out.state,'verified');
 assert.equal(out.result.videoRejected,false);
});

test('mesmo ID com status FAILED não é prova de vídeo publicado',()=>{
 assert.equal(videoMatches({video_info:[{video_id:'old-task',status:'FAILED'}]},result().video),false);
});

test('timeout no vínculo não renova upload nem repete update_item',async()=>{
 let writes=0;
 const io={read:async()=>live(),validateIdentity:async()=>{},beforeWrite:async()=>{},
  update:async()=>{writes++;throw Error('network timeout');}};
 const out=await advanceShopeeExecution(job(),io);
 assert.equal(out.state,'uncertain');
 assert.equal(out.result.videoRetryCount,undefined);
 assert.equal(writes,1);
 const readback=await advanceShopeeExecution({...job(),result:out.result,state:out.state},io);
 assert.equal(writes,1);
 assert.equal(readback.result.phase,'video_attach_verifying');
});

test('tarefa repetida na renovação é parada antes de qualquer vínculo',async()=>{
 const rejected={...job(),result:{...result(),videoRejected:true,videoError:'video task not found'}};
 const retry=prepareRejectedVideoRetry(rejected,live());
 const out=await advanceShopeeExecution({...job(),result:retry},{
  read:async()=>live(),validateIdentity:async()=>{},download:async()=>Buffer.from('approved'),
  media:{init:async()=>({video_upload_id:'old-task'})},
  update:async()=>{throw Error('Nunca reenviar tarefa rejeitada');}});
 assert.equal(out.state,'failed');
 assert.equal(out.result.video,null);
 assert.match(out.lastError,/mesma tarefa recusada/);
});

test('painel e botão não confirmam legado verified com vídeo recusado e erro apagado',()=>{
 const document={getElementById:()=>null};
 const context={document};context.globalThis=context;
 vm.runInNewContext(readFileSync(new URL('../public/optimizer-execution-visual.js',import.meta.url),'utf8'),context);
 const old={...job(),state:'verified',last_error:null,result:{...result(),phase:'verified',
  primaryVerified:true,videoRejected:true,videoError:'video task not found'}};
 const p=shopeeExecutionProgress(old);
 const ui=context.RAExecutionVisual.derive({job:old,progress:p});
 assert.equal(ui.states[0],'done');
 assert.equal(ui.states[1],'error');
 assert.notEqual(ui.states[8],'done');
 assert.equal(ui.active,1);
 assert.match(ui.title,/incompleto/);
 assert.doesNotMatch(ui.detail,/fotos estão apenas na mídia/);
 const dialog=readFileSync(new URL('../public/optimizer-execution-dialog.js',import.meta.url),'utf8');
 assert.match(dialog,/phase==='verified'&&!data.videoTaskRejected/);
});

test('prévia com somente vídeo direciona clique único para o escopo vídeo sem exigir desconto',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/function optimizerIsVideoOnlyPreparedPlan\(plan\)/);
 assert.match(app,/plan\.actions\.length===1&&plan\.actions\[0\]==='video'/);
 assert.match(app,/optimizerExecJob\?\.state==='prepared'&&optimizerIsVideoOnlyPreparedPlan/);
 assert.match(app,/if\(videoOnly\)\{\s*\$\('#optimizerExecutionScope'\)\.value='all'/);
 assert.match(app,/p\?\.selectedStage==='video'\|\|optimizerIsVideoOnlyPreparedPlan\(p\)/);
});

test('vínculo recusado permite uma reconexão do mesmo vídeo processado sem criar novo upload',async()=>{
 const {prepareRejectedVideoRelink}=await import('../shopeeExecutionVideoRecovery.js');
 const previous={...job(),state:'failed',last_error:'video task not found',result:{
  ...result(),videoRetryCount:1,videoRejected:true,videoError:'video task not found',phase:'video_attach_rejected'}};
 const relink=prepareRejectedVideoRelink(previous,live());
 assert.equal(relink.phase,'video_attach_wait_propagation');
 assert.equal(relink.video.id,'old-task');
 assert.equal(relink.videoRelinkCount,1);
 let writes=0,uploads=0,reads=0;
 const io={read:async()=>live(),validateIdentity:async()=>{},
  download:async()=>{uploads++;throw Error('Não baixar novamente');},
  media:{result:async()=>{reads++;return {status:'SUCCEEDED'};}},
  beforeWrite:async()=>{},
  update:async body=>{writes++;assert.deepEqual(body.video_upload_id,['old-task']);return {request_id:'accepted'};}};
 let out=await advanceShopeeExecution({...previous,state:'running',result:relink},io);
 assert.equal(out.result.phase,'video_attach_wait_propagation');
 assert.equal(writes,0);assert.equal(reads,0);assert.equal(uploads,0);
 out=await advanceShopeeExecution({...previous,state:'running',result:{...relink,videoRelinkAt:Date.now()-91000}},io);
 assert.equal(out.result.phase,'video_attach_ready');assert.equal(reads,1);
 out=await advanceShopeeExecution({...previous,state:'running',result:out.result},io);
 assert.equal(out.result.phase,'video_attach_verifying');assert.equal(writes,1);assert.equal(uploads,0);
 assert.throws(()=>prepareRejectedVideoRelink({...previous,result:{...previous.result,videoRelinkCount:1}},live()),/recusou também/);
});

test('percentual não chega perto de 100 com vídeo não publicado',()=>{
 const j={...job(),state:'failed',last_error:'video task not found',
 result:{...result(),videoRejected:true,videoError:'video task not found',primaryVerified:true,discount:{status:'verified'}}};
 const p=shopeeExecutionProgress(j);
 assert.equal(p.videoPublished,false);
 assert.ok(p.percent<=80,'no false 97% when upload is staged');
 assert.equal(p.verified,false);
});

test('plano completo somente com vídeo não exige nova prévia nem desconto',async()=>{
 const {isShopeeVideoOnlyPlan}=await import('../shopeeExecutionPlan.js');
 const only={selectedStage:'all',canExecute:true,
  actions:['video'],video:{sha256:'a'.repeat(64)},images:[],proposed:{},
  finalFiscal:null,modelVariations:null,kitDiscount:null,discountOnly:false};
 assert.equal(isShopeeVideoOnlyPlan(only),true);
 assert.equal(isShopeeVideoOnlyPlan({...only,actions:['video','tax_info']}),false);
 assert.equal(isShopeeVideoOnlyPlan({...only,selectedStage:'discount'}),false);
 assert.equal(isShopeeVideoOnlyPlan({...only,proposed:{item_name:'new title'}}),false);
 assert.equal(isShopeeVideoOnlyPlan({...only,commercialDiscount:{snapshot:{}}}),false);
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(source,/!linkedKit&&!isShopeeVideoOnlyPlan\(plan\)/);
 const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(ui,/if\(videoOnly\)\{\s*\$\('#optimizerExecutionScope'\)\.value='all'/);
 assert.match(ui,/if\(optimizerIsVideoOnlyPreparedPlan\(plan\)\)return true;/);
 assert.match(ui,/!optimizerIsVideoOnlyPreparedPlan\(p\)&&!optimizerKitWorkflowActive/);
 assert.match(ui,/optimizerExecutionPrepare\(\{fromExecutionClick:true\}\)/);
});
