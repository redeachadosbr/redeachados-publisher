import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localDateKey,countCreatedListings,getShopeeNewListingsSummary,
 clearShopeeNewListingsCache} from '../shopeeNewListings.js';

const at=(iso)=>Math.floor(Date.parse(iso)/1000);
const row=(item_id,iso)=>({item_id,create_time:at(iso)});
const now=new Date('2026-10-20T14:00:00Z');

test('Contagem usa data de criação no fuso Brasília e ignora update_time e modelos',()=>{
 const rows=[
  {...row(1,'2026-10-20T02:59:00Z'),update_time:at('2026-10-20T08:00:00Z')},
  row(2,'2026-10-20T03:01:00Z'), // 00:01 Brasília
  row(2,'2026-10-20T03:01:00Z'), // item repetido ou variação
  row(3,'2026-10-19T19:00:00Z'),
  row(4,'2026-10-02T13:00:00Z'),
  row(5,'2026-09-30T12:00:00Z'),
  row(6,'2025-12-30T22:00:00Z')
 ];
 const results=countCreatedListings(rows,now);
 assert.equal(results.dayKey,'2026-10-20');
 assert.equal(results.today,1);
 assert.equal(results.month,3);
 assert.equal(results.year,4);
 assert.equal(results.known,6);
 assert.equal(results.byMonth[9].count,3);
 assert.equal(results.byMonth[8].count,1);
 assert.equal(results.last7.at(-1).count,1);
 assert.equal(results.timezone,'America/Sao_Paulo');
});
test('Virada do calendário brasileiro não usa data UTC ou data de atualização',()=>{
 assert.equal(localDateKey(new Date('2026-10-20T02:59:00Z')),'2026-10-19');
 assert.equal(localDateKey(new Date('2026-10-20T03:01:00Z')),'2026-10-20');
 const stats=countCreatedListings([{...row(1,'2025-09-05T12:00:00Z'),
  update_time:at('2026-10-20T12:00:00Z')}],now);
 assert.equal(stats.today,0);assert.equal(stats.month,0);assert.equal(stats.year,0);
});
test('API consulta quatro situações, confere create_time de cada anúncio e não duplica IDs',async()=>{
 clearShopeeNewListingsCache(987654321);
 const calls=[];
 const mock=async (_cfg,req)=>{
  calls.push(req);
  if(req.path.endsWith('/get_item_list')){
   const status=req.query.item_status;
   const item=(status==='NORMAL'? [{item_id:123,item_status:'NORMAL'},
    {item_id:456,item_status:'NORMAL'}]:status==='UNLIST'?
    [{item_id:123,item_status:'UNLIST'},{item_id:789,item_status:'UNLIST'}]:[]);
   return {response:{item,has_next_page:false}};
  }
  if(req.path.endsWith('/get_item_base_info')){
   const ids=req.query.item_id_list.split(',');
   return {response:{item_list:ids.map(id=>row(id,
    id==='123'?'2026-10-20T07:30:00Z':
     id==='456'?'2026-10-09T07:30:00Z':'2026-04-20T07:30:00Z'))}};
  }
  throw Error('API inesperada');
 };
 const data=await getShopeeNewListingsSummary({
  cfg:{},auth:{shopId:987654321,accessToken:'test'},callApi:mock,now});
 assert.equal(data.today,1);assert.equal(data.month,2);assert.equal(data.year,3);
 assert.equal(data.totalItems,3);
 assert.equal(calls.filter(x=>x.path.endsWith('/get_item_list')).length,4);
 assert.equal(calls.filter(x=>x.path.endsWith('/get_item_base_info')).length,1);
 assert.match(data.source,/create_time/);
 assert.match(data.scope,/exclui removidos/);
 const cached=await getShopeeNewListingsSummary({
  cfg:{},auth:{shopId:987654321,accessToken:'test'},callApi:mock,now});
 assert.deepEqual(cached,data);
 assert.equal(calls.length,5);
 clearShopeeNewListingsCache(987654321);
});
test('Data de criação ausente impede reportar contagem parcial ou fictícia',async()=>{
 const shopId=987654322;
 const mock=async (_cfg,req)=>{
  if(req.path.endsWith('/get_item_list'))
   return {response:{item:req.query.item_status==='NORMAL'?[{item_id:10}]:[],
    has_next_page:false}};
  return {response:{item_list:[{item_id:10,update_time:at('2026-10-20T08:00:00Z')}]}};
 };
 await assert.rejects(getShopeeNewListingsSummary({
  cfg:{},auth:{shopId,accessToken:'x'},callApi:mock,now}),/data original de criação/);
 clearShopeeNewListingsCache(shopId);
});
test('Interface mostra só três KPIs e histórico recolhível, com atualização automática',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/dashboard-new-listings.js',import.meta.url),'utf8');
 for(const id of ['dashboardNewListingsToday','dashboardNewListingsMonth','dashboardNewListingsYear',
  'dashboardNewListingsDays','dashboardNewListingsMonths']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(html,/class="dashboard-new-listings-history"/);
 assert.match(app,/if\(name==='overview'\)void window\.dashboardNewListingsLoad\?\.\(\)/);
 assert.match(client,/\/api\/shopee\/dashboard\/new-listings/);
});
