// Ficha técnica determinística aplicada DEPOIS de gerar a foto.
 // Evita números inventados e a falha do ChatGPT em escrever especificações.
 // Não confundir medidas do produto com medidas de embalagem ou logística.
export function confirmedSpecCard({sku='',attributes=[]}={}){
 const id=String(sku||'').trim();
 // Verificado para TOYS & TOYS SKU 303448: medidas DO CAMINHÃO
 // em fichas de varejo com campo separado "Dimensões com embalagem".
 // Catálogo WeDrop (48×18×15 cm) refere-se à caixa; não usar esses números.
 if(id==='303448')return {
  title:'MEDIDAS DO CAMINHÃO',
  measurements:[
   {label:'COMPRIMENTO',value:'35 cm'},
   {label:'ALTURA',value:'16 cm'},
   {label:'LARGURA',value:'9 cm'}
  ],
  details:['Material: plástico ABS, TPC e PP','Conteúdo: 1 caminhão + 3 mini carrinhos']
 };
 const safe=[];
 for(const attr of Array.isArray(attributes)?attributes:[]){
  const name=String(attr?.attributeName||attr?.name||attr?.title||'').trim();
  const value=String(attr?.valueName||attr?.value||attr?.values?.map(x=>x?.valueName||'').filter(Boolean).join(', ')||'').trim();
  if(!name||!value||value.length>100||/^n[aã]o (?:informad|aplic)/i.test(value))continue;
  if(/^(?:material|composi[cç][aã]o|cor|capacidade)$/i.test(name)&&!safe.some(x=>x.startsWith(name+':')))
   safe.push(name+': '+value);
 }
 if(!safe.length)return null; // Não inventar ficha técnica quando faltarem dados.
 return {title:'CARACTERÍSTICAS CONFIRMADAS',measurements:[],details:safe.slice(0,3)};
}
const fit=(ctx,text,maxWidth,fontSize)=>{
 ctx.font='700 '+fontSize+'px Arial, sans-serif';
 while(ctx.measureText(text).width>maxWidth&&fontSize>19){
  fontSize-=1;ctx.font='700 '+fontSize+'px Arial, sans-serif';
 }
 return fontSize;
};
export async function addConfirmedSpecificationCard(blob,spec){
 if(!spec||!Array.isArray(spec.details)||!spec.details.length)return blob;
 if(!(blob instanceof Blob)||!/image\/(?:png|jpeg|webp)/.test(blob.type))throw Error('Imagem inválida para ficha técnica.');
 const bitmap=await createImageBitmap(blob);
 try{
  const canvas=document.createElement('canvas');
  canvas.width=1200;canvas.height=1200;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Não foi possível montar a ficha de especificações.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,1200);
  ctx.drawImage(bitmap,0,0,1200,1200);
  const hasMeasurements=Array.isArray(spec.measurements)&&spec.measurements.length>0;
  const top=hasMeasurements?904:1015;
  ctx.fillStyle='rgba(10,33,58,0.94)';ctx.fillRect(0,top,1200,1200-top);
  ctx.fillStyle='#e2b46a';ctx.fillRect(0,top,1200,7);
  ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillStyle='#ffffff';
  fit(ctx,String(spec.title||'ESPECIFICAÇÕES'),1090,31);
  ctx.fillText(String(spec.title||'ESPECIFICAÇÕES'),50,top+49);
  if(hasMeasurements){
   const values=spec.measurements.slice(0,3);
   const size=1100/values.length;
   values.forEach((entry,index)=>{
    const x=52+index*size;
    ctx.fillStyle='#b5cbdf';
    ctx.font='600 21px Arial,sans-serif';
    ctx.fillText(String(entry.label||'').slice(0,24),x,top+106);
    ctx.fillStyle='#ffffff';
    fit(ctx,String(entry.value||''),size-25,38);
    ctx.fillText(String(entry.value||''),x,top+152);
   });
   ctx.fillStyle='rgba(255,255,255,0.22)';
   ctx.fillRect(50,top+180,1100,1);
  }
  ctx.fillStyle='#ffffff';ctx.textAlign='left';
  const details=spec.details.slice(0,hasMeasurements?2:3);
  details.forEach((line,index)=>{
   const y=hasMeasurements?top+221+index*40:top+96+index*41;
   fit(ctx,String(line),1090,28);
   ctx.fillText(String(line),50,y);
  });
  return await new Promise((resolve,reject)=>{
   canvas.toBlob(out=>out?resolve(out):reject(Error('Falha ao gerar imagem com especificações.')),'image/png');
  });
 }finally{bitmap.close();}
}
