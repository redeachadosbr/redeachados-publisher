import {randomUUID} from 'node:crypto';

// Requisição HTTP não espera conversão FFmpeg nem armazenamento no Supabase.
// Estado é temporário nesta instância. Reinício do serviço exige novo envio.
const jobs=new Map(),active=new Map();
const MAX_CONCURRENT=2,RETAIN_MS=15*60*1000;
const identityKey=info=>[String(info.shopId),String(info.itemId),String(info.modelId),String(info.sku)].join('|');
function prune(){
 const now=Date.now();
 for(const [id,job] of jobs)
  if(job.status!=='processing'&&now-job.updatedAt>RETAIN_MS)jobs.delete(id);
}
function snapshot(job){
 return {ok:job.status!=='error',processing:job.status==='processing',jobId:job.id,
  status:job.status,progress:job.progress,createdAt:new Date(job.createdAt).toISOString(),
  filename:job.filename,sizeBytes:job.sizeBytes,
  ...(job.status==='complete'?{result:job.result}:{}),
  ...(job.status==='error'?{error:job.error}:{})};
}
export function statusOptimizerVideoImport(info,jobId=''){
 prune();
 const key=identityKey(info);
 const found=jobId?jobs.get(String(jobId)):
  [...jobs.values()].reverse().find(job=>job.key===key);
 return found&&found.key===key?snapshot(found):null;
}
export function startOptimizerVideoImport(info,{filename,sizeBytes,sha256},worker){
 prune();
 const key=identityKey(info),priorId=active.get(key),prior=jobs.get(priorId);
 if(prior){
  if(prior.sha256!==sha256)throw Error('Outra importação desta SKU ainda está em processamento. Aguarde o resultado antes de substituir o arquivo.');
  return snapshot(prior);
 }
 if(active.size>=MAX_CONCURRENT)throw Error('O servidor já está convertendo vídeos. Aguarde a conclusão das importações em andamento.');
 const now=Date.now(),id=randomUUID();
 const job={id,key,filename:String(filename||'video.mp4'),sizeBytes:Number(sizeBytes),
  sha256,status:'processing',progress:'Arquivo recebido. Validando duração e formato...',
  createdAt:now,updatedAt:now,result:null,error:''};
 jobs.set(id,job);active.set(key,id);
 // Responder HTTP 202 antes de qualquer conversão e transferência.
 setImmediate(()=>{
  void (async()=>{
   try{
    const progress=message=>{
     if(job.status==='processing'){job.progress=String(message).slice(0,160);job.updatedAt=Date.now();}
    };
    job.result=await worker(progress);
    job.status='complete';job.progress='Vídeo preparado e salvo no armazenamento privado.';
   }catch(error){
    job.error=String(error?.message||error).slice(0,280);
    job.status='error';job.progress='Falha ao preparar ou armazenar o vídeo.';
   }finally{
    job.updatedAt=Date.now();
    if(active.get(key)===id)active.delete(key);
   }
  })();
 });
 return snapshot(job);
}
