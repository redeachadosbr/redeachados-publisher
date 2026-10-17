// Extrato da carteira Shopee para loja local: consulta somente leitura.
// A Payment API não equivale a saldo sacável em tempo real.
const asMoney=value=>value===null||value===undefined||value===''?null:
  Number.isFinite(Number(value))?Math.round(Number(value)*100)/100:null;
const safe=v=>String(v??'').trim().slice(0,100);
export function normalizeWalletTransactions(data){
 const list=data?.response?.transaction_list;
 if(!Array.isArray(list))throw Error('SHOPEE_WALLET_INVALID_RESPONSE');
 return list.map(t=>{
  const seconds=Number(t.create_time);
  const date=Number.isSafeInteger(seconds)&&seconds>0?new Date(seconds*1000).toISOString():null;
  return {
   date,
   type:safe(t.transaction_type),
   amount:asMoney(t.amount),
   balanceAfter:asMoney(t.current_balance),
   reference:safe(t.order_sn||t.withdraw_id||t.refund_sn),
   status:safe(t.status),
   description:safe(t.description||t.reason)
  };
 }).filter(t=>t.date&&t.amount!==null);
}
export async function readShopeeWallet(cfg,auth,callApi,{now=Math.floor(Date.now()/1000)}={}){
 const DAY=86400,from=now-30*DAY+1,all=[];
 let truncated=false;
 // Shopee limita cada consulta por intervalo a 15 dias. Paginar por offset.
 for(let start=from;start<=now;start+=15*DAY){
  const end=Math.min(start+15*DAY-1,now);
  let finished=false;
  for(let offset=0;offset<400;offset+=100){
   const data=await callApi(cfg,{path:'/api/v2/payment/get_wallet_transaction_list',method:'POST',
    accessToken:auth.accessToken,shopId:auth.shopId,
    body:{create_time_from:start,create_time_to:end,page_no:offset,page_size:100}});
   const rows=normalizeWalletTransactions(data);
   all.push(...rows);
   const more=data?.response?.more===true;
   if(!more){finished=true;break;}
  }
  if(!finished)truncated=true;
 }
 const unique=new Map();
 for(const t of all){
  // Chave estável composta; evita repetir registros em limites de janelas.
  const key=[t.date,t.type,t.amount,t.balanceAfter,t.reference,t.status].join('|');
  unique.set(key,t);
 }
 const rows=[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date));
 const lastBalance=rows.find(t=>t.balanceAfter!==null);
 return {schema:'ra-wallet-bridge-v1',platform:'shopee',source:'Shopee Payment · get_wallet_transaction_list',
  generatedAt:new Date().toISOString(),balance:{
   amount:lastBalance?.balanceAfter??null,date:lastBalance?.date??null,
   status:lastBalance?'last_wallet_transaction':'unavailable',
   note:'Saldo observado após a última movimentação retornada. Não representa confirmação do saldo disponível para saque em tempo real.'
  },movements:rows.slice(0,150),coverage:{from:new Date(from*1000).toISOString(),
   to:new Date(now*1000).toISOString(),complete:!truncated,
   note:'Movimentações de carteira da janela de 30 dias. Não são débitos adicionais nem atualizam o extrato bancário.'},
  diagnostics:{returned:rows.length,truncated,permission:'confirmed'}};
}
