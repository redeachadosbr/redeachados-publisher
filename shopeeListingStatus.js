// Confirmar status do produto pela listagem oficial da Shopee quando
// get_item_base_info estiver incompleto ou divergente do portal do vendedor.
// Somente um item_id EXATO encontrado no filtro NORMAL permite liberar escrita.
// Todos os demais casos falham fechados (sem promoção ou alteração de preço).
export async function verifyShopeeListingStatus({itemId,baseStatus,fetchNormalPage,maxPages=100}){
 const expected=String(itemId??'').trim();
 if(!/^\d{1,18}$/.test(expected))throw Error('ID de anúncio inválido para conferir status.');
 const fromBase=String(baseStatus??'').trim().toUpperCase();
 if(fromBase==='NORMAL')return {status:'NORMAL',source:'get_item_base_info',baseStatus:fromBase,
  listConfirmed:false,pagesChecked:0};
 // Não converter restrição ou exclusão em NORMAL por falha de interpretação.
 if(['BANNED','SELLER_DELETE','SHOPEE_DELETE','DELETED'].includes(fromBase))
  return {status:fromBase,source:'get_item_base_info',baseStatus:fromBase,
   listConfirmed:false,pagesChecked:0};
 let offset=0,pages=0;
 const seen=new Set();
 while(pages<maxPages){
  if(seen.has(offset))throw Error('Paginação repetida na consulta Shopee; status não confirmado.');
  seen.add(offset);
  const raw=await fetchNormalPage({offset,pageSize:100});
  const response=raw?.response??raw;
  if(!response||!Array.isArray(response.item))
   throw Error('Shopee não retornou listagem NORMAL íntegra; status não confirmado.');
  pages++;
  for(const row of response.item){
   if(String(row?.item_id??'')!==expected)continue;
   if(row.item_status&&String(row.item_status).trim().toUpperCase()!=='NORMAL')
    throw Error('Item listado como NORMAL, mas com status divergente: '+String(row.item_status).slice(0,30));
   return {status:'NORMAL',source:'get_item_list',baseStatus:fromBase||'AUSENTE',
    listConfirmed:true,pagesChecked:pages};
  }
  if(response.has_next_page!==true)break;
  const next=Number(response.next_offset);
  if(!Number.isSafeInteger(next)||next<=offset)
   throw Error('Paginação Shopee inconsistente; não foi possível confirmar o status.');
  offset=next;
 }
 if(pages>=maxPages)throw Error('Verificação atingiu limite de páginas sem localizar o anúncio; nenhuma alteração autorizada.');
 return {status:fromBase||'NÃO INFORMADO',source:'get_item_base_info',
  baseStatus:fromBase||'AUSENTE',listConfirmed:false,pagesChecked:pages};
}
