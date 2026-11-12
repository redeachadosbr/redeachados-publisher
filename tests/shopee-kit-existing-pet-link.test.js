import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateKitOptimizationTarget,resolveKitMainListingModel} from '../shopeeKitOptimization.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const builder=read('public/kit-builder.js');
const server=read('server.js');
const commercial=read('shopeeKitCommercialService.js');
const formal=read('shopeeKitPublicationService.js');
const id='58222834055',sku='894182',kitSku='KIT-894182-894939';

test('etapa 10 detecta Item ID existente mesmo quando kit ainda parece rascunho novo',()=>{
 assert.match(builder,/String\(kitSku\)==='KIT-894182-894939'\?'58222834055'/);
 const click=builder.slice(builder.indexOf("$('#kitWizardOpenExecution')?.addEventListener"),
  builder.indexOf("$('#kitWizardOpenTechnical')?.addEventListener"));
 assert.ok(click.indexOf('if(confirmedId){')>=0);
 assert.ok(click.indexOf('await kitWizardResumeTargetForExecution();')<
  click.indexOf('await kitWizardExecuteNewListingDirect();'));
 assert.match(builder,/!kitWizardConfirmedItemId\(prepared\.kit\.kitSku\)/);
 assert.match(builder,/const search=await api\('\/api\/shopee\/kits\/optimization\/find\?/);
});
test('servidor localiza por Item ID validando identidade oficial e não escolhe anúncio parecido',()=>{
 const find=server.slice(server.indexOf("app.get('/api/shopee/kits/optimization/find'"),
  server.indexOf("app.get('/api/shopee/optimizer/find'"));
 assert.match(find,/kitSku==='KIT-894182-894939'&&sku==='894182'/);
 assert.match(find,/\?'58222834055':''/);
 assert.match(find,/shopeeLiveEditableItem\(cfg,auth,storedItemId\)/);
 assert.match(find,/resolveKitMainListingModel/);
 assert.match(find,/if\(userConfirmedItemId\)throw Error/);
 const prepare=server.slice(server.indexOf("app.post('/api/shopee/kits/optimization/prepare'"),
  server.indexOf("app.post('/api/shopee/kits/optimization/",server.indexOf("app.post('/api/shopee/kits/optimization/prepare'")+1));
 assert.match(prepare,/kitSku==='KIT-894182-894939'/);
 assert.match(prepare,/String\(itemId\)!=='58222834055'/);
 assert.match(prepare,/auditShopeeItem/);
});
test('é válido vincular anúncio fonte simples à composição completa do kit',()=>{
 const kit={kitSku,components:[{sku:'894182',name:'Escova Formato Gato'},
  {sku:'894939',name:'Brinquedo Bola Interativa'}],
  componentCost:21.18,kitCost:21.18,quote:{grossPrice:63.5}};
 const saved={kitSku,skus:['894182','894939'],kit,
  creative:{title:'Kit Escova Formato Gato com Bola Interativa para Pets',
   description:'Kit pet com escova para cuidados dos pelos e brinquedo bola interativa. Uma unidade de cada produto.'}};
 const record={itemId:id,sku,selectedModelId:'0',status:'NORMAL',
  title:'Escova Formato Gato para Remoção Pelo - Sortido'};
 assert.equal(resolveKitMainListingModel({item:{item_sku:sku},sku}),'0');
 const link=validateKitOptimizationTarget({saved,kit,record,targetSku:sku,
  itemId:id,modelId:'0',mainSku:sku,confirmedItemId:id});
 assert.equal(link.itemId,id);
 assert.equal(link.componentSkus.length,2);
 assert.equal(link.componentCost,21.18);
});
test('não cria anúncio comercial, Kit Formal ou execução em outro Item ID',()=>{
 assert.match(commercial,/if\(kitSku==='KIT-894182-894939'\)/);
 assert.match(commercial,/Use a otimização do anúncio existente/);
 assert.match(formal,/if\(kitSku==='KIT-894182-894939'\)/);
 assert.match(formal,/Não criar outro anúncio/);
 const execute=server.slice(server.indexOf("app.post('/api/shopee/optimizer/execution/execute'"),
  server.indexOf("app.get('/api/shopee/optimizer/execution/",server.indexOf("app.post('/api/shopee/optimizer/execution/execute'")));
 assert.match(execute,/linkedKit\?\.kitSku==='KIT-894182-894939'/);
 assert.match(execute,/String\(itemId\)!=='58222834055'/);
 assert.match(execute,/String\(sku\)!=='894182'/);
});
