import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalogSheets, lookupCatalogSku, linkCatalogSku, catalogStats} from '../catalog.js';

const basic = rows => [{name:'Produtos', rows:[['ID do Produto','SKU de referência','Nome do Produto','Descrição do Produto'],...rows]}];
const base = () => parseCatalogSheets(basic([
  ['22699708957','NTM3001127V','Rena com movimento','Descrição'],
  ['58268864630','NTM3001127V','Rena macho média','Outra descrição'],
  ['123','00125','Produto com zeros','']
]));

test('basic export does not invent missing variation SKUs', () => {
  const c=base();
  assert.equal(c.products.length,3);
  assert.equal(lookupCatalogSku(c,'NTM3112B127V'),null);
  assert.equal(lookupCatalogSku(c,'125'),null);
  assert.equal(lookupCatalogSku(c,'00125').id,'123');
});

test('duplicate parent SKU requires explicit choice and rejects an unrelated ID', () => {
  const c=base();
  assert.throws(()=>lookupCatalogSku(c,'NTM3001127V'),e=>e.code==='SKU_AMBIGUOUS'&&e.candidates.length===2);
  assert.equal(lookupCatalogSku(c,'NTM3001127V','22699708957').name,'Rena com movimento');
  assert.throws(()=>lookupCatalogSku(c,'NTM3001127V','123'),/não está vinculado/);
  assert.equal(catalogStats(c).duplicateSkuCount,1);
});

test('confirmed variation resolves the correct listing, preserves leading zeroes and tolerates whitespace/case', () => {
  let c=linkCatalogSku(base(),'22699708957','NTM3112B127V');
  c=linkCatalogSku(c,'22699708957','NTM3112B220V');
  assert.equal(lookupCatalogSku(c,'  ntm3112b127v\u200B ').id,'22699708957');
  assert.equal(lookupCatalogSku(c,'NTM3112B220V').matchType,'variation');
  assert.equal(lookupCatalogSku(c,'NTM3112B127V').url,'https://shopee.com.br/product/852701218/22699708957/');
  assert.equal(lookupCatalogSku(c,'NTM3112B'),null);
  assert.equal(catalogStats(c).variationSkuCount,2);
});

test('variation links survive basic-info reimport and cannot be silently assigned to another product', () => {
  const c=linkCatalogSku(base(),'22699708957','NTM3112B127V');
  const next=parseCatalogSheets(basic([['22699708957','NTM3001127V','Nome atualizado',''],['58268864630','NTM3001127V','Outro anúncio','']]),{previous:c});
  assert.equal(lookupCatalogSku(next,'NTM3112B127V').name,'Nome atualizado');
  assert.throws(()=>linkCatalogSku(next,'58268864630','NTM3112B127V'),/já está vinculada/);
  assert.throws(()=>linkCatalogSku(next,'99999','SKU-NOVO'),/não está no catálogo/);
  assert.throws(()=>linkCatalogSku(next,'22699708957',''),/SKU de variação válida/);
});

test('variation table groups repeated and continuation rows without losing variants', () => {
  const sheets=[{name:'Instruções',rows:[['Como usar esta planilha']]},{name:'Variações',rows:[
    ['ID do Produto','SKU principal','Nome do Produto','SKU da variação','Nome da variação'],
    ['10','PARENT','Luminária','LED-127','127V'],
    ['10','PARENT','Luminária','LED-220','220V'],
    ['','','','LED-USB','USB']
  ]}];
  const c=parseCatalogSheets(sheets);
  assert.equal(c.products.length,1);
  assert.equal(c.products[0].variations.length,3);
  for(const sku of ['PARENT','LED-127','LED-220','LED-USB'])assert.equal(lookupCatalogSku(c,sku).id,'10');
  assert.equal(lookupCatalogSku(c,'led–127').id,'10');
});

test('a variation-only export supplements an existing catalog', () => {
  const c=parseCatalogSheets([{name:'Variações',rows:[['ID do Produto','SKU da variação'],['123','00125-B']]}],{previous:base()});
  assert.equal(c.products.length,3);
  assert.equal(lookupCatalogSku(c,'00125-B').id,'123');
  assert.throws(()=>parseCatalogSheets([{name:'Variações',rows:[['ID do Produto','SKU da variação'],['999','NEW-1']]}]),/sem nome/);
});

test('changed parent codes do not retain the old parent SKU', () => {
  const previous=parseCatalogSheets(basic([['1','OLD','Produto','']]));
  const updated=parseCatalogSheets(basic([['1','NEW','Produto','']]),{previous});
  assert.equal(lookupCatalogSku(updated,'OLD'),null);
  assert.equal(lookupCatalogSku(updated,'NEW').id,'1');
});

test('bad or empty input fails before replacing a valid catalog', () => {
  const previous=base(), snapshot=JSON.stringify(previous);
  assert.throws(()=>parseCatalogSheets([{name:'Invalid',rows:[['SKU','Preço']]}],{previous}),/não parece ser a exportação de Informações básicas/);
  assert.throws(()=>parseCatalogSheets(basic([]),{previous}),/Nenhum produto/);
  assert.equal(JSON.stringify(previous),snapshot);
});

test('Shopee technical metadata and localized header rows are skipped', () => {
  const c=parseCatalogSheets([{name:'Sheet1',rows:[
    ['et_title_product_id','et_title_parent_sku','et_title_product_name','et_title_product_description'],
    ['basic_info','metadata','0','852701218'],
    ['ID do Produto','SKU de referência','Nome do Produto','Descrição do Produto'],[],[],[],
    ['100','00051','Nome real','Descrição real']
  ]}]);
  assert.equal(c.products.length,1);
  assert.equal(lookupCatalogSku(c,'00051').id,'100');
});
