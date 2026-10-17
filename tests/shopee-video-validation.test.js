import test from 'node:test';
import assert from 'node:assert/strict';
import {promisify} from 'node:util';
import {execFile,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
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
