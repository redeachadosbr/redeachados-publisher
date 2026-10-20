import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localDateKey,countCreatedListings,getShopeeNewListingsSummary,
 clearShopeeNewListingsCache,validatePage} from '../shopeeNewListings.js';

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
test('API consulta somente filtros aceitos, confere create_time e não duplica IDs',async()=>{
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
 assert.deepEqual(calls.filter(x=>x.path.endsWith('/get_item_list')).map(x=>x.query.item_status),
  ['NORMAL','UNLIST','BANNED']);
 assert.equal(calls.filter(x=>x.path.endsWith('/get_item_base_info')).length,1);
 assert.match(data.source,/create_time/);
 assert.match(data.scope,/exclui excluídos/);
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
test('Erro transitório Shopee recupera automaticamente sem duplicar os anúncios',async()=>{
 const shopId=987654324;
 clearShopeeNewListingsCache(shopId);
 let tries=0;
 const mock=async (_cfg,req)=>{
  if(req.path.endsWith('/get_item_list')){
   if(req.query.item_status==='NORMAL'&&++tries===1)
    throw Error('Shopee HTTP 429 too many requests');
   return {response:{item:req.query.item_status==='NORMAL'?[{item_id:4321}]:[],
    has_next_page:false}};
  }
  return {response:{item_list:[row(4321,'2026-10-20T12:00:00Z')]}};
 };
 const totals=await getShopeeNewListingsSummary({
  cfg:{},auth:{shopId,accessToken:'x'},callApi:mock,now});
 assert.equal(totals.today,1);
 assert.equal(totals.totalItems,1);
 assert.equal(tries,2);
 clearShopeeNewListingsCache(shopId);
});
test('Erro de autenticação não fica repetindo chamadas sem necessidade',async()=>{
 const shopId=987654325;clearShopeeNewListingsCache(shopId);
 let called=0;
 const mock=async()=>{called++;throw Error('error_auth: invalid access_token');};
 await assert.rejects(getShopeeNewListingsSummary({
  cfg:{},auth:{shopId,accessToken:'x'},callApi:mock,now}),/access_token/);
 assert.equal(called,1);
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

test('Cards 3D compactos são botões funcionais e acessíveis, sem duplicar indicadores',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/dashboard-new-listings.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/dashboard-new-listings.css',import.meta.url),'utf8');
 assert.equal((html.match(/data-listing-period="/g)||[]).length,3);
 for(const type of ['today','month','year']){
  assert.match(html,new RegExp('<button[^>]*data-listing-period="'+type+'"[^>]*aria-controls="dashboardNewListingsHistory"'));
 }
 assert.equal((html.match(/id="dashboardNewListingsHistory"/g)||[]).length,1);
 for(const id of ['dashboardNewListingsToday','dashboardNewListingsMonth','dashboardNewListingsYear']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(client,/setupHistoryButtons\(\)/);
 assert.match(client,/button\.addEventListener\('click'/);
 assert.match(client,/history\.open=!same/);
 assert.match(client,/button\.setAttribute\('aria-expanded'/);
 assert.match(css,/dashboard-new-listings-card:hover/);
 assert.match(css,/translateY\(-4px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-width:560px/);
});

test('Lista UNLIST sem item é uma lista realmente vazia se a Shopee confirmar total zero',()=>{
 assert.deepEqual(validatePage({total_count:0,has_next_page:false},'UNLIST'),[]);
 assert.deepEqual(validatePage({item:null,total_count:0,has_next_page:false},'UNLIST'),[]);
 assert.deepEqual(validatePage({item_list:null,total_count:0,has_next_page:false},'UNLIST'),[]);
 assert.deepEqual(validatePage({has_next_page:false},'BANNED'),[]);
 assert.deepEqual(validatePage({item:[],total_count:0,has_next_page:false},'UNLIST'),[]);
 assert.throws(()=>validatePage({total_count:12,has_next_page:false},'UNLIST'),/incompleta/);
 assert.throws(()=>validatePage({total_count:0,has_next_page:true},'UNLIST'),/incompleta/);
 assert.throws(()=>validatePage({response:null},'UNLIST'),/incompleta/);
 assert.throws(()=>validatePage(null,'UNLIST'),/resposta válida/);
 assert.throws(()=>validatePage({item:[],total_count:3,has_next_page:false},'UNLIST'),/3 anúncios/);
});
test('Consulta completa continua mesmo se UNLIST e BANNED não vierem com campo item',async()=>{
 const shopId=987654330;clearShopeeNewListingsCache(shopId);
 const calls=[];
 const mock=async(_cfg,req)=>{
  calls.push(req.path+' '+(req.query.item_status||''));
  if(req.path.endsWith('/get_item_list')){
   const status=req.query.item_status;
   return {response:status==='NORMAL'
    ?{item:[{item_id:10},{item_id:11}],total_count:2,has_next_page:false}
    :{total_count:0,has_next_page:false}};
  }
  return {response:{item_list:req.query.item_id_list.split(',').map(id=>
   row(id,id==='10'?'2026-10-20T11:00:00Z':'2026-10-04T11:00:00Z'))}};
 };
 const summary=await getShopeeNewListingsSummary({
  cfg:{},auth:{shopId,accessToken:'test'},callApi:mock,now});
 assert.equal(summary.ok,true);
 assert.equal(summary.totalItems,2);
 assert.equal(summary.today,1);
 assert.equal(summary.month,2);
 assert.equal(summary.year,2);
 assert.equal(calls.filter(x=>x.includes('get_item_list')).length,3);
 clearShopeeNewListingsCache(shopId);
});
