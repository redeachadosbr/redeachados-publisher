// Imagem 03: cotas sobre o entorno do produto e dados laterais mínimos.
// Fonte única: "Informações da WeDrop" SALVAS DA PRÓPRIA SKU.
// Fotografia com fundo moderno/visível; preservar integralmente a base HD.
import {confirmedProductDimensionsFromWeDrop,confirmedProductSideFactsFromWeDrop,confirmedAssembledTrackDimensionsFromWeDrop} from './productDimensions.js';

export function confirmedSpecCard({sourceText='',sku='',sourceEvidenceSku='',supplierMatchedBy='',sourceSaved=false}={}){
 // O texto salvo manualmente em Informações da WeDrop já é vinculado pelo
 // servidor a shop/item/model/SKU e não depende da correspondência do catálogo.
 // Nunca aceitar texto de uma SKU diferente ou input sem origem validada.
 if(sku){
  if(String(sourceEvidenceSku||'').trim()!==String(sku).trim()||
     !(sourceSaved===true||['exact-sku','reviewed-link'].includes(String(supplierMatchedBy||''))))
   return null;
 }
 const assembled=confirmedAssembledTrackDimensionsFromWeDrop(sourceText);
 // Quando existe uma pista montada, não desenhar setas ao redor de
 // um caminhão/carrinho isolado, mesmo se outra frase traz medidas gerais.
 const dims=assembled?null:confirmedProductDimensionsFromWeDrop(sourceText);
 const facts=confirmedProductSideFactsFromWeDrop(sourceText);
 if(!dims&&!facts.length)return null;
 return {measurements:dims?.measurements||[],facts,source:'Informações da WeDrop da SKU'};
}
const SW=1200,SH=1200;
// Legenda editorial: branco translúcido LEVE, borda fina, letra contemporânea.
// As cotas usam apenas valores da própria SKU, nunca são inferidas dos pixels.
function textChip(ctx,text,cx,cy,{small=false}={}){
 ctx.save();
 ctx.font=(small?'500 25px':'600 32px')+' "Inter","Segoe UI",Arial,sans-serif';
 const tw=ctx.measureText(text).width;
 const width=Math.min(small?340:360,tw+(small?30:40));
 const height=small?48:59;
 const x=Math.max(22,Math.min(SW-width-22,cx-width/2));
 const y=Math.max(22,Math.min(SH-height-22,cy-height/2));
 ctx.shadowColor='rgba(10,29,44,0.16)';
 ctx.shadowBlur=8;ctx.shadowOffsetY=2;
 ctx.fillStyle='rgba(249,251,253,0.76)';
 ctx.beginPath();ctx.roundRect(x,y,width,height,12);ctx.fill();
 ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.strokeStyle='rgba(255,255,255,0.72)';ctx.lineWidth=1;
 ctx.beginPath();ctx.roundRect(x+0.5,y+0.5,width-1,height-1,11.5);ctx.stroke();
 ctx.fillStyle='#173550';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(text,x+width/2,y+height/2,Math.max(70,width-24));
 ctx.restore();
}
function dimensionLine(ctx,x1,y1,x2,y2){
 const angle=Math.atan2(y2-y1,x2-x1);
 ctx.save();ctx.lineCap='round';
 // Contorno clarinho para leitura em fotos claras e escuras.
 ctx.strokeStyle='rgba(255,255,255,0.92)';ctx.lineWidth=4;
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 ctx.strokeStyle='rgba(22,57,83,0.86)';ctx.lineWidth=1.8;
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 for(const [x,y] of [[x1,y1],[x2,y2]]){
  const ax=Math.cos(angle+Math.PI/2)*11,ay=Math.sin(angle+Math.PI/2)*11;
  ctx.beginPath();ctx.moveTo(x-ax,y-ay);ctx.lineTo(x+ax,y+ay);ctx.stroke();
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
  if(height){dimensionLine(ctx,168,248,168,938);textChip(ctx,'ALTURA '+height.value,280,600);}
  if(width){dimensionLine(ctx,353,225,922,225);textChip(ctx,'LARGURA '+width.value,638,169);}
  if(length){dimensionLine(ctx,295,1013,958,1013);textChip(ctx,'COMPRIMENTO '+length.value,628,1080);}
  if(depth){
   if(length)textChip(ctx,'PROFUNDIDADE '+depth.value,973,1133,{small:true});
   else{dimensionLine(ctx,306,1013,925,1013);textChip(ctx,'PROFUNDIDADE '+depth.value,633,1080);}
  }
  // Dados adicionais não podem poluir a fotografia nem competir com as medidas.
  // Para imagens com 3 cotas, no máximo uma etiqueta secundária.
  const facts=(spec.facts||[]).slice(0,(height&&width&&(length||depth))?1:2);
  facts.forEach((fact,i)=>textChip(ctx,fact.label+': '+fact.value,997,845+i*58,{small:true}));
  return await new Promise((resolve,reject)=>canvas.toBlob(
   output=>output?resolve(output):reject(Error('Falha ao aplicar dados WeDrop na Imagem 03.')),
   'image/png'
  ));
 }finally{bitmap.close();}
}
