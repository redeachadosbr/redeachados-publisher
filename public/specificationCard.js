// Imagem 03: cotas sobre o entorno do produto e dados laterais mínimos.
// Fonte única: "Informações da WeDrop" SALVAS DA PRÓPRIA SKU.
// Fotografia com fundo moderno/visível; preservar integralmente a base HD.
import {confirmedProductDimensionsFromWeDrop,confirmedProductSideFactsFromWeDrop,confirmedAssembledTrackDimensionsFromWeDrop,confirmedCatalogCrossCheckedDimensionsFromWeDrop} from './productDimensions.js?v=20261105-exact-sku-triple';

export function confirmedSpecCard({sourceText='',sku='',sourceEvidenceSku='',supplierMatchedBy='',sourceSaved=false,catalogMeasurements=null}={}){
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
 const dims=assembled?null:(
  confirmedProductDimensionsFromWeDrop(sourceText)||
  confirmedCatalogCrossCheckedDimensionsFromWeDrop(sourceText,{
   sku,sourceEvidenceSku,sourceSaved,supplierMatchedBy,catalogMeasurements
  }));
 const facts=confirmedProductSideFactsFromWeDrop(sourceText);
 if(!dims&&!facts.length)return null;
 // Identificar selo de cor sortida SOMENTE quando a própria ficha confirma
 // envio sortido e as cores exatas. Não derivar das cores aparentes na foto.
 const colors=String(sourceText||'').match(/(?:^|\n)\s*[-*•]?\s*cor(?:es)?\s*[:\-]\s*([^\n]+)/i)?.[1]||'';
 const colorWords=colors.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .split(/\s*(?:,|\be\b|\/|;)\s*/).map(x=>x.trim()).filter(Boolean);
 const sortedColors=/(?:cor(?:es)?\s+sortid[ao]s?|envia(?:do|da|dos|das)\s+(?:com\s+)?cor(?:es)?\s+sortid[ao]s?)/i
  .test(String(sourceText||''))&&['azul','amarelo','rosa'].every(c=>colorWords.includes(c));
 return {measurements:dims?.measurements||[],facts,sortedColors,
  source:'Informações da WeDrop da SKU'};
}
const SW=1200,SH=1200;
// Formato aprovado para arte 03: setas brancas, placas claras com borda
// amarela e tipografia azul-marinho. Layout desenhado UMA VEZ no arquivo final.
// Números vêm APENAS da ficha WeDrop validada para a SKU.
function sizeChip(ctx,{value,label,x,y,width=208}){
 ctx.save();
 const h=101,rx=Math.max(8,Math.min(SW-width-8,x-width/2));
 const ry=Math.max(8,Math.min(SH-h-8,y-h/2));
 ctx.shadowColor='rgba(19,50,75,.22)';ctx.shadowBlur=11;ctx.shadowOffsetY=3;
 ctx.fillStyle='#fffefa';
 ctx.beginPath();ctx.roundRect(rx,ry,width,h,29);ctx.fill();
 ctx.shadowColor='transparent';ctx.shadowOffsetY=0;ctx.shadowBlur=0;
 ctx.lineWidth=6;ctx.strokeStyle='#ffcb0b';
 ctx.beginPath();ctx.roundRect(rx+3,ry+3,width-6,h-6,26);ctx.stroke();
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#103764';
 ctx.font='800 49px "Inter","Segoe UI",Arial,sans-serif';
 ctx.fillText(value,rx+width/2,ry+40,width-24);
 ctx.font='600 24px "Inter","Segoe UI",Arial,sans-serif';
 ctx.fillText(label,rx+width/2,ry+76,width-24);
 ctx.restore();
}
function dimensionLine(ctx,x1,y1,x2,y2){
 const angle=Math.atan2(y2-y1,x2-x1);
 ctx.save();ctx.lineCap='round';
 ctx.strokeStyle='rgba(11,40,64,.25)';ctx.lineWidth=10;
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 ctx.strokeStyle='#fff';ctx.lineWidth=6;
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 const tip=19,wing=12;
 for(const [x,y,dir] of [[x1,y1,1],[x2,y2,-1]]){
  const a=angle+(dir===1?Math.PI:0);
  ctx.fillStyle='#fff';ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(x+tip*Math.cos(a)+wing*Math.cos(a+Math.PI/2),
   y+tip*Math.sin(a)+wing*Math.sin(a+Math.PI/2));
  ctx.lineTo(x+tip*Math.cos(a)-wing*Math.cos(a+Math.PI/2),
   y+tip*Math.sin(a)-wing*Math.sin(a+Math.PI/2));
  ctx.fill();
 }
 ctx.restore();
}
function smallFact(ctx,text,x,y){
 ctx.save();ctx.font='600 24px "Inter","Segoe UI",Arial,sans-serif';
 const width=Math.min(290,ctx.measureText(text).width+32);
 const rx=Math.max(12,Math.min(SW-width-12,x-width/2));
 ctx.fillStyle='rgba(255,255,255,.89)';
 ctx.beginPath();ctx.roundRect(rx,y,width,45,13);ctx.fill();
 ctx.fillStyle='#143b67';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(text,rx+width/2,y+23,width-20);ctx.restore();
}
function sortedColorBanner(ctx){
 // Selo só aparece quando há COR SORTIDA confirmada na fonte da SKU.
 ctx.save();
 const x=46,y=1057,w=525,h=109;
 ctx.shadowColor='rgba(14,36,60,.24)';ctx.shadowBlur=12;ctx.shadowOffsetY=3;
 ctx.fillStyle='#093967';ctx.beginPath();ctx.roundRect(x,y,w,h,44);ctx.fill();
 ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.lineWidth=5;ctx.strokeStyle='#ffcb0b';
 ctx.beginPath();ctx.roundRect(x+3,y+3,w-6,h-6,41);ctx.stroke();
 for(const [i,color] of ['#28a8ed','#ffd219','#f7358e'].entries()){
  const sx=x+27+i*34,sy=y+24+(i===1?-7:i===2?5:0);
  ctx.fillStyle=color;ctx.strokeStyle='#fff';ctx.lineWidth=5;
  ctx.beginPath();ctx.roundRect(sx,sy,55,65,11);ctx.fill();ctx.stroke();
 }
 ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font='600 27px "Inter","Segoe UI",Arial,sans-serif';
 ctx.fillText('Envio em',x+340,y+35,300);
 ctx.fillStyle='#ffdc24';ctx.font='800 37px "Inter","Segoe UI",Arial,sans-serif';
 ctx.fillText('cores sortidas',x+342,y+76,325);
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
  const height=get('altura'),width=get('largura'),length=get('comprimento'),depth=get('profundidade'),diameter=get('diametro');
  const poolPortrait=!height&&Boolean(length&&width)&&
   /colch[aã]o.*(?:piscina|infl[aá]vel)|(?:boia|colch[aã]o).*infl[aá]vel/i.test(String(spec.productTitle||''))&&
   Number(String(length.value).replace(',','.').split(' ')[0])>
   Number(String(width.value).replace(',','.').split(' ')[0]);
  if(poolPortrait){
   // Foto de colchões em pé: a peça AZUL à direita é a referência
   // visual, como na arte aprovada. Só duas cotas, sem selo repetido.
   dimensionLine(ctx,1091,85,1091,923);
   sizeChip(ctx,{value:length.value,label:'Comprimento',x:1081,y:448,width:217});
   dimensionLine(ctx,786,969,1060,969);
   sizeChip(ctx,{value:width.value,label:'Largura',x:936,y:1046,width:216});
   if(spec.sortedColors)sortedColorBanner(ctx);
  }else{
   if(height){
    dimensionLine(ctx,1059,165,1059,937);
    sizeChip(ctx,{value:height.value,label:'Altura',x:1079,y:510,width:213});
   }
   if(width){
    dimensionLine(ctx,321,964,862,964);
    sizeChip(ctx,{value:width.value,label:'Largura',x:604,y:1040,width:214});
   }
   if(diameter){
    // Produtos circulares (ex.: bebedouro) têm diâmetro, não "largura".
    if(width)smallFact(ctx,'Diâmetro '+diameter.value,842,1102);
    else{
     dimensionLine(ctx,321,964,862,964);
     sizeChip(ctx,{value:diameter.value,label:'Diâmetro',x:604,y:1040,width:214});
    }
   }
   if(length){
    if(height||width)smallFact(ctx,'Comprimento '+length.value,842,1102);
    else{
     dimensionLine(ctx,1059,165,1059,937);
     sizeChip(ctx,{value:length.value,label:'Comprimento',x:1079,y:510,width:214});
    }
   }
   if(depth){
    if(height||length)smallFact(ctx,'Profundidade '+depth.value,450,1102);
    else{
     dimensionLine(ctx,322,964,858,964);
     sizeChip(ctx,{value:depth.value,label:'Profundidade',x:600,y:1040,width:237});
    }
   }
   // Apenas um fato secundário quando NÃO há medidas. Nenhum painel grande.
   if(!(height||width||length||depth||diameter)){
    const fact=spec.facts?.[0];
    if(fact)smallFact(ctx,fact.label+': '+fact.value,1000,1030);
   }
  }
  return await new Promise((resolve,reject)=>canvas.toBlob(
   output=>output?resolve(output):reject(Error('Falha ao aplicar dados WeDrop na Imagem 03.')),
   'image/png'
  ));
 }finally{bitmap.close();}
}
