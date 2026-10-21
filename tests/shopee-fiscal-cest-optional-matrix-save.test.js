import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileTax} from '../shopeeStructuredFields.js';
import {fiscalMatrixSource} from '../shopeeMatrixRules.js';
import {validateReview} from '../shopeeOptimizationWorkflow.js';
import {supplierWorkflowFacts} from '../shopeeSupplierFacts.js';
const fiscal={ncm:'95069900',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
 csosn:'102',measure_unit:'UN',operation_type:'1',cest:'',pis_cofins_cst:'',
 evidence:'NCM confirmado no catálogo WeDrop e CFOP/CSOSN revisados pela contabilidade.'};
const supplier={supplier_sku:'TRC1525',matchedBy:'exact-sku',source_file:'catalogo.csv',
 product_data:{ncm:'95069900',brand:'Top Rio'}};
test('CEST vazio não impede registrar o fiscal revisado no Motor Matriz',()=>{
 const change=validateReview({stage:'fiscal',reviewed:true,tax:fiscal});
 assert.equal(change.reviewed,true);
 const verified=compileTax(change.tax,{tax_info:{}});
 assert.deepEqual(verified,{
  ncm:'95069900',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
  csosn:'102',operation_type:'1',measure_unit:'UN'
 });
 assert.equal(Object.hasOwn(verified,'cest'),false);
 assert.equal(fiscalMatrixSource({sku:'TRC1525',supplier,tax:change.tax}).ncm,'95069900');
});
test('campos do contador ficam aproveitáveis nas próximas SKUs com NCM próprio',()=>{
 const rules={fiscal_notes:'Origem: 2- estrangeira: adquirida no mercado interno\nCFOP Mesmo Estado: 5106\nCFOP Outros Estados: 6106\nCSOSN: 102\ntipo de serviço: Revendedor'};
 const result=supplierWorkflowFacts(supplier,{title:'Piscina Inflável',description:'',
  attributeAudit:{attributes:[{name:'Quantidade da embalagem',values:[{name:'1'}]}]}},rules).taxSuggestion;
 assert.equal(result.ncm,'95069900');
 assert.equal(result.same_state_cfop,'5106');
 assert.equal(result.diff_state_cfop,'6106');
 assert.equal(result.csosn,'102');
 assert.equal(result.cest,'00');
});
test('Marcador 00 nunca substitui CEST fiscal real de 7 dígitos',()=>{
 const actual=supplierWorkflowFacts({...supplier,product_data:{...supplier.product_data,cest:'1234567'}},
  {title:'Piscina Inflável',description:'',attributeAudit:{attributes:[]}},{fiscal_notes:''}).taxSuggestion;
 assert.equal(actual.cest,'1234567');
 const verified=compileTax({...fiscal,cest:'00'},{tax_info:{cest:'7654321'}});
 assert.equal(verified.cest,'7654321');
 const blank=compileTax({...fiscal,cest:'00'},{tax_info:{}});
 assert.equal(Object.hasOwn(blank,'cest'),false);
});
test('cadastrar fiscal não aciona API Shopee e não exige CEST para marcar revisão',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.post('/api/shopee/optimizer/workflow/review'");
 const end=server.indexOf('// Execution uses reviewed content',start);
 const route=server.slice(start,end);
 assert.match(route,/compileTax\(change\.tax,\{tax_info:\{\}\}\)/);
 assert.match(route,/saveWorkflowReview\(auth\.shopId,itemId,modelId,sku,change\)/);
 assert.match(route,/fiscalRegistration:change\.stage==='fiscal'\?/);
 assert.match(route,/cestOptional:true/);
 assert.doesNotMatch(route,/\/api\/v2\/product\/update_item/);
});
test('o lote mostra fiscal cadastrado como sucesso da matriz mas sem declaração de publicação',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const first=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/prepare'");
 const last=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/execute'",first);
 const segment=server.slice(first,last);
 assert.match(segment,/registered:true,state:'draft_only'/);
 assert.match(segment,/publicationPending:disposition\.issues/);
 assert.match(segment,/marketplaceUpdated:false/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/Salvar informações fiscais no Motor Matriz/);
 assert.match(app,/key==='fiscal'\?true/);
 assert.match(app,/if\(key!=='fiscal'\)void optimizerExecutionPrepare\(\)/);
 assert.match(app,/Cadastrado no Motor Matriz/);
 assert.match(app,/Publicação fiscal pendente:/);
});
