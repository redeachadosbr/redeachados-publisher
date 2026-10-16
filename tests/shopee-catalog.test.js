import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_STATUSES,normalStatus,validItemId,normalizeCatalogItem,
  normalizeShopeeModels,fetchCatalogPage,catalogSummary
} from '../catalog.js';

const cfg={mode:'live'},auth={accessToken:'fake-test-token',shopId:852701218};
test('status permitidos e item IDs são validados',()=>{
  assert.deepEqual(CATALOG_STATUSES,['NORMAL','UNLIST','BANNED','REVIEWING']);
  assert.equal(normalStatus('unlist'),'UNLIST');
  assert.throws(()=>normalStatus('ALL'),/não permitido/);
  assert.equal(validItemId(58268798868),'58268798868');
  assert.throws(()=>validItemId('1,2'),/inválido/);
});
test('listagem de 50 itens com paginação oficial e detalhes associados',async()=>{
  const calls=[];
  const api=async(_cfg,args)=>{
    calls.push(args);
    if(args.path.endsWith('get_item_list')){
      assert.deepEqual(args.query,{item_status:'NORMAL',offset:0,page_size:50});
      return {response:{has_next_page:true,next_offset:50,total_count:120,item:[
        {item_id:100,item_status:'NORMAL',update_time:1792000000},
        {item_id:101,item_status:'NORMAL',update_time:1792000500}
      ]}};
    }
    assert.equal(args.query.item_id_list,'100,101');
    return {response:{item_list:[
      {item_id:100,item_name:'Liquidificador USB',item_sku:'ABC-100',
       price_info:[{current_price:56.9}],stock_info_v2:{summary_info:{total_available_stock:0}},
       image:{image_url_list:['https://cdn.example/item.png']}},
      {item_id:101,item_name:'Mala com variantes',item_sku:'MALA-101',has_model:true,
       price_info:[],stock_info_v2:{summary_info:{}}}
    ]}};
  };
  const page=await fetchCatalogPage(cfg,auth,api,{status:'NORMAL'});
  assert.equal(page.items.length,2);
  assert.equal(page.nextOffset,50);
  assert.equal(page.totalCount,120);
  assert.equal(page.enrichedCount,2);
  assert.equal(page.items[0].stock,0);
  assert.equal(page.items[0].sku,'ABC-100');
  assert.equal(page.items[0].price,56.9);
  assert.equal(page.items[0].imageUrl,'https://cdn.example/item.png');
  assert.equal(page.items[1].hasModel,true);
  assert.equal(page.items[1].price,null);
  assert.equal(page.items[1].stock,null);
  assert.equal(calls.length,2);
});
test('falha de detalhes não inventa preço ou estoque e retorna aviso',async()=>{
  const page=await fetchCatalogPage(cfg,auth,async(_cfg,x)=>{
    if(x.path.endsWith('get_item_list'))
      return {response:{has_next_page:false,item:[{item_id:202,item_status:'UNLIST'}]}};
    throw Error('Shopee: permission denied');
  },{status:'UNLIST'});
  assert.equal(page.items[0].price,null);
  assert.equal(page.items[0].stock,null);
  assert.equal(page.items[0].baseLoaded,false);
  assert.match(page.warnings.join(''),/permission denied/);
});
test('next offset é calculado pelo total retornado quando next_offset não existe',async()=>{
  const p=await fetchCatalogPage(cfg,auth,async(_cfg,x)=>{
    if(x.path.endsWith('get_item_list'))
      return {response:{has_next_page:true,item:[{item_id:77,item_status:'NORMAL'}]}};
    return {response:{item_list:[{item_id:77,item_name:'item'}]}};
  },{offset:140,pageSize:50});
  assert.equal(p.nextOffset,141);
});
test('modelos e SKU por variante preservam estoque zero e valores oficiais',()=>{
  const models=normalizeShopeeModels({response:{model:[
    {model_id:12,model_sku:'VAR-12',model_status:'MODEL_NORMAL',
      price_info:[{current_price:102.3}],stock_info_v2:{summary_info:{total_available_stock:0}}},
    {model_id:13,model_sku:'VAR-13',model_status:'MODEL_UNLIST'}
  ]}});
  assert.equal(models[0].stock,0);
  assert.equal(models[0].price,102.3);
  assert.equal(models[1].stock,null);
  assert.throws(()=>normalizeShopeeModels({response:{}}),/lista válida/);
});
test('resumo de catálogo não interpreta estoque ausente como esgotado',()=>{
  const rows=[
    normalizeCatalogItem({item_id:1,item_status:'NORMAL'},{item_id:1,item_sku:'SKU',stock_info_v2:{summary_info:{total_available_stock:0}}}),
    normalizeCatalogItem({item_id:2,item_status:'UNLIST'},undefined),
    normalizeCatalogItem({item_id:3,item_status:'BANNED'},{item_id:3,item_sku:'V'})
  ];
  assert.deepEqual(catalogSummary(rows),{
    total:3,active:1,unlisted:1,banned:1,reviewing:0,withoutSku:1,stockUnknown:2,outOfStock:1,enriched:2
  });
});
