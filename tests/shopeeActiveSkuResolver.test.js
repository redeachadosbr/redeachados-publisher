import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileActiveSkuCandidates,scanLiveNormalSku,catalogCandidatesIfNoActive}
 from '../shopeeSkuActiveResolver.js';
const old={sku:'303448',itemId:'58221262116',modelId:'0',status:'SELLER_DELETE',
 title:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde'};
const active={sku:'303448',itemId:'58271290960',modelId:'0',
 title:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',
 hasModel:true,imageUrl:'https://example.com/x.jpg',status:'SELLER_DELETE'};
function pages(count=528){
 const result=[];let total=0;
 for(let i=0;i<Math.ceil(count/100);i++){
  const items=[];
  const start=i*100,length=Math.min(100,count-start);
  for(let j=0;j<length;j++){
   const id=String(10000000000+start+j);
   items.push({itemId:id,modelId:'0',sku:String(start+j+1000),status:'NORMAL'});
  }
  // O ID está no próprio index NORMAL, mesmo que base-info esteja defasada.
  if(i===5)items.push(active);
  result.push({status:'NORMAL',items,hasNext:i<Math.ceil(count/100)-1,
   nextOffset:(i+1)*100,totalCount:count,warnings:[]});
 }
 return result;
}
test('SKU 303448 nunca seleciona seller_delete 58221262116 se 58271290960 consta entre os ativos',async()=>{
 const data=pages();
 let writes=[];
 const result=await scanLiveNormalSku({sku:'303448',cached:[old],
  getPage:async({offset})=>data[offset/100],onMatch:async matches=>{writes=matches;}});
 assert.equal(result.verified,true);
 assert.equal(result.pagesChecked,6);
 assert.deepEqual(result.oldIds,['58221262116']);
 assert.deepEqual(result.replacedIds,['58221262116']);
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].itemId,'58271290960');
 assert.equal(result.matches[0].status,'NORMAL');
 assert.equal(result.matches[0].hasModel,true);
 assert.equal(result.matches[0].modelId,'0');
 assert.equal(writes[0].itemId,'58271290960');
});
test('SKUs equivalentes diferentes não são tratadas como correspondências',()=>{
 const result=reconcileActiveSkuCandidates({sku:'303448',cached:[old],
  pages:[{status:'NORMAL',items:[{itemId:'58271290960',sku:'303448-1'},
   {itemId:'58271290961',sku:'303448 '},{itemId:'58271290962',sku:'30344'}]}]});
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].itemId,'58271290961');
});
test('dois anúncios realmente ativos com SKU idêntica exigem seleção e não reutilizam o excluído',()=>{
 const out=reconcileActiveSkuCandidates({sku:'303448',cached:[old],
  pages:[{status:'NORMAL',items:[active,{...active,itemId:'58271290961'}]}]});
 assert.equal(out.matches.length,2);
 assert.ok(!out.matches.some(x=>x.itemId==='58221262116'));
});
test('lista incompleta não reaproveita cache excluído',async()=>{
 await assert.rejects(scanLiveNormalSku({
  sku:'303448',cached:[old],getPage:async()=>({
   status:'NORMAL',items:[],hasNext:false,warnings:['base-info falhou']
  })
 }),/não devolveu todos os detalhes/);
 await assert.rejects(scanLiveNormalSku({
  sku:'303448',cached:[old],maxPages:1,getPage:async()=>({
   status:'NORMAL',items:[],hasNext:true,nextOffset:100
  })
 }),/maior que o limite/);
});
test('SELLER_DELETE nunca é apresentado como alternativa mesmo sem anúncio NORMAL',()=>{
 const x=catalogCandidatesIfNoActive({sku:'303448',cached:[old],
  normalScanComplete:true,live:[old,{...active,itemId:'55',status:'UNLIST'}]});
 assert.equal(x.length,1);
 assert.equal(x[0].itemId,'55');
});
test('GET /optimizer/find ignora vínculos persistidos e busca os anúncios NORMAL',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(server,/scanLiveNormalSku\(\{/);
 assert.match(server,/getPage:args=>fetchCatalogPage/);
 assert.match(server,/retiredItemIds:retired/);
 assert.match(server,/catalogCandidatesIfNoActive/);
 assert.match(app,/Vínculo antigo/);
 assert.match(app,/anúncio NORMAL ID/);
 assert.match(app,/NÃO serão transferidos/);
});
