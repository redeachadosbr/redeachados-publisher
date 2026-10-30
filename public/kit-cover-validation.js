// A foto da WeDrop e a folha de referências nunca são imagens publicitárias.
// Validação conservadora SOMENTE da capa 01: não interfere nas posições 02–09.
export function looksLikeKitReferenceMontage(pixels,width,height,panels=3){
 if(!pixels||!Number.isInteger(width)||!Number.isInteger(height)||width<48||height<48
   ||![2,3].includes(panels))return false;
 const idx=(x,y)=>4*(Math.min(height-1,Math.max(0,y))*width+Math.min(width-1,Math.max(0,x)));
 const white=(x,y)=>{
  const p=idx(Math.round(x),Math.round(y));
  return pixels[p]>=236&&pixels[p+1]>=236&&pixels[p+2]>=236;
 };
 const top=Math.floor(height*.23),end=Math.floor(height*.78),step=Math.max(1,Math.floor(height/95));
 // Cada quadro deve ter conteúdo visual real, com corredores brancos
 // estreitos entre fotografias; um fundo branco vazio não é suficiente.
 let filledPanels=0;
 for(let i=0;i<panels;i++){
  let content=0,total=0;
  const lo=Math.floor(width*(i+.18)/panels),hi=Math.ceil(width*(i+.82)/panels);
  for(let y=top;y<end;y+=step)for(let x=lo;x<hi;x+=Math.max(1,Math.floor(width/110))){
   total++;if(!white(x,y))content++;
  }
  if(content/Math.max(1,total)>.10)filledPanels++;
 }
 if(filledPanels!==panels)return false;
 let gutters=0;
 for(let i=1;i<panels;i++){
  const boundary=Math.round(width*i/panels),dx=Math.max(2,Math.round(width*.024));
  let clear=0,contrast=0,total=0;
  for(let y=top;y<end;y+=step){
   total++;
   if(white(boundary,y)&&white(boundary-dx*.3,y)&&white(boundary+dx*.3,y)){
    clear++;
    // Pelo menos um lado contém foto enquanto a coluna central está branca.
    if(!white(boundary-dx*2.4,y)||!white(boundary+dx*2.4,y))contrast++;
   }
  }
  if(clear/total>.80&&contrast/total>.12)gutters++;
 }
 return gutters===panels-1;
}
async function sampleImage(input){
 const blob=typeof input==='string'?await(await fetch(input)).blob():input;
 const bitmap=await createImageBitmap(blob);
 try{
  const canvas=document.createElement('canvas');
  canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Não foi possível validar a imagem da capa.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,96,96);
  ctx.drawImage(bitmap,0,0,96,96);
  return ctx.getImageData(0,0,96,96).data;
 }finally{bitmap.close();}
}
function similarImages(a,b){
 if(!a||!b||a.length!==b.length)return false;
 let delta=0;
 for(let i=0;i<a.length;i+=4)
  delta+=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3;
 return delta/(a.length/4)<13;
}
export async function validateKitCoverImage(input,{referenceDataUrl=null}={}){
 const sample=await sampleImage(input);
 if(looksLikeKitReferenceMontage(sample,96,96,3)||
    looksLikeKitReferenceMontage(sample,96,96,2))
  return {ok:false,reason:'A imagem 01 é uma montagem de fotos de referência, não uma capa gerada com os produtos na mesma cena.'};
 if(referenceDataUrl&&similarImages(sample,await sampleImage(referenceDataUrl)))
  return {ok:false,reason:'A imagem 01 recebida é a própria referência WeDrop, não uma imagem gerada.'};
 return {ok:true};
}
