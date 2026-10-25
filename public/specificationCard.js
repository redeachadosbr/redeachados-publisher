// Imagem 03: cotas visuais de produto, EXCLUSIVAMENTE a partir da
// descricao de medidas colada no campo "Informacoes da WeDrop" da SKU.
// Nunca incluir beneficios, textos promocionais ou medidas inferidas por IA.
import {confirmedProductDimensionsFromWeDrop} from './productDimensions.js';
export function confirmedSpecCard({sourceText=''}={}){
 const dims=confirmedProductDimensionsFromWeDrop(sourceText);
 if(!dims)return null;
 return {measurements:dims.measurements,source:dims.source};
}
const label=(ctx,text,x,y)=>{
 ctx.font='bold 26px Arial,sans-serif';
 const width=Math.max(148,ctx.measureText(text).width+40);
 const left=Math.max(12,Math.min(1200-width-12,x-width/2));
 ctx.fillStyle='rgba(255,255,255,0.94)';
 ctx.fillRect(left,y-25,width,48);
 ctx.fillStyle='#18344c';
 ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(text,left+width/2,y);
};
const arrow=(ctx,x1,y1,x2,y2)=>{
 const angle=Math.atan2(y2-y1,x2-x1);
 ctx.strokeStyle='#d81b60';ctx.lineWidth=6;ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 for(const [x,y,a] of [[x1,y1,angle+Math.PI],[x2,y2,angle]]){
  ctx.beginPath();ctx.moveTo(x,y);
  ctx.lineTo(x-20*Math.cos(a-0.5),y-20*Math.sin(a-0.5));
  ctx.moveTo(x,y);ctx.lineTo(x-20*Math.cos(a+0.5),y-20*Math.sin(a+0.5));ctx.stroke();
 }
};
// Base gerada sem números: os ÚNICOS valores finais são os que o
// Motor Matriz desenha nas margens do produto, sem inventar escala da foto.
export async function addConfirmedSpecificationCard(blob,spec){
 if(!spec?.measurements?.length)return blob;
 if(!(blob instanceof Blob)||!/image\/(?:png|jpeg|webp)/.test(blob.type))
  throw Error('Imagem inválida para aplicar dimensões confirmadas.');
 const bitmap=await createImageBitmap(blob);
 try{
  const canvas=document.createElement('canvas');
  canvas.width=1200;canvas.height=1200;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Não foi possível preparar a Imagem 03.');
  ctx.drawImage(bitmap,0,0,1200,1200);
  const get=name=>spec.measurements.find(x=>x.axis===name);
  // Cotas ilustrativas do conjunto visível, não medição por pixels da foto.
  // Somente alturas/larguras/comprimentos declarados na WeDrop podem aparecer.
  const height=get('altura'),width=get('largura'),length=get('comprimento');
  if(height){arrow(ctx,92,290,92,920);label(ctx,'ALTURA '+height.value,190,605);}
  if(length){arrow(ctx,270,1070,1020,1070);label(ctx,'COMPRIMENTO '+length.value,650,1120);}
  if(width){arrow(ctx,820,185,1090,185);label(ctx,'LARGURA '+width.value,955,135);}
  return await new Promise((resolve,reject)=>{
   canvas.toBlob(output=>output?resolve(output):
    reject(Error('Falha ao inserir as medidas da WeDrop na Imagem 03.')),'image/png');
  });
 }finally{bitmap.close();}
}
