// Custos por PEDIDO, separados do catálogo por SKU. A referência é declaração do lojista,
// não uma integração automática comprovada com os pedidos/cobranças da WeDrop.
const fixed=v=>Math.round(v*100)/100;
const validShop=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<=0)throw Error('Loja inválida.');return n;};
const validOrder=v=>{const sn=String(v||'').trim();if(!/^[A-Za-z0-9-]{8,65}$/.test(sn))throw Error('Número do pedido inválido.');return sn;};
function credentials(){
 const url=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!url||!key)throw Error('Banco de dados indisponível para conciliar custo efetivo.');
 return {url,key};
}
async function request(path,{method='GET',body}={}){
 const {url,key}=credentials();
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
 if(method!=='GET')headers.Prefer='resolution=merge-duplicates,return=representation';
 const response=await fetch(url+'/rest/v1/shopee_finance_order_costs'+path,{
  method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(16000)});
 if(!response.ok)throw Error('Não foi possível acessar a conciliação WeDrop ('+response.status+').');
 return response.json();
}
export async function readFinanceOrderCosts(shopId){
 const id=validShop(shopId);
 const rows=await request('?shop_id=eq.'+id+'&select=order_sn,supplier_cost,supplier_credit,external_expense,source_reference,updated_at&limit=3000');
 if(!Array.isArray(rows))throw Error('Resposta inválida dos custos por pedido.');
 return rows;
}
export function normalizeFinanceOrderCostInput(input){
 const orderSn=validOrder(input?.orderSn);
 const read=(v,label)=>{
  if(v===null||v===undefined||String(v).trim()==='')throw Error(label+' obrigatório.');
  const value=Number(v);
  if(!Number.isFinite(value)||value<0||value>1000000||Math.round(value*100)/100!==value)
   throw Error(label+' inválido (use valores com até duas casas decimais).');
  return fixed(value);
 };
 const reference=String(input?.sourceReference||'').trim();
 if(reference.length<3||reference.length>140)throw Error('Informe a referência da compra/nota da WeDrop (3 a 140 caracteres).');
 return {orderSn,supplierCost:read(input.supplierCost,'Custo efetivo'),
  supplierCredit:read(input.supplierCredit??0,'Crédito WeDrop'),
  externalExpense:read(input.externalExpense??0,'Despesa externa'),
  sourceReference:reference};
}
export async function saveFinanceOrderCost(shopId,input){
 const shop=validShop(shopId),value=normalizeFinanceOrderCostInput(input);
 const saved=await request('?on_conflict=shop_id,order_sn',{method:'POST',body:[{
  shop_id:shop,order_sn:value.orderSn,supplier_cost:value.supplierCost,
  supplier_credit:value.supplierCredit,external_expense:value.externalExpense,
  source_reference:value.sourceReference,updated_at:new Date().toISOString()
 }]});
 if(!Array.isArray(saved)||saved.length!==1)throw Error('Gravação do custo por pedido não confirmada.');
 return {orderSn:value.orderSn,supplierCost:Number(saved[0].supplier_cost),
  supplierCredit:Number(saved[0].supplier_credit),
  externalExpense:Number(saved[0].external_expense),
  sourceReference:String(saved[0].source_reference),updatedAt:String(saved[0].updated_at)};
}
