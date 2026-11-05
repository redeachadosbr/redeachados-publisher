import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';

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
