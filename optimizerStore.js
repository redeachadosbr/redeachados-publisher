// Preferências permanentes de otimização por shop_id, acessíveis somente ao backend.
// Não persiste imagens, vídeos, credenciais, dados fiscais completos ou anúncios.
const env=k=>String(process.env[k]||'').trim();
const shopIdOf=value=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1)throw Error('Shop ID inválido.');
  return n;
};
function config(){
  const url=env('SUPABASE_URL').replace(/\/$/,'');
  const key=env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw Error('Banco Supabase indisponível para salvar regras.');
  const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
  return {url,headers};
}
async function request(query,opt={}){
  const {url,headers}=config();
  const res=await fetch(url+'/rest/v1/shopee_optimizer_settings'+query,{
    ...opt,headers:{...headers,...(opt.headers||{})},signal:AbortSignal.timeout(15000)
  });
  if(!res.ok)throw Error('Não foi possível acessar as regras salvas no Supabase (HTTP '+res.status+').');
  return opt.method==='POST'?[]:res.json();
}
export async function optimizerSettings(shopId){
  const rows=await request('?shop_id=eq.'+shopIdOf(shopId)+
    '&select=image_prompt,fiscal_notes,updated_at&limit=1');
  return rows[0]||{image_prompt:'',fiscal_notes:'',updated_at:null};
}
export async function saveOptimizerSettings(shopId,{imagePrompt='',fiscalNotes=''}={}){
  const id=shopIdOf(shopId),prompt=String(imagePrompt),notes=String(fiscalNotes);
  if(prompt.length>12000||notes.length>4000)throw Error('Prompt limitado a 12.000 caracteres e instruções fiscais a 4.000.');
  if(/[\u0000-\u0008\u000b\u000c]/.test(prompt+notes))throw Error('O texto contém caracteres inválidos.');
  await request('?on_conflict=shop_id',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify([{shop_id:id,image_prompt:prompt,fiscal_notes:notes,updated_at:new Date().toISOString()}])
  });
  return optimizerSettings(id);
}
