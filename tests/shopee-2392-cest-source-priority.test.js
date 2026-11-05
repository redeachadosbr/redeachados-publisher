import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileTax} from '../shopeeStructuredFields.js';
import {wedropCestForSku,supplierWorkflowFacts} from '../shopeeSupplierFacts.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';

const supplier={supplier_sku:'2392',matchedBy:'exact-sku',source_file:'produtos-catalogo.csv',
 source_line:600,product_data:{name:'Bicicleta Infantil Moto Cross Aro 16 - Rosa',
 ncm:'87120010',cest:null}};
const tax={ncm:'87120010',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
 csosn:'102',measure_unit:'UN',operation_type:'1',cest:'00',pis_cofins_cst:'99',
 evidence:'WeDrop produtos-catalogo.csv SKU 2392 linha 600'};
const live={item_id:58221348619,item_sku:'2392',item_status:'NORMAL',
 item_name:'Bicicleta anterior',description:'Descrição anterior',description_type:'normal',
 category_id:101724,tax_info:{ncm:'87120010',origin:'0',cest:'2806100'},
 image:{image_id_list:[]},video_info:[],attribute_list:[]};
const record={shopId:852701218,itemId:'58221348619',selectedModelId:'0',
 sku:'2392',status:'NORMAL',categoryId:101724,attributeAudit:{attributes:[],missingMandatory:0}};
const options={shopId:852701218,itemId:'58221348619',modelId:'0',sku:'2392',record,live,
 review:{stages:{fiscal:{reviewed:true}},tax},selectedStage:'fiscal'};
test('SKU 2392: WeDrop sugere 00, mas Shopee com CEST preenchido permanece intacta',()=>{
 assert.equal(wedropCestForSku(supplier),'00');
 assert.equal(supplierWorkflowFacts(supplier,record).taxSuggestion.cest,'00');
 assert.equal(compileTax(tax,live).cest,'2806100');
 assert.equal(compileTax(tax,live).ncm,'87120010');
 assert.equal(live.tax_info.cest,'2806100','leitura Shopee continua factual');
});
test('preservar o CEST 2806100 publicado na execução fiscal',()=>{
 const p=compileShopeeExecutionPlan(options);
 assert.equal(p.canExecute,true);
 assert.equal(p.proposed.tax_info.cest,'2806100');
 assert.notEqual(p.proposed.tax_info.cest,'00');
 assert.notEqual(p.fingerprint,'');
});
test('CEST já preenchido na Shopee prevalece; em branco usa 00',()=>{
 const withReal={...supplier,product_data:{...supplier.product_data,cest:'1234567'}};
 assert.equal(wedropCestForSku(withReal),'1234567');
 const quote=compileTax({...tax,cest:wedropCestForSku(withReal)},live);
 assert.equal(quote.cest,'2806100');
 assert.equal(compileTax({...tax,cest:'1234567'},{tax_info:{}}).cest,'00');
 assert.equal(wedropCestForSku({...supplier,matchedBy:'unreviewed'}),'00');
});
test('execução aprovada revalida CEST real da Shopee antes de gravar',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/cestForShopeeField\(live.tax_info\)/);
 assert.match(server,/CEST mudou na Shopee desde a prévia/);
 assert.doesNotMatch(server,/plannedTax&&String\(plannedTax.cest\?\?''\)!==expectedCest/);
});
test('interface exibe CEST existente da Shopee e preserva valor publicado',()=>{
 const client=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(client,/CEST já preenchido na Shopee/);
 assert.match(client,/A gravação exige autorização e confirmação pela API/);
 assert.match(client,/draft.cest=liveCest\|\|'00'/);
});
