import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
const mount=source.slice(source.indexOf('function kitWizardMountVideo(){'),
 source.indexOf('// Editor de ficha técnica Shopee:'));
const video=source.slice(source.indexOf("let kitVideoSku=''"),
 source.indexOf('async function selectKitVideo(file)'));

// Modelo mínimo do DOM: executar as funções reais, sem recriar seus handlers.
class Element{
 constructor(){this.children=[];this.hidden=false;this.dataset={};this.checked=false;}
 get firstChild(){return this.children[0]||null;}
 append(node){this.insertBefore(node,null);}
 insertBefore(node,before){
  if(node.parentElement){
   const children=node.parentElement.children;
   children.splice(children.indexOf(node),1);
  }
  const i=before?this.children.indexOf(before):this.children.length;
  this.children.splice(i,0,node);node.parentElement=this;
 }
 pause(){}
 load(){}
 removeAttribute(name){delete this[name];}
}
function harness(get){
 const ids=['kitVideoPanel','kitDetail','kitPublishPanel','kitVideoPreview',
  'kitVideoInclude','kitVideoDetails','kitVideoSendShopee','kitVideoDownload',
  'kitVideoRemove','kitVideoFile','kitVideoState','kitVideoFilename','kitVideoMeta','kitVideoStatus'];
 const nodes=new Map(ids.map(id=>['#'+id,new Element()]));
 const home=new Element();nodes.set('#kitPublishPanel .kit-formal-workspace',home);
 const editor=nodes.get('#kitDetail'),publisher=nodes.get('#kitPublishPanel'),panel=nodes.get('#kitVideoPanel');
 publisher.hidden=true;editor.append(publisher);publisher.append(home);home.append(panel);
 panel.append(nodes.get('#kitVideoPreview'));panel.append(nodes.get('#kitVideoInclude'));
 const queries=[],revoked=[];
 const context=vm.createContext({
  $:selector=>nodes.get(selector),kitWizardStage:3,
  prepared:{kit:{kitSku:'KIT-AAAA-BBBB',components:[{sku:'AAAA'},{sku:'BBBB'}]}},
  kitSaved:true,kitItemId:'',
  kitVideoStore:{get},
  api:async(path,{body})=>{queries.push({path,sku:body.kitSku});return {ready:true};},
  URL:{createObjectURL:blob=>'blob:'+blob.id,revokeObjectURL:url=>revoked.push(url)}
 });
 vm.runInContext(video+'\n'+mount,context);
 return {context,nodes,editor,publisher,panel,home,queries,revoked};
}
const record=name=>({blob:{id:name},name:name+'.mp4',size:2048,duration:15,width:1280,height:720});

test('Etapa 03 abre o painel original mesmo com a publicação oculta e preserva a prévia ao navegar',async()=>{
 let reads=0;
 const h=harness(async()=>{reads++;return record('banheiro');});
 await h.context.restoreKitVideo('KIT-AAAA-BBBB');
 const player=h.nodes.get('#kitVideoPreview'),include=h.nodes.get('#kitVideoInclude');
 include.checked=true;
 h.context.kitWizardMountVideo();
 assert.equal(h.panel.parentElement,h.editor,'painel deixa o ancestral oculto');
 assert.equal(h.publisher.hidden,true,'não abre publicação nem logística');
 assert.equal(h.nodes.get('#kitVideoDownload').disabled,false);
 assert.equal(player.src,'blob:banheiro');
 assert.equal(include.checked,true);
 for(const stage of [4,5,8,10,0,3,3]){
  h.context.kitWizardStage=stage;h.context.kitWizardMountVideo();
  assert.equal(h.panel.parentElement,stage===3?h.editor:h.home);
  assert.equal(player.src,'blob:banheiro');
  assert.equal(include.checked,true);
 }
 assert.equal(reads,1,'navegação não recria o vídeo nem apaga o estado');
 assert.equal(h.queries.length,1);
 assert.equal(h.queries[0].path,'/api/shopee/kits/video/status','somente consulta, sem envio');
 assert.equal(h.revoked.length,0);
});

test('vídeos continuam isolados por kit e respostas antigas não substituem a seleção atual',async()=>{
 let resolveA;
 const a=record('kit-a'),b=record('kit-b');
 const h=harness(sku=>sku==='KIT-AAAA-BBBB'?new Promise(resolve=>{resolveA=resolve;}):Promise.resolve(b));
 const loadingA=h.context.restoreKitVideo('KIT-AAAA-BBBB');
 h.context.prepared={kit:{kitSku:'KIT-CCCC-DDDD'}};
 await h.context.restoreKitVideo('KIT-CCCC-DDDD');
 resolveA(a);await loadingA;
 h.context.kitWizardMountVideo();
 assert.equal(h.nodes.get('#kitVideoPreview').src,'blob:kit-b');
 assert.equal(h.nodes.get('#kitVideoFilename').textContent,'kit-b.mp4');
 assert.deepEqual(h.queries.map(x=>x.sku),['KIT-CCCC-DDDD']);
 assert.equal(h.panel.parentElement,h.editor);
});

test('sem kit selecionado, a Etapa 03 não recupera nem expõe mídia de outro kit',()=>{
 const h=harness(()=>{throw Error('Não deve consultar sem kit');});
 h.context.prepared=null;
 h.context.kitWizardMountVideo();
 assert.equal(h.panel.parentElement,h.home);
 assert.equal(h.publisher.hidden,true);
 assert.equal(h.queries.length,0);
});
