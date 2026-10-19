// Client-side, lossless-in-composition preparation of ChatGPT images for Shopee.
// Any non-square source is fitted completely inside a 1200x1200 canvas.
// The original bitmap is never cropped, stretched or overwritten.
export async function prepareSquareImage(file,{size=1200,maxBytes=10*1024*1024}={}){
 if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('Arquivo de imagem vazio ou inválido.');
 if(!Number.isInteger(size)||size<1)throw Error('Dimensão quadrada inválida.');
 if(!Number.isFinite(maxBytes)||maxBytes<=0)throw Error('Limite de arquivo inválido.');
 const bitmap=await createImageBitmap(file);
 try{
  const width=bitmap.width,height=bitmap.height;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)
   throw Error('Não foi possível identificar as dimensões da imagem.');
  const canvas=document.createElement('canvas');
  canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Conversão de imagens não está disponível neste navegador.');
  const scale=Math.min(size/width,size/height);
  const targetWidth=Math.min(size,Math.round(width*scale));
  const targetHeight=Math.min(size,Math.round(height*scale));
  const left=(size-targetWidth)/2,top=(size-targetHeight)/2;
  ctx.fillStyle='#f8fafc';
  ctx.fillRect(0,0,size,size);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap,left,top,targetWidth,targetHeight);
  const encode=(type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(
   value=>value?resolve(value):reject(Error('Não foi possível converter a imagem.')),type,quality
  ));
  let blob=await encode('image/png');
  if(blob.size>maxBytes){
   // JPEG output shares the neutral canvas background and cannot exceed storage limits.
   for(const quality of [0.92,0.82,0.72]){
    blob=await encode('image/jpeg',quality);
    if(blob.size<=maxBytes)break;
   }
  }
  if(blob.size>maxBytes)throw Error('Imagem preparada excede 10 MB; revise o arquivo original.');
  return {blob,wasPadded:width!==height,sourceWidth:width,sourceHeight:height};
 }finally{bitmap.close?.();}
}
