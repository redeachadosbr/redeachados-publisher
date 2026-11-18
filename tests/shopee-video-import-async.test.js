import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startOptimizerVideoImport,statusOptimizerVideoImport} from '../shopeeVideoImportJobs.js';

const identity={shopId:1,itemId:58222633999,modelId:0,sku:'VIDEO-SKU'};
const file={filename:'cachorro.mp4',sizeBytes:12345,sha256:'a'.repeat(64)};
const eventually=async predicate=>{
 for(let n=0;n<50;n++){
  if(predicate())return;
  await new Promise(r=>setTimeout(r,10));
 }
 throw Error('A tarefa não mudou para o estado esperado.');
};

test('responde processamento antes de aguardar FFmpeg; resultado só para SKU correta',async()=>{
 let finish;
 const held=new Promise(r=>finish=r);
 const job=startOptimizerVideoImport(identity,file,async progress=>{
  progress('Ajustando para 59 segundos');
  return await held;
 });
 assert.equal(job.status,'processing');
 assert.equal(job.processing,true);
 assert.equal(statusOptimizerVideoImport({...identity,sku:'OUTRA'},job.jobId),null);
 assert.equal(statusOptimizerVideoImport(identity,job.jobId)?.status,'processing');
 assert.equal(startOptimizerVideoImport(identity,file,async()=>{throw Error('Duplicado')}).jobId,job.jobId);
 await new Promise(r=>setImmediate(r));
 finish({ok:true,asset:{filename:'cachorro.mp4'},trimmedForShopee:true});
 await eventually(()=>statusOptimizerVideoImport(identity,job.jobId)?.status==='complete');
 assert.equal(statusOptimizerVideoImport(identity,job.jobId).result.trimmedForShopee,true);
});

test('erro da conversão é consultável e nunca vira sucesso falso',async()=>{
 const who={...identity,itemId:2};
 const job=startOptimizerVideoImport(who,{...file,sha256:'b'.repeat(64)},
  async()=>{throw Error('Conversão indisponível')});
 await eventually(()=>statusOptimizerVideoImport(who,job.jobId)?.status==='error');
 assert.match(statusOptimizerVideoImport(who,job.jobId).error,/Conversão indisponível/);
});

test('rotas respondem HTTP 202 e só informam sucesso após salvar a mídia',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/api\/shopee\/optimizer\/video\/import-status'/);
 assert.match(server,/res\.status\(202\)\.json\(job\)/);
 assert.match(server,/startOptimizerVideoImport\(info,/);
 assert.match(server,/normalizeManualVideo\(input,\{allowSlightlyLonger:true\}\)/);
 assert.match(app,/async function optimizerVideoWaitImport\(identity,jobId\)/);
 assert.match(app,/saved=response\.processing/);
 assert.match(app,/optimizerVideoWaitImport\(identity,response\.jobId\)/);
 assert.match(app,/optimizerVideoRecoverImport\(identity,file,uploadStartedAt\)/);
 assert.match(html,/app\.js\?v=3\.5\.79-finance-video-import-async/);
});
