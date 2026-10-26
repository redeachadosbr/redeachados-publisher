// Imagens do kit com referências reais de 2 ou 3 SKUs WeDrop.
// Não salva nem publica na Shopee; devolve PNG ao navegador para conferência.
import {imageGenerationStatus} from './shopeeOpenAiImages.js';
const HOST='wedrop-products-images.nyc3.cdn.digitaloceanspaces.com';
async function reference(url){
 const target=new URL(url);
 if(target.protocol!=='https:'||target.hostname!==HOST||target.username||target.password)
  throw Error('Foto de produto WeDrop de origem não autorizada.');
 const r=await fetch(target.href,{redirect:'error',
  headers:{Accept:'image/jpeg,image/png,image/webp'},signal:AbortSignal.timeout(23000)});
 if(!r.ok)throw Error('Foto de referência WeDrop não disponível (HTTP '+r.status+').');
 if(Number(r.headers.get('content-length')||0)>6*1024*1024)
  throw Error('Foto WeDrop excede o tamanho permitido.');
 const bytes=Buffer.from(await r.arrayBuffer());
 if(bytes.length<200||bytes.length>6*1024*1024)
  throw Error('Foto de referência WeDrop inválida.');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpg&&!webp)throw Error('Formato original da foto WeDrop inválido.');
 return {data:bytes,mime:png?'image/png':jpg?'image/jpeg':'image/webp'};
}
export async function generateKitImage({kit,slot,key,prompt}){
 if(!Number.isInteger(slot)||slot<1||slot>9)throw Error('Posição de imagem inválida.');
 if(!Array.isArray(kit.components)||kit.components.length<2||kit.components.length>3)
  throw Error('É necessário confirmar componentes reais do kit.');
 if(!key)throw Error('Conecte a API OpenAI em Configurações para gerar imagens.');
 if(!kit.components.every(p=>p.imageUrl))throw Error('Algum produto não possui foto de referência cadastrada na WeDrop.');
 const originals=await Promise.all(kit.components.map(p=>reference(p.imageUrl)));
 const form=new FormData(),status=imageGenerationStatus();
 form.set('model',status.model);
 form.set('size',status.model.startsWith('gpt-image-1')?'1024x1024':'1200x1200');
 form.set('quality',String(process.env.OPENAI_IMAGE_QUALITY||'medium'));
 form.set('n','1');
 form.set('output_format','png');
 form.set('prompt',String(prompt).slice(0,6000)+
  '\nREFERÊNCIAS VISUAIS: cada imagem original corresponde a uma SKU diferente, todas devem aparecer juntas, preservando o número correto de produtos. NÃO transformar em um produto único, NÃO misturar SKUs e não inventar componentes.');
 for(const [i,x] of originals.entries())
  form.append('image[]',new Blob([x.data],{type:x.mime}),
   'wedrop-sku-'+(i+1)+(x.mime==='image/png'?'.png':x.mime==='image/jpeg'?'.jpg':'.webp'));
 const r=await fetch('https://api.openai.com/v1/images/edits',{
  method:'POST',headers:{Authorization:'Bearer '+key},body:form,
  signal:AbortSignal.timeout(175000)
 });
 if(!r.ok){
  const error=await r.json().catch(()=>({}));
  throw Error('Geração da imagem falhou (HTTP '+r.status+'): '+String(error?.error?.message||'Tente novamente.').slice(0,180));
 }
 const body=await r.json(),base64=String(body?.data?.[0]?.b64_json||'');
 if(base64.length<1000||base64.length>15_000_000)throw Error('Resposta de imagem fora do tamanho permitido.');
 return {base64,mime:'image/png',slot,model:status.model,generated:true,
  warning:'Imagem de IA: confira visualmente a fidelidade de todos os componentes antes de usar.'};
}
