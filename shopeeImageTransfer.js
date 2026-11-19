// Imagens aprovadas permanecem intactas no Storage. A conversão para JPEG
// acontece só na transferência à biblioteca Shopee e nunca altera SHA/rascunho.
import {spawn} from 'node:child_process';
export const OPTIMIZE_PNG_THRESHOLD_BYTES=1_400_000;
const JPEG_LIMIT_MS=20000;
export async function encodeShopeeJpeg(file){
 return new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/ffmpeg',[
   '-hide_banner','-loglevel','error','-nostdin',
   '-i','pipe:0','-f','lavfi','-i','color=c=white:s=1200x1200',
   '-filter_complex','[1:v][0:v]overlay=shortest=1:format=auto,format=yuv420p',
   '-frames:v','1','-q:v','2','-f','image2pipe','-vcodec','mjpeg','pipe:1'
  ],{stdio:['pipe','pipe','pipe']});
  let settled=false,stderr='',total=0;
  const parts=[];
  const finish=(error,result)=>{
   if(settled)return;
   settled=true;clearTimeout(timer);
   error?reject(error):resolve(result);
  };
  const timer=setTimeout(()=>{
   child.kill('SIGKILL');
   finish(Error('Otimização de imagem excedeu 20 segundos.'));
  },JPEG_LIMIT_MS);
  child.stdout.on('data',chunk=>{
   total+=chunk.length;
   if(total>12*1024*1024){child.kill('SIGKILL');finish(Error('Saída JPEG excedeu o limite.'));}
   else parts.push(chunk);
  });
  child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-600);});
  child.once('error',error=>finish(error));
  child.once('close',code=>code===0?finish(null,Buffer.concat(parts)):
   finish(Error('Conversão JPEG recusada: '+stderr.slice(0,130))));
  child.stdin.on('error',()=>{});
  child.stdin.end(file);
 });
}
const validJpeg=b=>Buffer.isBuffer(b)&&b.length>4&&
 b[0]===255&&b[1]===216&&b[b.length-2]===255&&b[b.length-1]===217;
export async function optimizeShopeeImagePayload(file,mime,encode=encodeShopeeJpeg){
 const original=Buffer.isBuffer(file)?file:Buffer.from(file);
 if(mime!=='image/png'||original.length<OPTIMIZE_PNG_THRESHOLD_BYTES)
  return {file:original,mime,optimized:false};
 try{
  const jpeg=await encode(original);
  if(validJpeg(jpeg)&&jpeg.length<original.length*0.85){
   return {file:jpeg,mime:'image/jpeg',optimized:true};
  }
 }catch(error){
  console.warn('[shopee-image-transfer] Conversão opcional indisponível, preservando PNG:',
   String(error.message||error).slice(0,120));
 }
 return {file:original,mime,optimized:false};
}
