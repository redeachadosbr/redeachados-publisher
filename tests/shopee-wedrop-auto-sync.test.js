import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  identifyWeDropLayout,prepareAutomaticWeDropImport,previewWeDropCsv
} from '../wedropCsv.js';
import {supplierFeedConfig,changedSupplierCosts,fetchSupplierCatalogCsv,supplierCsvHash} from '../wedropAutoSync.js';

const header='SKU,Nome do Produto,Marca,Categoria,Fornecedor,Estado do Fornecedor,Preço,EAN,NCM,CEST,Peso (kg),Largura (cm),Altura (cm),Comprimento (cm),Peso da Caixa (kg),Imagem Principal';
const rows=[
  '0000003097,Lava Auto,Auto,Carros,Fratelli,SC,10.99,7899871230000,34029090,,1,2,3,4,0,https://wedrop.example/img',
  '895707,Pelinho Rosa,Fratelli,Pets,Fratelli,SC,18.99,7898974895707,42010090,,0.2,23,28,4,0,https://wedrop.example/img',
  'WG13830,Pote de vidro,Fratelli,Casa,Fratelli,SC,9.99,7899527112487,70130000,,0,1,2,3,0,https://wedrop.example/img',
  'WG13830,Pote de vidro,Fratelli,Casa,Fratelli,SC,9.99,7899527112494,70130000,,0,1,2,3,0,https://wedrop.example/img'
];
test('reconhece as 16 colunas reais do catálogo WeDrop enviado',()=>{
  const layout=identifyWeDropLayout(header.split(','));
  assert.deepEqual(layout,{recognized:true,skuColumn:0,costColumn:6,schema:'wedrop-catalog-16'});
  const r=prepareAutomaticWeDropImport(header+'\n'+rows.join('\n')+'\n');
  assert.equal(r.totalRows,4);
  assert.equal(r.uniqueSkus,3);
  assert.equal(r.layout,'wedrop-catalog-16');
  assert.deepEqual(r.costs[0],{sku:'0000003097',unitCost:10.99});
  assert.equal(r.costs.find(x=>x.sku==='895707').unitCost,18.99);
  assert.equal(previewWeDropCsv(header+'\n'+rows.join('\n')).automaticLayout.recognized,true);
});
test('não assume que Preço genérico de outra planilha significa custo',()=>{
  assert.equal(identifyWeDropLayout(['SKU','Nome','Preço']).recognized,false);
  assert.throws(()=>prepareAutomaticWeDropImport('SKU,Nome,Preço\nA,produto,99.90\n'),/bloqueada/);
  assert.throws(()=>prepareAutomaticWeDropImport('SKU,EAN,NCM\nA,123,456\n'),/bloqueada/);
});
test('reconhece custo de aquisição explícito em outros formatos confiáveis',()=>{
  const p=prepareAutomaticWeDropImport('SKU;Custo WeDrop\nA;R$ 12,50\n');
  assert.equal(p.costs[0].unitCost,12.5);
});
test('detecta alterações apenas de custos por SKU sem eliminar zeros à esquerda',()=>{
  const old=[{supplier_sku:'0000003097',unit_cost:'10.99'},
    {supplier_sku:'895707',unit_cost:'18.99'}];
  const incoming=[
    {sku:'0000003097',unitCost:10.99},
    {sku:'895707',unitCost:20.99},
    {sku:'3097',unitCost:12.99}
  ];
  assert.deepEqual(changedSupplierCosts(incoming,old),incoming.slice(1));
});
test('feed só aceita HTTPS, host autorizado e shop id explícito',()=>{
  const valid=supplierFeedConfig({
    WEDROP_CATALOG_FEED_URL:'https://catalogo.wedrop.com.br/export.csv',
    WEDROP_CATALOG_FEED_HOST:'catalogo.wedrop.com.br',
    WEDROP_CATALOG_SHOP_ID:'852701218',
    WEDROP_CATALOG_REFRESH_MINUTES:'360'
  });
  assert.equal(valid.configured,true);
  assert.equal(valid.intervalMinutes,360);
  assert.equal(supplierFeedConfig({}).configured,false);
  assert.throws(()=>supplierFeedConfig({
    WEDROP_CATALOG_FEED_URL:'http://127.0.0.1/internal',
    WEDROP_CATALOG_FEED_HOST:'127.0.0.1',
    WEDROP_CATALOG_SHOP_ID:'852701218'
  }),/HTTPS/);
  assert.throws(()=>supplierFeedConfig({
    WEDROP_CATALOG_FEED_URL:'https://wrong.example/file',
    WEDROP_CATALOG_FEED_HOST:'wedrop.com.br',
    WEDROP_CATALOG_SHOP_ID:'852701218'
  }),/HTTPS/);
});
test('feed carrega CSV apenas via GET HTTPS e recusa redirect/erro HTTP',async()=>{
  const feed=supplierFeedConfig({
    WEDROP_CATALOG_FEED_URL:'https://wedrop.com.br/feed.csv',
    WEDROP_CATALOG_FEED_HOST:'wedrop.com.br',
    WEDROP_CATALOG_SHOP_ID:'852701218'
  });
  const sample=header+'\n'+rows[0]+'\n';
  const r=await fetchSupplierCatalogCsv(feed,{
    fetchImpl:async(url,options)=>{
      assert.equal(url,feed.url);
      assert.equal(options.redirect,'error');
      return new Response(sample,{status:200,headers:{'content-type':'text/csv'}});
    }
  });
  assert.equal(r,sample);
  assert.equal(supplierCsvHash(r).length,64);
});
test('interface importa CSV automaticamente ao selecionar arquivo',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(app,/#wedropFile'\)\.onchange=async/);
  assert.match(app,/\/api\/shopee\/wedrop\/auto\/import/);
  assert.match(app,/await refreshWeDropCoverage\(\)/);
  assert.match(html,/id="wedropAutoStatus"/);
  assert.match(html,/wedrop-manual-fallback/);
});
