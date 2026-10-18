/**
 * Projetado para respostas mínimas no painel Shopee:
 * combina campos públicos/operacionais de get_order_list e get_order_detail,
 * sem retornar endereços, CPF, nomes, telefones ou outras informações pessoais.
 */
export function mergeShopeeOrderDates(listRows,detailRows){
  const details=new Map(
    (Array.isArray(detailRows)?detailRows:[])
      .filter(x=>x&&typeof x.order_sn==='string')
      .map(x=>[x.order_sn,x])
  );
  return (Array.isArray(listRows)?listRows:[]).map(row=>{
    const sn=String(row?.order_sn||'');
    const detail=details.get(sn)||{};
    const candidate=Number(detail.create_time||row?.create_time||0);
    return {
      order_sn:sn,
      order_status:String(row?.order_status||detail.order_status||''),
      create_time:Number.isFinite(candidate)&&candidate>0?Math.floor(candidate):null
    };
  });
}

/**
 * Campos operacionais autorizados: sem dados de comprador, endereço ou identidade.
 * Valores e quantidades ficam null quando não retornados pela API.
 */
export function mergeShopeeOrderSummaries(listRows,detailRows){
  const base=mergeShopeeOrderDates(listRows,detailRows);
  const details=new Map((Array.isArray(detailRows)?detailRows:[])
    .filter(row=>row&&typeof row.order_sn==='string').map(row=>[row.order_sn,row]));
  const numberOrNull=(value,{min=0}={})=>
    value===null||value===undefined||value===''||typeof value==='boolean'?
      null:(Number.isFinite(Number(value))&&Number(value)>=min?Number(value):null);
  const textSafe=(value,max=200)=>typeof value==='string'?value.slice(0,max):'';
  return base.map(row=>{
    const d=details.get(row.order_sn);
    const listItem=(d&&Array.isArray(d.item_list))?d.item_list:null;
    const items=listItem?listItem.slice(0,100).map(item=>{
      const quantity=numberOrNull(item?.model_quantity_purchased??item?.item_quantity,{min:0});
      const unitPrice=numberOrNull(item?.model_discounted_price??item?.model_original_price);
      return {
        sku:textSafe(item?.model_sku||item?.item_sku,100),
        name:textSafe(item?.item_name),
        variation:textSafe(item?.model_name,120),
        quantity,
        unit_price:unitPrice
      };
    }):[];
    const hasUnknown=items.some(item=>item.quantity===null);
    const itemsCount=listItem&&listItem.length<=100&&!hasUnknown?
      items.reduce((n,item)=>n+item.quantity,0):null;
    return {
      ...row,
      total_amount:numberOrNull(d?.total_amount),
      items_count:itemsCount,
      primary_sku:items.find(item=>item.sku)?.sku||null,
      items:items,
      items_complete:listItem!==null&&listItem.length<=100&&!hasUnknown,
      detail_available:Boolean(d)
    };
  });
}
