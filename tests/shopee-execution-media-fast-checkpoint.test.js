import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {optimizeShopeeImagePayload} from '../shopeeImageTransfer.js';

const images=Array.from({length:9},(_,i)=>({slot:i+1,mime_type:'image/png',sha256:'abc-'+i}));
const plan={requiresExplicitConfirmation:true,canExecute:true,images,selectedStage:'images',
 original:{},proposed:{},shopId:123,itemId:58214692629,modelId:0,sku:'CO2317261'};

test('a segunda foto usa checkpoint do mesmo job sem auditar novamente o anúncio',async()=>{
 const called=[];
 const io={
  validateIdentity:async()=>{throw Error('consulta indevida');},
  read:async()=>{throw Error('leitura indevida');},
  downloadImage:async(asset)=>{called.push('download:'+asset.slot);return Buffer.from('foto');},
  media:{image:async()=>{called.push('upload');return 'image-shopee-02';}}
 };
 const job={plan,result:{phase:'images_upload',imageIds:['image-shopee-01']}};
 const output=await advanceShopeeExecution(job,io);
 assert.deepEqual(called,['download:2','upload']);
 assert.equal(output.state,'running');
 assert.deepEqual(output.result.imageIds,['image-shopee-01','image-shopee-02']);
 assert.equal(output.delay,500);
 assert.equal(output.result.events.at(-1).key,'image-2');
});

test('depois da última foto, a auditoria oficial volta a ser obrigatória',async()=>{
 const called=[];
 const io={
  validateIdentity:async()=>{called.push('identity');throw Error('identidade a conferir');},
  read:async()=>{called.push('read');throw Error('não esperado');},
  downloadImage:async()=>{throw Error('não repetir upload');},media:{image:async()=>{throw Error('não repetir upload');}}
 };
 const job={plan,result:{phase:'images_upload',
  imageIds:images.map((_,i)=>'confirmed-'+(i+1))}};
 await assert.rejects(()=>advanceShopeeExecution(job,io),/identidade a conferir/);
 assert.deepEqual(called,['identity']);
});

test('primeiro upload não pula leitura oficial e falha com anúncio divergente',async()=>{
 const called=[];
 const io={
  validateIdentity:async()=>{called.push('identity');throw Error('SKU diferente');},
  read:async()=>{called.push('read');throw Error('não esperado');},
  downloadImage:async()=>{throw Error('não fazer upload');},media:{image:async()=>{throw Error('não fazer upload');}}
 };
 await assert.rejects(()=>advanceShopeeExecution({plan,result:{phase:'queued',imageIds:[]}},io),/SKU diferente/);
 assert.deepEqual(called,['identity']);
});

test('uma falha em mídia não altera o checkpoint anterior',async()=>{
 const previous=['image-shopee-01','image-shopee-02'];
 const io={validateIdentity:async()=>{throw Error('não usar');},read:async()=>{throw Error('não usar');},
  downloadImage:async()=>Buffer.from('foto'),
  media:{image:async()=>{throw Error('Shopee indisponível');}}};
 const job={plan,result:{phase:'images_upload',imageIds:[...previous]}};
 await assert.rejects(()=>advanceShopeeExecution(job,io),/Shopee indisponível/);
 assert.deepEqual(job.result.imageIds,previous);
});

test('fast path não contém escrita de produto, e a verificação antecede update_item',()=>{
 const source=readFileSync(new URL('../shopeeExecutionWorker.js',import.meta.url),'utf8');
 const from=source.indexOf('async function uploadNextApprovedImage(');
 const to=source.indexOf('// One durable step per lease.',from);
 const body=source.slice(from,to);
 assert(!/io\.update|io\.beforeWrite/.test(body));
 assert.match(source,/if\(result\.phase==='images_upload'/);
 assert.match(source,/assertLiveShopeeUnchanged\(plan,currentItem,result\)/);
});

test('PNG de vários megabytes é reduzido apenas para transporte, sem alterar original',async()=>{
 const original=Buffer.alloc(2_500_000,1);
 const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(100_000,4),Buffer.from([255,217])]);
 const prepared=await optimizeShopeeImagePayload(original,'image/png',async buffer=>{
  assert.equal(buffer,original);return jpeg;
 });
 assert.equal(prepared.optimized,true);
 assert.equal(prepared.mime,'image/jpeg');
 assert.equal(prepared.file,jpeg);
 assert.equal(original.length,2_500_000);
});
test('imagem pequena e compressão inválida preservam o arquivo aprovado',async()=>{
 const small=Buffer.alloc(30_000,1);
 const same=await optimizeShopeeImagePayload(small,'image/png',async()=>{throw Error('não usar encoder');});
 assert.equal(same.file,small);
 const large=Buffer.alloc(2_500_000,1);
 const invalid=await optimizeShopeeImagePayload(large,'image/png',async()=>Buffer.from('não é jpg'));
 assert.equal(invalid.file,large);
 assert.equal(invalid.optimized,false);
});
test('executor evita segunda leitura após validar identidade na Shopee',async()=>{
 const item={item_id:58214692629,item_name:'Antes',description:'',description_type:'normal',
  image:{image_id_list:[]},video_info:[]};
 const approved={...plan,original:{...item,category_id:123},images:images.slice(0,1)};
 const calls=[];
 const io={validateIdentity:async()=>{calls.push('identity');return item;},
  read:async()=>{calls.push('read');return item;},
  downloadImage:async()=>{calls.push('image');return Buffer.from('imagem');},
  media:{image:async()=>{calls.push('media');return 'id-01';}}};
 const output=await advanceShopeeExecution({plan:approved,result:{phase:'queued'}},io);
 assert.equal(output.state,'running');
 assert.deepEqual(calls,['identity','image','media']);
});
