// Private per-SKU supplier evidence: pasted text and up to four screenshots.
// Never infer hidden text from an image; the seller must review extracted suggestions.
import crypto from 'node:crypto';
const BUCKET='shopee-optimizer-supplier-evidence';
const MAX=4*1024*1024;
function cfg(){
 const url=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!/^https:\/\//.test(url)||!key)throw Error('Evidências Shopee indisponíveis no armazenamento.');
 return {url,headers:{apikey:key,Accept:'application/json',...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})}};
}
const digit=(v,allowZero=false)=>{
 const n=Number(v);if(!Number.isSafeInteger(n)||n<(allowZero?0:1))throw Error('Identificador de evidência inválido.');
 return n;
};
const identity=(shop,item,model,sku)=>({
 shop_id:digit(shop),item_id:digit(item),model_id:digit(model,true),
 sku:String(sku||'').trim()
});
const filter=id=>'?shop_id=eq.'+id.shop_id+'&item_id=eq.'+id.item_id+
 '&model_id=eq.'+id.model_id+'&select=*&limit=1';
async function jsonApi(url,options={}){
 const c=cfg();
 const r=await fetch(c.url+url,{
  ...options,headers:{...c.headers,...options.headers},
  signal:AbortSignal.timeout(25000)
 });
 if(!r.ok)throw Error('Evidência não pôde ser armazenada ou consultada (HTTP '+r.status+').');
 const body=await r.text();return body?JSON.parse(body):[];
}
export async function readShopeeSourceEvidence(shop,item,model,sku,{preview=false}={}){
 const id=identity(shop,item,model,sku);
 const rows=await jsonApi('/rest/v1/shopee_optimizer_supplier_evidence'+filter(id));
 const row=rows.find(x=>x.sku===id.sku);
 if(!row)return {sku:id.sku,sourceText:'',screenshots:[],updatedAt:null};
 const shots=Array.isArray(row.attachments)?row.attachments.slice(0,4):[];
 const entries=[];
 for(const v of shots){
  const clean={id:v.id,filename:v.filename,sha256:v.sha256};
  if(preview&&/^\d+\/\d+\/\d+\/[0-9a-f-]+\.(png|jpg)$/.test(v.path||'')){
   const signed=await jsonApi('/storage/v1/object/sign/'+BUCKET+'/'+v.path,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600})
   });
   const p=String(signed.signedURL||signed.signedUrl||'');
   if(p.startsWith('/object/sign/'))clean.previewUrl=cfg().url+'/storage/v1'+p;
  }
  entries.push(clean);
 }
 return {sku:id.sku,sourceText:row.source_text||'',screenshots:entries,updatedAt:row.updated_at};
}
async function save(id,text,attachments){
 await jsonApi('/rest/v1/shopee_optimizer_supplier_evidence?on_conflict=shop_id,item_id,model_id',{
  method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},
  body:JSON.stringify([{...id,source_text:text,attachments,updated_at:new Date().toISOString()}])
 });
}
export async function saveShopeeSourceText(shop,item,model,sku,text){
 const id=identity(shop,item,model,sku);
 const val=String(text??'').normalize('NFC').trim();
 if([...val].length>12000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(val))throw Error('Texto da WeDrop inválido: máximo 12.000 caracteres.');
 const previous=await readShopeeSourceEvidence(shop,item,model,sku);
 await save(id,val,await internalAttachments(id));
 return {saved:true,sourceText:val,updatedAt:new Date().toISOString()};
}
async function internalAttachments(id){
 const list=await jsonApi('/rest/v1/shopee_optimizer_supplier_evidence'+filter(id));
 const saved=list.find(x=>x.sku===id.sku);
 return Array.isArray(saved?.attachments)?saved.attachments.slice(0,4):[];
}
export async function importShopeeEvidenceImage(shop,item,model,sku,{imageBase64,mime,filename}={}){
 const id=identity(shop,item,model,sku);
 if(!['image/jpeg','image/png'].includes(mime))throw Error('O print precisa ser JPG ou PNG.');
 const raw=String(imageBase64||'');
 if(!raw||raw.length>MAX*4/3+300||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))
  throw Error('Print inválido ou acima de 4 MB.');
 const data=Buffer.from(raw,'base64');
 const valid=mime==='image/png'?
  data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
  data[0]===255&&data[1]===216&&data[2]===255;
 if(!valid||data.length>MAX||data.length<50)throw Error('Arquivo não corresponde à imagem ou ultrapassa 4 MB.');
 const list=await internalAttachments(id);
 if(list.length>=4)throw Error('Limite de quatro prints por SKU. Apague um print antigo para continuar.');
 const idFile=crypto.randomUUID(),ext=mime==='image/png'?'png':'jpg';
 const path=[id.shop_id,id.item_id,id.model_id,idFile+'.'+ext].join('/');
 const c=cfg();
 const sent=await fetch(c.url+'/storage/v1/object/'+BUCKET+'/'+path,{
  method:'POST',headers:{...c.headers,'Content-Type':mime,'x-upsert':'false'},body:data,signal:AbortSignal.timeout(45000)
 });
 if(!sent.ok)throw Error('Não foi possível guardar o print (HTTP '+sent.status+').');
 const name=String(filename||'print').replace(/[\/\\\x00-\x1f]/g,'_').slice(0,90);
 const entry={id:idFile,path,filename:name,sha256:crypto.createHash('sha256').update(data).digest('hex')};
 try{
  const old=await readShopeeSourceEvidence(shop,item,model,sku);
  await save(id,old.sourceText,[...list,entry]);
 }catch(e){throw Error('Print enviado, mas registro pendente: '+e.message);}
 return {saved:true,id:idFile,filename:name};
}
export async function removeShopeeEvidenceImage(shop,item,model,sku,idFile){
 const id=identity(shop,item,model,sku);
 if(!/^[0-9a-f-]{36}$/.test(String(idFile)))throw Error('Print inválido.');
 const list=await internalAttachments(id),entry=list.find(x=>x.id===idFile);
 if(!entry)return {removed:false};
 const current=await readShopeeSourceEvidence(shop,item,model,sku);
 await save(id,current.sourceText,list.filter(x=>x.id!==idFile));
 try{
  const c=cfg();
  await fetch(c.url+'/storage/v1/object/'+BUCKET+'/'+entry.path,{method:'DELETE',headers:c.headers,signal:AbortSignal.timeout(15000)});
 }catch{}
 return {removed:true};
}

/** Fetch only screenshots belonging to the authenticated shop/item/model/SKU. */
export async function downloadShopeeEvidenceImages(shop,item,model,sku){
 const id=identity(shop,item,model,sku);
 const shots=await internalAttachments(id);
 const out=[];
 for(const shot of shots.slice(0,4)){
  const target=String(shot.path||'');
  const prefix=[id.shop_id,id.item_id,id.model_id].join('/')+'/';
  if(!target.startsWith(prefix)||!/^[0-9a-f-]{36}\.(png|jpg)$/.test(target.slice(prefix.length)))
    continue;
  const c=cfg();
  const response=await fetch(c.url+'/storage/v1/object/authenticated/'+BUCKET+'/'+target,{
   method:'GET',headers:c.headers,signal:AbortSignal.timeout(25000)
  });
  if(!response.ok)throw Error('Não foi possível ler o print privado da WeDrop (HTTP '+response.status+').');
  if(Number(response.headers.get('content-length')||0)>MAX)throw Error('Print armazenado excede o limite de leitura.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>MAX||bytes.length<50)throw Error('Print armazenado inválido.');
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!(png||jpg))throw Error('Formato de print armazenado inválido.');
  out.push({mime:png?'image/png':'image/jpeg',bytes,filename:String(shot.filename||'print').slice(0,90)});
 }
 return out;
}
