import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {MAX_VIDEO_BYTES} from './shopeeManualVideo.js';
const run=promisify(execFile);
// A margem de 5 segundos vale somente para importação no Otimizador.
// O original acima de 60 segundos é convertido e cortado antes de qualquer envio à Shopee.
export const OPTIMIZER_VIDEO_MAX_INPUT_DURATION=65;
export const SHOPEE_SAFE_VIDEO_DURATION=59;
export async function normalizeManualVideo(buffer,{allowSlightlyLonger=false}={}){
 if(!Buffer.isBuffer(buffer)||buffer.length<16||buffer.length>MAX_VIDEO_BYTES)throw Error('O vídeo deve ter até 30 MB.');
 const dir=await mkdtemp(path.join(tmpdir(),'shopee-video-'));
 try{
  const input=path.join(dir,'input'),output=path.join(dir,'output.mp4');
  await writeFile(input,buffer,{mode:0o600});
  let info;
  try{
   const {stdout}=await run('ffprobe',['-v','error','-protocol_whitelist','file,pipe',
    '-show_format','-show_streams','-of','json',input],{timeout:25000,maxBuffer:1024*1024});
   info=JSON.parse(stdout);
  }catch{throw Error('Não foi possível validar o arquivo de vídeo no servidor. Use MP4, MOV ou WebM íntegro.');}
  const stream=info.streams?.find(x=>x.codec_type==='video');
  const duration=Number(info.format?.duration||stream?.duration);
  const maxDuration=allowSlightlyLonger?OPTIMIZER_VIDEO_MAX_INPUT_DURATION:60;
  if(!stream||!Number.isFinite(duration)||duration<10||duration>maxDuration)
   throw Error('O vídeo deve ter duração entre 10 e '+maxDuration+' segundos.');
  const trimForShopee=allowSlightlyLonger&&duration>60;
  if(!(stream.width>0&&stream.height>0)||stream.width>4096||stream.height>4096)
   throw Error('Resolução do vídeo inválida ou maior que 4096 pixels.');
  const audio=info.streams?.filter(x=>x.codec_type==='audio')||[];
  const mp4Brand=['isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1','M4V '].includes(buffer.toString('ascii',8,12));
  const compatible=buffer.toString('ascii',4,8)==='ftyp'&&mp4Brand&&stream.codec_name==='h264'&&
    stream.pix_fmt==='yuv420p'&&audio.every(x=>x.codec_name==='aac')&&Math.max(stream.width,stream.height)<=1920;
  if(compatible&&!trimForShopee)
   return {buffer,duration,originalDuration:duration,width:stream.width,height:stream.height,
    converted:false,trimmed:false};
  try{
   await run('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',input,
    ...(trimForShopee?['-t',String(SHOPEE_SAFE_VIDEO_DURATION)]:[]),
    '-map','0:v:0','-map','0:a:0?','-vf',"scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-c:v','libx264','-threads','1','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',
    '-maxrate','2500k','-bufsize','5000k','-c:a','aac','-b:a','128k','-movflags','+faststart',output],
    {timeout:120000,maxBuffer:1024*1024});
  }catch{throw Error('Não foi possível converter o vídeo. Envie MP4 H.264 com até 30 MB.');}
  const converted=await readFile(output);
  if(converted.length>MAX_VIDEO_BYTES)throw Error('O vídeo convertido excede 30 MB. Reduza o tamanho e importe novamente.');
  return {buffer:converted,duration:trimForShopee?SHOPEE_SAFE_VIDEO_DURATION:duration,
   originalDuration:duration,converted:true,trimmed:trimForShopee};
 }finally{await rm(dir,{recursive:true,force:true});}
}
