import test from 'node:test';
import assert from 'node:assert/strict';
import {promisify} from 'node:util';
import {execFile,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {normalizeManualVideo} from '../shopeeVideoValidation.js';
const run=promisify(execFile),available=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
test('server verifies real duration and converts WebM before a Shopee upload',{skip:!available},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shopee-test-video-'));
 try{
  const file=path.join(dir,'fixture.webm');
  await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=320x240:r=10','-t','10','-c:v','libvpx-vp9','-threads','1',file]);
  const result=await normalizeManualVideo(await readFile(file));
  assert.equal(result.converted,true);assert.equal(result.buffer.toString('ascii',4,8),'ftyp');assert.ok(result.duration>=10&&result.duration<=60);
  const short=path.join(dir,'short.mp4');
  await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=320x240:r=10','-t','1','-c:v','libx264','-threads','1',short]);
  await assert.rejects(normalizeManualVideo(await readFile(short)),/10 e 60/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Otimizador importa vídeo de 61,7 s com ajuste para 59 s sem liberar o limite dos kits',{skip:!available},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shopee-optimizer-video-'));
 try{
  const file=path.join(dir,'long.mp4');
  await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=green:s=160x120:r=10',
   '-t','61.7','-c:v','libx264','-threads','1','-pix_fmt','yuv420p',file]);
  const original=await readFile(file);
  await assert.rejects(normalizeManualVideo(original),/10 e 60/);
  const safe=await normalizeManualVideo(original,{allowSlightlyLonger:true});
  assert.equal(safe.trimmed,true);
  assert.equal(safe.converted,true);
  assert.ok(safe.originalDuration>60&&safe.originalDuration<=65);
  const output=path.join(dir,'trimmed.mp4');
  await writeFile(output,safe.buffer);
  const {stdout}=await run('ffprobe',['-v','error','-show_entries','format=duration',
   '-of','default=noprint_wrappers=1:nokey=1',output]);
  const actual=Number(stdout.trim());
  assert.ok(actual>=58&&actual<60,'Duração pós-conversão deve ser menor que 60s: '+actual);
  assert.ok(safe.duration>=58&&safe.duration<60);
  const tooLong=path.join(dir,'too-long.mp4');
  await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=160x120:r=10',
   '-t','66','-c:v','libx264','-threads','1','-pix_fmt','yuv420p',tooLong]);
  await assert.rejects(normalizeManualVideo(await readFile(tooLong),{allowSlightlyLonger:true}),/10 e 65/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('UI e servidor aceitam até 65 s no otimizador; kits mantêm validação original',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const kit=readFileSync(new URL('../shopeeKitPublicationService.js',import.meta.url),'utf8');
 assert.match(app,/optimizerVideoMaxInputDuration=65/);
 assert.match(app,/duration<10\|\|duration>optimizerVideoMaxInputDuration/);
 assert.match(app,/const needsTrim=duration>60/);
 assert.match(html,/Selecionar MP4, MOV ou WebM \(10 a 65 segundos/);
 assert.match(server,/normalizeManualVideo\(input,\{allowSlightlyLonger:true\}\)/);
 assert.match(server,/normalizeManualVideo\(Buffer\.concat\(buffers,bytes\),\{allowSlightlyLonger:true\}\)/);
 assert.match(kit,/normalizeManualVideo\(buffer\)/);
});
