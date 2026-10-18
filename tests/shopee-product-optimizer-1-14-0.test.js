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
   seen.push(x);
   if(x.path.endsWith('get_item_base_info'))return {response:{item_list:[item]}};
   if(x.path.endsWith('get_attribute_tree'))return tree;
   throw Error('Chamada inesperada '+x.path);
 };
 const result=await auditShopeeItem({}, {shopId:123,accessToken:'TEST'},api,item.item_id);
 assert.equal(result.itemId,String(item.item_id));
 assert.deepEqual(seen.map(x=>x.path),
  ['/api/v2/product/get_item_base_info','/api/v2/product/get_attribute_tree']);
 assert.equal(seen[1].query.category_id_list,String(item.category_id));
 assert.equal(seen[1].query.category_id,undefined);
});
test('menu, regras persistentes e detalhes por atributo ficam separados de Produtos e Financeiro',()=>{
 const html=read('../public/index.html'),server=read('../server.js'),app=read('../public/app.js');
 for(const id of ['tab-optimizer','optimizerPrompt','optimizerFiscalNotes','optimizerItemId',
   'optimizerFind','optimizerAttributesBody','optimizerSteps','optimizerSave','optimizerCandidates'])
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/href="\/app\/otimizacao"/);
 assert.match(app,/optimizer:\{slug:'otimizacao'/);
 assert.match(server,/\/api\/shopee\/optimizer\/audit/);
 assert.match(server,/\/api\/shopee\/optimizer\/settings/);
 assert.match(server,/\/api\/shopee\/optimizer\/find/);
 assert.match(server,/readOnly:true/);
 assert.match(html,/app\.js\?v=\d+\.\d+\.\d+/);
});


test('a Shopee retorna response.list[{category_id,attribute_tree}], com filhos condicionais',()=>{
 const source={response:{list:[
  {category_id:10023,attribute_tree:[
    {attribute_id:100,name:'Bateria',mandatory:true,attribute_value_list:[
      {value_id:1,name:'Lítio',child_attribute_list:[
        {attribute_id:101,name:'Certificado',mandatory:true,attribute_value_list:[]}
      ]},
      {value_id:2,name:'Outra',child_attribute_list:[]}
    ]},
    {attribute_id:102,name:'Peso',mandatory:true,attribute_info:{input_type:3}}
  ]},
  {category_id:99999,attribute_tree:[{attribute_id:900,name:'Outra categoria',mandatory:true}]}
 ]}};
 const noSelection=normalizeAttributeAudit({...item,attribute_list:[]},source);
 assert.equal(noSelection.total,3);
 assert.equal(noSelection.missingMandatory,2);
 assert.equal(noSelection.attributes.find(x=>x.id===101).state,'conditional');
 assert.equal(noSelection.attributes.find(x=>x.id===900),undefined);
 const selected=normalizeAttributeAudit({...item,attribute_list:[
  {attribute_id:100,attribute_value_list:[{value_id:1}]}
 ]},source);
 assert.equal(selected.missingMandatory,2);
 assert.equal(selected.attributes.find(x=>x.id===101).state,'missing');
});
test('SKU verificado na consulta ao vivo e modelo correto, evitando vínculo antigo',async()=>{
 const api=async(_cfg,x)=>{
  if(x.path.endsWith('get_item_base_info'))return {response:{item_list:[{
    ...item,has_model:true,item_sku:'PARENT'
  }]}};
  if(x.path.endsWith('get_attribute_tree'))return tree;
  if(x.path.endsWith('get_model_list'))return {response:{model:[
    {model_id:551,model_sku:'429229',model_status:'NORMAL'},
    {model_id:552,model_sku:'OTHER',model_status:'NORMAL'}
  ]}};
  throw Error('API inesperada');
 };
 const auth={shopId:123,accessToken:'TEST'};
 const valid=await auditShopeeItem({},auth,api,item.item_id,{
  expectedSku:'429229',expectedModelId:'551'
 });
 assert.equal(valid.sku,'429229');
 assert.equal(valid.selectedModelId,'551');
 await assert.rejects(()=>auditShopeeItem({},auth,api,item.item_id,{
  expectedSku:'429229',expectedModelId:'552'
 }),/mudou na Shopee/);
 await assert.rejects(()=>auditShopeeItem({},auth,api,item.item_id,{
  expectedSku:'INCORRETO'
 }),/não corresponde/);
});
test('na interface o lojista fornece somente SKU; o identificador do item é oculto',()=>{
 const html=read('../public/index.html'),js=read('../public/app.js');
 assert.match(html,/id="optimizerSku"/);
 assert.match(html,/id="optimizerItemId" type="hidden"/);
 assert.doesNotMatch(html,/id="optimizerAudit"/);
 assert.match(html,/Localizar e analisar/);
 assert.match(js,/optimizerRunAudit\(matches\[0\]\.itemId,sku,matches\[0\]\.modelId\)/);
 assert.match(js,/optimizerRunAudit\(match\.itemId,sku,match\.modelId\)/);
});
