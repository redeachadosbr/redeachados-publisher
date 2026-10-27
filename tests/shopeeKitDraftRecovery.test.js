import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recoverKitDraftForEditing,matchesStoredKitPhotos,validateStoredKitDraft} from '../shopeeKitDraftRecovery.js';
const stored=()=>({
 kitSku:'KIT-278CHOCALHO-310200',skus:['310200','278CHOCALHO'],
 kit:{kitSku:'KIT-278CHOCALHO-310200',components:[
  {sku:'310200',name:'Elefante Musical',imageUrl:'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/e.jpg'},
  {sku:'278CHOCALHO',name:'Chocalho',imageUrl:'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/c.jpg'}],
  quote:{grossPrice:160.74,targetMarginPct:15},packing:0,shipping:0},
 creative:{title:'Kit bebê',description:'Descrição preservada'}
});
test('recupera rascunho intacto mesmo após 24h, sem recalcular nem publicar',async()=>{
 const x=stored();
 const result=await recoverKitDraftForEditing(x,{shopId:852701218,
  readStock:async()=>({ready:false,reason:'Catálogo importado há mais de 24h.'}),
  compose:async()=>{throw Error('Composição não deve ocorrer com estoque vencido.');}});
 assert.equal(result.kit,x.kit);
 assert.equal(result.refreshedCosts,false);
 assert.equal(result.stockRevalidationRequired,true);
 assert.match(result.stockReason,/24h/);
});
test('estoque atual permite recomposição e preços novos',async()=>{
 const x=stored();
 const result=await recoverKitDraftForEditing(x,{shopId:7,
  readStock:async()=>({ready:true}),
  compose:async(_shop,skus,settings)=>({...x.kit,quote:{grossPrice:168,targetMarginPct:settings.marginPct},skus})});
 assert.equal(result.kit.quote.grossPrice,168);
 assert.equal(result.stockRevalidationRequired,false);
 assert.equal(result.refreshedCosts,true);
});
test('SKU removida ou indisponível mantém rascunho em revisão, sem afirmar estoque atual',async()=>{
 const result=await recoverKitDraftForEditing(stored(),{shopId:7,
  readStock:async()=>({ready:true}),
  compose:async()=>{throw Error('Kit bloqueado: SKU 310200 INDISPONÍVEL na WeDrop.');}});
 assert.equal(result.stockRevalidationRequired,true);
 assert.match(result.stockReason,/INDISPONÍVEL/);
});
test('erro operacional não é escondido como rascunho vencido',async()=>{
 await assert.rejects(()=>recoverKitDraftForEditing(stored(),{shopId:7,
  readStock:async()=>({ready:true}),
  compose:async()=>{throw Error('Falha no banco');}}),/Falha no banco/);
});
test('somente fotos dos componentes e na ordem do kit persistido',()=>{
 const x=stored();
 assert.equal(matchesStoredKitPhotos(x,['310200','278CHOCALHO']),true);
 assert.equal(matchesStoredKitPhotos(x,['278CHOCALHO','310200']),false);
 assert.equal(matchesStoredKitPhotos(x,['310200','OUTRA']),false);
 assert.equal(validateStoredKitDraft(x),x.kit);
 assert.throws(()=>validateStoredKitDraft({...x,kit:{...x.kit,kitSku:'KIT-OUTRO'}}),/incompleto/);
});
test('roteamento de edição revalida publicação e libera apenas textos e imagens do rascunho',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const publication=fs.readFileSync(new URL('../shopeeKitPublicationService.js',import.meta.url),'utf8');
 assert.match(server,/recoverKitDraftForEditing\(stored,/);
 assert.match(server,/stockRevalidationRequired:review.stockRevalidationRequired/);
 assert.match(server,/stockRevalidationRequired=true/);
 assert.match(server,/matchesStoredKitPhotos\(saved,skus\)/);
 assert.match(ui,/let kitActiveDraftSku=null,kitDraftOpenRevision=0,kitDraftNeedsRefresh=false/);
 assert.match(ui,/commercialBlocked=uncertain\|\|kitDraftNeedsRefresh/);
 assert.match(ui,/else if\(restoreCurrent&&!prepared&&result.drafts.length\)/);
 assert.match(ui,/kitSku:prepared.kit.kitSku/);
 assert.match(publication,/const kit=await composeKit\(/);
});
