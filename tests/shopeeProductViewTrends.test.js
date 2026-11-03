import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseViewsWindow,normalizeExtraItem,rankObservedViews,
 scanLiveShopViews,saveViewsScan,saoPauloDay,listViewSamples}
 from '../shopeeProductViewTrends.js';
const date='2026-11-03';
test('períodos hoje, 7, 30 e personalizado mantêm datas locais e limites',()=>{
 assert.deepEqual(parseViewsWindow({period:'today'},date),
  {start:date,end:date,period:'today',days:1});
 assert.equal(parseViewsWindow({period:'7'},date).start,'2026-10-28');
 assert.equal(parseViewsWindow({period:'30'},date).start,'2026-10-05');
 assert.deepEqual(parseViewsWindow({period:'custom',start:'2026-10-01',
  end:'2026-10-31'},date).days,31);
 assert.throws(()=>parseViewsWindow({period:'custom',start:'2026-07-01',
  end:date},date),/últimos 90/);
 assert.throws(()=>parseViewsWindow({period:'custom',start:'2026-11-03',
  end:'2026-11-04'},date),/últimos 90/);
 assert.equal(saoPauloDay(new Date('2026-11-04T02:30:00.000Z')),'2026-11-03');
});
test('API de visualizações valida valor sem inventar conversões, CTR ou cart',()=>{
 assert.deepEqual(normalizeExtraItem({item_id:123,views:219,sale:4,likes:6}),
  {itemId:'123',views:219,sale:4,likes:6});
 assert.throws(()=>normalizeExtraItem({item_id:123,sale:5}),/não retornou views/);
 assert.throws(()=>normalizeExtraItem({item_id:123,views:-1}),/não retornou views/);
});
test('uma única amostra histórica NÃO produz 0 visitas no dia e não é orgânica',()=>{
 const rows=[{item_id:111,sku:'SKU111',title:'A',image_url:'https://x',
  observed_day:date,first_views:350,last_views:350,
  first_seen_at:'2026-11-03T12:00:00Z',last_seen_at:'2026-11-03T12:00:00Z',
  last_sale:3,last_likes:9}];
 const result=rankObservedViews(rows,parseViewsWindow({period:'today'},date));
 assert.equal(result.list[0].viewsObserved,null);
 assert.equal(result.list[0].latestTotalViews,350);
 assert.equal(result.list[0].impressions,null);
 assert.equal(result.list[0].clicks,null);
 assert.equal(result.list[0].ctr,null);
 assert.equal(result.list[0].cartPending,null);
 assert.equal(result.list[0].coverage,'insufficient_samples');
 assert.match(result.warning,/podendo incluir tráfego potencialmente pago|inclusive tráfego potencialmente pago/);
});
test('duas medições produzem somente delta OBSERVADO, não total oficial dos 7 dias',()=>{
 const rows=[
  {item_id:111,sku:'SKU111',title:'A',observed_day:'2026-11-02',
   first_views:340,last_views:350,first_seen_at:'2026-11-02T12:00:00Z',
   last_seen_at:'2026-11-02T20:00:00Z'},
  {item_id:111,sku:'SKU111',title:'A',observed_day:date,
   first_views:356,last_views:390,first_seen_at:'2026-11-03T12:00:00Z',
   last_seen_at:'2026-11-03T20:00:00Z'},
  {item_id:222,sku:'SKU222',title:'B',observed_day:date,
   first_views:100,last_views:150,first_seen_at:'2026-11-03T12:00:00Z',
   last_seen_at:'2026-11-03T20:00:00Z'}
 ];
 const result=rankObservedViews(rows,parseViewsWindow({period:'7'},date));
 assert.equal(result.list[0].viewsObserved,50);
 assert.equal(result.list[1].viewsObserved,50);
 assert.equal(result.withPeriodDelta,2);
 assert.equal(result.precision,'sampled_partial_not_full_period');
});
test('reinício de contagem não gera diferença negativa fictícia',()=>{
 const x=[{item_id:111,observed_day:date,sku:'SKU',first_views:400,
  last_views:120,first_seen_at:'2026-11-03T12:00:00Z',last_seen_at:'2026-11-03T20:00:00Z'}];
 assert.equal(rankObservedViews(x,parseViewsWindow({period:'today'},date)).list[0].viewsObserved,null);
});
test('varre páginas da Shopee, obtém métricas somente de Product API e não consulta Ads',async()=>{
 const hits=[];
 const api=async(_cfg,req)=>{
  hits.push(req.path);
  if(req.path==='/api/v2/product/get_item_list')
   return {response:{total_count:2,has_next_page:false,item:[{item_id:111},{item_id:222}]}};
  if(req.path==='/api/v2/product/get_item_extra_info')
   return {response:{item_list:[{item_id:111,views:123,sale:4,likes:2},
    {item_id:222,views:99,sale:1,likes:7}]}};
  if(req.path==='/api/v2/product/get_item_base_info')
   return {response:{item_list:[{item_id:111,item_sku:'A',item_name:'Produto A',
    image:{image_url_list:['https://example.com/a.png']}},
    {item_id:222,item_sku:'',item_name:'Variantes',
     image:{image_url_list:['https://example.com/b.png']}}]}};
  throw Error('Endpoint inesperado');
 };
 const scan=await scanLiveShopViews({cfg:{},auth:{shopId:1,accessToken:'t'},
  callApi:api,now:new Date('2026-11-03T18:00:00.000Z')});
 assert.equal(scan.total,2);
 assert.equal(scan.items[0].views,123);
 assert.equal(scan.items[1].sku,'','métricas do anúncio-pai não viram métricas de SKU da variação');
 assert.deepEqual(hits,['/api/v2/product/get_item_list',
  '/api/v2/product/get_item_extra_info','/api/v2/product/get_item_base_info']);
 assert.equal(hits.some(x=>x.includes('/ads/')),false);
});
test('falha de métricas interrompe gravação de varredura',async()=>{
 await assert.rejects(()=>scanLiveShopViews({cfg:{},auth:{shopId:1,accessToken:'t'},
  callApi:async(_cfg,req)=>{
   if(req.path.endsWith('/get_item_list'))
    return {response:{total_count:1,item:[{item_id:111}]}};
   return {response:{item_list:[]}};
  }}),/Informações incompletas/);
});
test('salvar duas medições preserva o primeiro valor e registra último do dia',async()=>{
 const oldFetch=globalThis.fetch,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://fake.supabase.co';
 process.env.SUPABASE_SECRET_KEY='secret-test';
 const data=new Map();
 globalThis.fetch=async(url,opts={})=>{
  const request=new URL(String(url));
  assert.match(request.pathname,/shopee_product_view_samples/);
  if(opts.method==='POST'){
   const rows=JSON.parse(opts.body);
   for(const r of rows)data.set(r.shop_id+':'+r.item_id+':'+r.observed_day,r);
   return new Response('',{status:204});
  }
  const snapshot=[...data.values()].filter(x=>String(x.shop_id)==='1');
  return new Response(JSON.stringify(snapshot),{status:200});
 };
 try{
  const scan={day:date,total:1,items:[{itemId:'111',views:100,sku:'A',
   title:'A',imageUrl:'',status:'NORMAL',sale:1,likes:2}],
   observedAt:'2026-11-03T11:00:00Z'};
  await saveViewsScan(1,scan);
  await saveViewsScan(1,{...scan,observedAt:'2026-11-03T15:00:00Z',
   items:[{...scan.items[0],views:130}]});
  const rows=await listViewSamples(1,{start:date,end:date});
  assert.equal(rows.length,1);
  assert.equal(rows[0].first_views,100);
  assert.equal(rows[0].last_views,130);
  assert.equal(rows[0].first_seen_at,scan.observedAt);
 }finally{
  globalThis.fetch=oldFetch;
  if(url===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=url;
  if(key===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=key;
 }
});
test('popup escolhe as quatro datas e separa API geral dos dados orgânicos',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/organic-top10.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(html,/data-period="today"/);
 assert.match(html,/data-period="7"/);
 assert.match(html,/data-period="30"/);
 assert.match(html,/data-period="custom"/);
 assert.match(html,/organicTop10ModeApi/);
 assert.match(html,/organicTop10ModeOrganic/);
 assert.match(ui,/product-views\/top10/);
 assert.match(ui,/product-views\/collect/);
 assert.match(ui,/viewsObserved/);
 assert.match(ui,/Total histórico \(não é do período\)/);
 assert.match(server,/get_item_extra_info|scanLiveShopViews/);
 assert.doesNotMatch(ui,/\/api\/shopee\/ads\//);
});
