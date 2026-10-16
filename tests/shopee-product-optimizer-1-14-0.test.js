import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSkuLookup,normalizeAttributeAudit,normalizeOptimizerItem,auditShopeeItem} from '../productOptimizer.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

const item={item_id:58270446955,item_name:'Liquidificador Portátil USB 400ml Recarregável',
 item_sku:'429229',category_id:10023,item_status:'NORMAL',has_model:false,
 image:{image_id_list:['i1','i2'],image_url_list:['https://cf.shopee.com.br/image1']},
 attribute_list:[
 {attribute_id:11,attribute_value_list:[{value_id:0,original_value_name:'0mAh'}]},
 {attribute_id:12,attribute_value_list:[{value_id:4,original_value_name:'Europeu'}]},
 {attribute_id:13,attribute_value_list:[{value_id:0,original_value_name:'Copo altura 13cm, mixer altura 20cm, dimensões diferentes dependendo da versão; verificar as medidas ao utilizar o produto'}]}
 ]};
const tree={response:{attribute_list:[
 {attribute_id:11,name:'Capacidade da Bateria',mandatory:true,attribute_info:{input_type:3,format_type:2,attribute_unit_list:['mAh']}},
 {attribute_id:12,name:'Tipo de Plug',mandatory:false,attribute_info:{input_type:2},attribute_value_list:[{value_id:4,name:'Europeu'}]},
 {attribute_id:13,name:'Dimensões do Produto',mandatory:false,attribute_info:{input_type:3}},
 {attribute_id:14,name:'Com bateria',mandatory:true,attribute_info:{input_type:2},attribute_value_list:[{value_id:1,name:'Sim'},{value_id:2,name:'Não'}]},
 {attribute_id:15,name:'Marca',mandatory:true,attribute_info:{input_type:2}}
 ]}};
test('auditoria oficial destaca suspeita, ausência obrigatória, opções e unidades reais',()=>{
 const audit=normalizeAttributeAudit(item,tree);
 assert.equal(audit.categoryId,10023);
 assert.equal(audit.total,5);
 assert.equal(audit.mandatory,3);
 assert.equal(audit.missingMandatory,2);
 assert.equal(audit.review,3);
 const battery=audit.attributes.find(a=>a.id===11);
 assert.equal(battery.state,'review');
 assert.ok(battery.issues.some(i=>/zero/.test(i)));
 assert.ok(battery.issues.some(i=>/Unidade/.test(i)));
 assert.deepEqual(battery.allowedUnits,['mAh']);
 assert.ok(audit.attributes.find(a=>a.id===12).issues.some(i=>/plugue/.test(i)));
 assert.ok(audit.attributes.find(a=>a.id===13).issues.some(i=>/Dimensões/.test(i)));
 assert.equal(audit.attributes.find(a=>a.id===14).state,'missing');
 assert.equal(audit.attributes.find(a=>a.id===14).options[0].name,'Sim');
 assert.equal(audit.technicalAccuracyConfirmed,false);
});
test('não chama ficha validada sem árvore de atributos ou categoria',()=>{
 assert.throws(()=>normalizeAttributeAudit({...item,category_id:0},tree),/categoria/i);
 assert.throws(()=>normalizeAttributeAudit(item,{response:{}}),/árvore/);
 assert.throws(()=>validateSkuLookup(''),/SKU/);
 assert.equal(validateSkuLookup('429229'),'429229');
});
test('identidade do produto preserve fotos, título, e não afirma ausência de vídeo',()=>{
 const audit=normalizeAttributeAudit(item,tree);
 const row=normalizeOptimizerItem(item,null,audit);
 assert.equal(row.imageCount,2);
 assert.equal(row.sku,'429229');
 assert.match(row.videoStatus,/Não confirmado/);
 assert.equal(row.steps.length,7);
 assert.equal(row.steps.find(x=>x.key==='technical').state,'review');
});
test('auditoria chama SOMENTE endpoints de leitura e não altera o anúncio',async()=>{
 const seen=[];
 const api=async(_cfg,x)=>{
   seen.push(x.path);
   if(x.path.endsWith('get_item_base_info'))return {response:{item_list:[item]}};
   if(x.path.endsWith('get_attribute_tree'))return tree;
   throw Error('Chamada inesperada '+x.path);
 };
 const result=await auditShopeeItem({}, {shopId:123,accessToken:'TEST'},api,item.item_id);
 assert.equal(result.itemId,String(item.item_id));
 assert.deepEqual(seen,['/api/v2/product/get_item_base_info','/api/v2/product/get_attribute_tree']);
});
test('menu, regras persistentes e detalhes por atributo ficam separados de Produtos e Financeiro',()=>{
 const html=read('../public/index.html'),server=read('../server.js'),app=read('../public/app.js');
 for(const id of ['tab-optimizer','optimizerPrompt','optimizerFiscalNotes','optimizerItemId',
   'optimizerAudit','optimizerAttributesBody','optimizerSteps','optimizerSave','optimizerCandidates'])
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/href="\/app\/otimizacao"/);
 assert.match(app,/optimizer:\{slug:'otimizacao'/);
 assert.match(server,/\/api\/shopee\/optimizer\/audit/);
 assert.match(server,/\/api\/shopee\/optimizer\/settings/);
 assert.match(server,/\/api\/shopee\/optimizer\/find/);
 assert.match(server,/readOnly:true/);
 assert.match(html,/app\.js\?v=1\.14\.0/);
});
