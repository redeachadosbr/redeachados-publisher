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
export async function recognizeKitLogisticsPrint(file,progress=()=>{}){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))
  throw Error('Escolha um print PNG, JPG ou WebP.');
 if(file.size>12*1024*1024)throw Error('O print deve ter até 12 MB.');
 progress('Preparando leitura do print...');
 // Se o navegador tem OCR próprio, evitar downloads adicionais.
 if(typeof globalThis.TextDetector==='function'){
  let bitmap;
  try{
   bitmap=await createImageBitmap(file);
   const detected=await(new globalThis.TextDetector()).detect(bitmap);
   const text=detected.sort((a,b)=>(a.boundingBox?.top||0)-(b.boundingBox?.top||0)||
    (a.boundingBox?.left||0)-(b.boundingBox?.left||0)).map(x=>x.rawValue).join('\n').trim();
   if(text.length>=25){progress('Texto do print identificado no navegador.');return text;}
  }catch{
   // A API ainda não está disponível em todos os navegadores; usar fallback.
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
  const result=await worker.recognize(file);
  const text=String(result?.data?.text||'').trim();
  if(!text)throw Error('O print não apresentou texto legível. Envie um recorte mais nítido ou cole o texto manualmente.');
  progress('Texto extraído. Conferindo campos...');
  return text;
 }finally{if(worker)await worker.terminate().catch(()=>{});}
}
