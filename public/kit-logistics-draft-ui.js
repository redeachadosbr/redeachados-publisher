// Persistência de logística somente do kit (sem mudar anúncios individuais).
// Guarda instantaneamente neste navegador e sincroniza em rascunhos existentes.
export function createKitLogisticsPersistence({context,post,notify,disablePreOrder}){
 let queued=null,chain=Promise.resolve(),restoring=false,pendingChannel='';
 const fields={mainSku:'#kitMainSku',logisticId:'#kitLogisticId',
  weightKg:'#kitWeightKg',lengthCm:'#kitLengthCm',
  widthCm:'#kitWidthCm',heightCm:'#kitHeightCm',autoSyncDts:'#kitAutoSyncDts'};
 const el=s=>document.querySelector(s);
 const key=sku=>'redeachados:kit:logistics:v1:'+sku;
 const read=()=>{
  const numeric=id=>{const v=el(id).value.trim();return v===''?null:Number(v);};
  return {mainSku:el(fields.mainSku).value||'',
   logisticId:el(fields.logisticId).value||pendingChannel||'',
   weightKg:numeric(fields.weightKg),lengthCm:numeric(fields.lengthCm),
   widthCm:numeric(fields.widthCm),heightCm:numeric(fields.heightCm),
   autoSyncDts:el(fields.autoSyncDts).checked,preOrder:false,daysToShip:0,
   updatedAt:new Date().toISOString()};
 };
 const saveLocal=(sku,values)=>{try{localStorage.setItem(key(sku),JSON.stringify(values));return true;}catch{return false;}};
 const loadLocal=sku=>{try{return JSON.parse(localStorage.getItem(key(sku))||'null');}catch{return null;}};
 const apply=values=>{
  if(!values||typeof values!=='object')return;
  restoring=true;
  try{
   const main=String(values.mainSku||'');
   const options=[...el(fields.mainSku).options];
   el(fields.mainSku).value=options.some(x=>x.value===main)?main:'';
   const logistic=String(values.logisticId||'');
   pendingChannel=/^[1-9]\d+$/.test(logistic)?logistic:'';
   if([...el(fields.logisticId).options].some(x=>x.value===logistic))
    el(fields.logisticId).value=logistic;
   for(const id of ['weightKg','lengthCm','widthCm','heightCm']){
    const value=values[id];
    el(fields[id]).value=value!==null&&value!==undefined&&
     Number.isFinite(Number(value))&&Number(value)>0?String(value):'';
   }
   el(fields.autoSyncDts).checked=values.autoSyncDts===true;
   disablePreOrder();
  }finally{restoring=false;}
 };
 const reset=()=>{
  if(queued)clearTimeout(queued);queued=null;
  restoring=true;pendingChannel='';
  try{
   for(const id of ['weightKg','lengthCm','widthCm','heightCm'])el(fields[id]).value='';
   el(fields.autoSyncDts).checked=false;
  }finally{restoring=false;}
  notify('Dados de logística prontos para preenchimento. Eles serão salvos por kit.');
 };
 const queue=()=>{
  if(restoring)return;
  const {sku,saved}=context();
  if(!sku)return;
  const data=read(),localSaved=saveLocal(sku,data);
  if(queued)clearTimeout(queued);
  queued=null;
  if(!saved){notify(localSaved?
   '✓ Medidas salvas neste navegador. Salve o rascunho para sincronizar com a loja.':
   'Salve o rascunho para preservar as medidas na loja.',localSaved?'success':'info');return;}
  notify('Salvando medidas no rascunho...');
  queued=setTimeout(()=>{
   queued=null;
   chain=chain.catch(()=>{}).then(async()=>{
    const now=context();
    if(now.sku!==sku||!now.saved)return;
    try{
     const result=await post('/api/shopee/kits/drafts/logistics',{body:{kitSku:sku,logistics:data}});
     if(context().sku===sku&&result.saved)
      notify('✓ Peso, medidas e opções salvos automaticamente neste kit.','success');
    }catch(error){
     if(context().sku===sku)
      notify('Dados salvos localmente. Sincronização pendente: '+error.message,'error');
    }
   });
  },650);
 };
 const restore=(server,sku)=>{
  const local=loadLocal(sku);
  const st=Date.parse(server?.updatedAt||'')||0;
  const lt=Date.parse(local?.updatedAt||'')||0;
  const data=lt>st?local:server||local;
  apply(data);
  if(data){
   notify(lt>st?'✓ Medidas recuperadas do navegador. Sincronizando rascunho...':
    '✓ Peso, medidas e opções restaurados do rascunho.','success');
   if(lt>st&&context().saved)queue();
  }else notify('Não há medidas salvas neste rascunho. Preencha uma vez para guardar.');
 };
 const channel=choices=>{
  const value=el(fields.logisticId).value||pendingChannel;
  if(choices.some(x=>String(x.id)===String(value))){
   el(fields.logisticId).value=String(value);pendingChannel=String(value);
  }
 };
 const flush=async()=>{if(queued){clearTimeout(queued);queued=null;}await chain.catch(()=>{});};
 return {read,apply,reset,queue,restore,channel,flush,
  saveLocal,selectors:Object.values(fields)};
}
