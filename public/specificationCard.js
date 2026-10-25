// Imagem 03: cotas sobre o entorno do produto e dados laterais mínimos.
// Fonte única: "Informações da WeDrop" SALVAS DA PRÓPRIA SKU.
// Fotografia com fundo moderno/visível; preservar integralmente a base HD.
import {confirmedProductDimensionsFromWeDrop,confirmedProductSideFactsFromWeDrop} from './productDimensions.js';

export function confirmedSpecCard({sourceText=''}={}){
 const dims=confirmedProductDimensionsFromWeDrop(sourceText);
 const facts=confirmedProductSideFactsFromWeDrop(sourceText);
 if(!dims&&!facts.length)return null;
 return {measurements:dims?.measurements||[],facts,source:'Informações da WeDrop da SKU'};
}
const SW=1200,SH=1200;
function textChip(ctx,text,cx,cy,{small=false}={}){
 ctx.save();
 ctx.font=(small?'500 22px':'600 25px')+' Arial,sans-serif';
 const tw=ctx.measureText(text).width;
 const width=Math.min(380,tw+(small?28:32));
 const height=small?40:46;
 const x=Math.max(16,Math.min(SW-width-16,cx-width/2));
 const y=Math.max(18,Math.min(SH-height-18,cy-height/2));
 // Uma faixa translúcida e delicada, não uma caixa branca opaca.
 ctx.fillStyle='rgba(18,34,47,0.58)';
 ctx.beginPath();ctx.roundRect(x,y,width,height,10);ctx.fill();
 ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.shadowColor='rgba(0,0,0,0.35)';ctx.shadowBlur=3;
 ctx.fillText(text,x+width/2,y+height/2,Math.max(70,width-20));
 ctx.restore();
}
function dimensionLine(ctx,x1,y1,x2,y2){
 const angle=Math.atan2(y2-y1,x2-x1);
 ctx.save();
 ctx.strokeStyle='rgba(18,34,47,0.72)';
 ctx.lineWidth=4;ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 ctx.strokeStyle='rgba(255,255,255,0.95)';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 for(const [x,y,a] of [[x1,y1,angle+Math.PI],[x2,y2,angle]]){
  ctx.beginPath();ctx.moveTo(x,y);
  ctx.lineTo(x-12*Math.cos(a-0.5),y-12*Math.sin(a-0.5));
  ctx.moveTo(x,y);ctx.lineTo(x-12*Math.cos(a+0.5),y-12*Math.sin(a+0.5));
  ctx.stroke();
 }
 ctx.restore();
}
export async function addConfirmedSpecificationCard(blob,spec){
 if(!spec?.measurements?.length&&!spec?.facts?.length)return blob;
 if(!(blob instanceof Blob)||!/image\/(?:png|jpeg|webp)/.test(blob.type))
  throw Error('Imagem inválida para aplicar dimensões confirmadas.');
 const bitmap=await createImageBitmap(blob);
 try{
  const canvas=document.createElement('canvas');
  canvas.width=SW;canvas.height=SH;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Não foi possível preparar a Imagem 03.');
  ctx.drawImage(bitmap,0,0,SW,SH);
  const get=name=>spec.measurements?.find(x=>x.axis===name);
  // Cotas visuais nos limites aparentes; não converter pixels em centímetros.
  // Não cruzar a região central nem esconder o produto.
  const height=get('altura'),width=get('largura'),length=get('comprimento'),depth=get('profundidade');
  if(height){dimensionLine(ctx,122,238,122,944);textChip(ctx,'ALTURA '+height.value,245,592);}
  if(width){dimensionLine(ctx,355,188,910,188);textChip(ctx,'LARGURA '+width.value,632,137);}
  if(length){dimensionLine(ctx,260,1010,970,1010);textChip(ctx,'COMPRIMENTO '+length.value,620,1062);}
  if(depth){dimensionLine(ctx,314,1010,892,1010);textChip(ctx,'PROFUNDIDADE '+depth.value,610,1062);}
  // Só dados realmente colados na WeDrop e secundários em relação às medidas.
  // Para não sobrecarregar: até três microetiquetas no canto direito.
  const facts=(spec.facts||[]).slice(0,3);
  facts.forEach((fact,i)=>textChip(ctx,fact.label+': '+fact.value,972,755+i*53,{small:true}));
  return await new Promise((resolve,reject)=>canvas.toBlob(
   output=>output?resolve(output):reject(Error('Falha ao aplicar dados WeDrop na Imagem 03.')),
   'image/png'
  ));
 }finally{bitmap.close();}
}
