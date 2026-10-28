import {parseKitLogisticsText} from './kit-logistics-parser.js';
// OCR opcional no navegador para prints dos campos de logística do kit.
// Não envia o print ao servidor do Shopee Manager nem chama API paga.
let tesseractLoader=null;
async function loadTesseract(){
 if(globalThis.Tesseract?.createWorker)return globalThis.Tesseract;
 if(tesseractLoader)return tesseractLoader;
 tesseractLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  script.crossOrigin='anonymous';
  script.async=true;
  script.onload=()=>globalThis.Tesseract?.createWorker?
   resolve(globalThis.Tesseract):reject(Error('Leitor OCR não foi carregado.'));
  script.onerror=()=>reject(Error('Não foi possível carregar o leitor OCR. Confira a conexão com a internet.'));
  document.head.append(script);
 }).catch(error=>{tesseractLoader=null;throw error;});
 return tesseractLoader;
}
function logisticsScore(text){
 const {values}=parseKitLogisticsText(text);
 return ['weightKg','lengthCm','widthCm','heightCm'].filter(key=>values[key]!==undefined).length;
}
// Fundo escuro é comum em prints da WeDrop; em muitos casos o OCR só consegue
// ler os títulos e ignora os números pequenos. Inverter, ampliar e contrastar
// uma segunda versão local ajuda sem enviar a captura a qualquer servidor.
async function enhancePrintForOCR(file){
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.max(1,Math.min(2.4,3300/Math.max(bitmap.width,bitmap.height)));
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale);
  canvas.height=Math.round(bitmap.height*scale);
  if(canvas.width*canvas.height>13000000)throw Error('Print muito grande para OCR local.');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('O navegador não disponibilizou o processamento da captura.');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const image=ctx.getImageData(0,0,canvas.width,canvas.height);
  const px=image.data;
  // Medir o contraste global para decidir se o fundo é escuro.
  let avg=0,count=0;
  for(let i=0;i<px.length;i+=Math.max(4,Math.floor(px.length/30000/4)*4)){
   avg+=(px[i]*.299+px[i+1]*.587+px[i+2]*.114);count++;
  }
  const dark=avg/Math.max(1,count)<120;
  for(let i=0;i<px.length;i+=4){
   const base=px[i]*.299+px[i+1]*.587+px[i+2]*.114;
   const gray=dark?255-base:base;
   const level=Math.max(0,Math.min(255,128+(gray-128)*1.55));
   px[i]=px[i+1]=px[i+2]=level;
  }
  ctx.putImageData(image,0,0);
  return await new Promise((resolve,reject)=>canvas.toBlob(
   blob=>blob?resolve(blob):reject(Error('Não foi possível melhorar o print.')),'image/png'));
 }finally{bitmap.close();}
}
export async function recognizeKitLogisticsPrint(file,progress=()=>{}){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))
  throw Error('Escolha um print PNG, JPG ou WebP.');
 if(file.size>12*1024*1024)throw Error('O print deve ter até 12 MB.');
 progress('Preparando leitura do print...');
 let nativeText='';
 if(typeof globalThis.TextDetector==='function'){
  let bitmap;
  try{
   bitmap=await createImageBitmap(file);
   const detected=await(new globalThis.TextDetector()).detect(bitmap);
   nativeText=detected.sort((a,b)=>(a.boundingBox?.top||0)-(b.boundingBox?.top||0)||
    (a.boundingBox?.left||0)-(b.boundingBox?.left||0)).map(x=>x.rawValue).join('\n').trim();
   if(logisticsScore(nativeText)>=4){
    progress('Todos os campos do print identificados no navegador.');
    return nativeText;
   }
  }catch{
   // Sem TextDetector estável, usa OCR local em português.
  }finally{bitmap?.close?.();}
 }
 progress('Carregando OCR em português para leitura local...');
 const tess=await loadTesseract();
 let worker=null;
 try{
  worker=await tess.createWorker('por',1,{logger:message=>{
   if(message?.status==='recognizing text'&&Number.isFinite(message.progress))
    progress('Lendo print: '+Math.round(message.progress*100)+'%');
  }});
  const original=await worker.recognize(file);
  let best=String(original?.data?.text||'').trim();
  let bestScore=logisticsScore(best);
  if(logisticsScore(nativeText)>bestScore){best=nativeText;bestScore=logisticsScore(nativeText);}
  if(bestScore<4){
   progress('Realçando números e contraste do print...');
   try{
    const improved=await enhancePrintForOCR(file);
    const result=await worker.recognize(improved);
    const alternate=String(result?.data?.text||'').trim();
    const alternateScore=logisticsScore(alternate);
    if(alternateScore>bestScore||
       (alternateScore===bestScore&&alternate.length>best.length)){
      best=alternate;bestScore=alternateScore;
    }
   }catch{
    // Manter o melhor texto já recuperado se a melhoria não funcionar.
   }
  }
  if(!best)throw Error('O print não apresentou texto legível. Envie o arquivo original em melhor resolução ou cole o texto.');
  progress('Print lido; '+bestScore+' de 4 campos de medidas/peso identificados. Confira os resultados.');
  return best;
 }finally{if(worker)await worker.terminate().catch(()=>{});}
}
