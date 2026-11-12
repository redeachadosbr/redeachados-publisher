// Normaliza a chave oficial (plural) dos canais do get_channel_list Shopee v2.
const id=value=>/^[1-9]\d{0,17}$/.test(String(value??''))&&Number.isSafeInteger(Number(value));
export function enabledShopeeChannels(apiResult){
 const body=apiResult?.response||apiResult||{};
 const entries=body.logistics_channel_list??body.logistic_channel_list;
 if(!Array.isArray(entries))throw Error('A Shopee não retornou a lista oficial de canais de envio.');
 return entries.filter(x=>{
  const enabled=x?.enabled??x?.is_enabled??x?.status;
  return enabled===true||enabled===1||['ENABLED','NORMAL'].includes(String(enabled||'').toUpperCase());
 }).map(x=>({
  id:String(x.logistics_channel_id??x.logistic_channel_id??x.logistic_id??''),
  name:String(x.logistics_channel_name??x.logistic_channel_name??x.logistic_name??'Envio Shopee')
 })).filter(x=>id(x.id));
}
