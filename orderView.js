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
