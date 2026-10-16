import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareSkuSets} from '../wedropCosts.js';
import {prepareWeDropImport} from '../wedropCsv.js';

test('SKU textual com zeros à esquerda nunca corresponde ao código sem zeros',()=>{
  const result=compareSkuSets(
    ['0000003097','895707','0000003103','0122PET'],
    ['0000003097','0000003103','0122PET']
  );
  assert.equal(result.matchedCount,3);
  assert.equal(result.unmatchedCount,1);
  assert.deepEqual(result.unmatchedExamples,['895707']);
  assert.equal(compareSkuSets(['3097'],['0000003097']).matchedCount,0);
});
test('mapeamento de EAN ou NCM gera zero vínculos com SKU sem inventar',()=>{
  const parsed=prepareWeDropImport(
    'SKU;Produto;Custo;EAN;NCM\n895707;Pet Morango;18.99;7898974895707;42010090\n',
    {skuColumn:3,costColumn:2}
  );
  assert.deepEqual(parsed.costs,[{sku:'7898974895707',unitCost:18.99}]);
  const comparison=compareSkuSets(parsed.costs.map(x=>x.sku),['895707']);
  assert.equal(comparison.matchedCount,0);
  assert.equal(comparison.unmatchedCount,1);
});
test('marcação da interface põe texto junto do checkbox e remove width 100%',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
  assert.match(html,/id="wedropSkipInvalid" type="checkbox"><span>/);
  assert.match(html,/id="wedropOverwrite" type="checkbox"><span>/);
  assert.match(css,/\.wedrop-panel label\.wedrop-flag input\[type="checkbox"\]/);
  assert.match(css,/width:18px!important/);
  assert.match(css,/flex:0 0 18px!important/);
  assert.match(css,/#wedropSample\{width:100%;max-width:100%;overflow-x:auto/);
});
test('interface só libera importação depois da validação de SKU',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const code=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(html,/id="wedropImportBtn" type="button" disabled/);
  assert.match(code,/#wedropImportBtn/);
  assert.match(code,/weDropValidation/);
  assert.match(code,/\/api\/shopee\/wedrop\/validate/);
  assert.match(server,/\/api\/shopee\/wedrop\/validate/);
  assert.match(server,/\/api\/shopee\/wedrop\/models\/sync/);
  assert.match(server,/comparison\.matchedCount&&req\.body\?\.allowUnmatched!==true/);
});
test('variantes são consultadas em lotes limitados, com validação de IDs',()=>{
  const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(server,/ids\.length>10/);
  assert.match(server,/\/\^\\d\{1,18\}\$\//);
  assert.match(server,/variantsSyncBusy/);
});
