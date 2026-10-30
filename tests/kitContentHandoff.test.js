import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {requestKitContent,kitContentResponseText} from '../public/kit-content-handoff.js';
import {kitContentBrief} from '../shopeeKitBuilder.js';

const kit={kitSku:'KIT-FORMA-TRC0031-TRC8361',components:[
 {sku:'FORMA',name:'Forma para cupcake 12 cavidades'},
 {sku:'TRC0031',name:'Copo dispenser de massas'},
 {sku:'TRC8361',name:'Tigela inox bowl 20cm'}
]};
const prompt=kitContentBrief(kit,{manualFacts:{TRC8361:'Diâmetro 20 cm'}}).prompt;
const title=s=>[...s+' para preparar receitas e organizar a cozinha com praticidade no dia a dia'].slice(0,115).join('');
const answer=[
 'TÍTULO 1: '+title('🧁 Kit Forma Cupcake 12 Cavidades Dispenser de Massas e Tigela Inox Bowl 20cm ✨'),
 'TÍTULO 2: '+title('🍰 Conjunto Forma de Cupcake Copo Dosador de Massas e Tigela Inox 20cm Kit Cozinha ✨'),
 'TÍTULO 3: '+title('🥣 Kit Confeitaria Tigela Inox 20cm Dispenser de Massas e Forma Cupcake 12 Cavidades 🧁'),
 'DESCRIÇÃO:',
 '✨ Prepare receitas com os três produtos do kit.',
 '✅ BENEFÍCIOS','Forma com 12 cavidades e dispenser para organizar o preparo.',
 '💡 POR QUE COMPRAR','Três utensílios complementares para sua cozinha.',
 '⚙️ CARACTERÍSTICAS','SKU FORMA: 12 cavidades. SKU TRC0031: dispenser. SKU TRC8361: tigela inox de 20 cm.',
 '📦 O QUE VAI NA EMBALAGEM','Uma unidade de cada SKU.',
 '🛒 Confira os componentes e escolha seu kit.'
].join('\n');

function bridge(){
 const listeners=new Set(),messages=[];
 const target={location:{origin:'https://redeachados-shopee.onrender.com'},
  addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},
  removeEventListener:(type,fn)=>listeners.delete(fn),
  postMessage:(data,origin)=>messages.push({data,origin})};
 const emit=(data,extra={})=>{
  for(const fn of [...listeners])fn({source:target,origin:target.location.origin,data,...extra});
 };
 const ready=()=>{
  emit({kind:'RA_EXTENSION_READY',version:'1.0.61',healthy:true});
  return messages.find(m=>m.data.kind==='RA_SITE_DESC_START')?.data.payload;
 };
 const result=(id,rawText=JSON.stringify({description:answer,factsUsed:[],unverified:[]}))=>
  emit({kind:'RA_EXTENSION_DESC_RESULT',...id,ok:true,rawText});
 return {target,emit,ready,result,messages,listeners};
}

test('envia uma única vez a orientação completa de todas as SKUs à Ponte instalada',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const b=bridge(),progress=[];
 const pending=requestKitContent({kitSku:kit.kitSku,prompt},{target:b.target,onProgress:s=>progress.push(s)});
 const id=b.ready();b.ready();
 assert.equal(b.messages.filter(m=>m.data.kind==='RA_SITE_DESC_START').length,1);
 assert.equal(id.prompt,prompt);
 assert.equal(id.sku,kit.kitSku);
 assert.equal(id.itemId,'0');assert.equal(id.modelId,'0');
 for(const part of kit.components)assert.ok(id.prompt.includes('SKU '+part.sku));
 b.emit({kind:'RA_EXTENSION_DESC_START_RESULT',nonce:id.nonce,ok:true});
 t.mock.timers.tick(90000); // Regressão: o código anterior expirava aos 45 s.
 b.emit({kind:'RA_EXTENSION_DESC_PROGRESS',...id,status:'Descrição enviada. Aguardando parágrafos...'});
 b.result(id);
 const response=await pending;
 assert.equal(response.rawText,answer);
 assert.equal(response.kitSku,kit.kitSku);
 assert.ok(progress.includes('Comando enviado ao ChatGPT · gerando os três títulos e a descrição'));
 assert.equal(b.listeners.size,0);
 assert.equal(b.messages.at(-1).data.kind,'RA_SITE_DESC_ACK');
 assert.equal(b.messages.at(-1).data.ok,false,'mantém a conversa aberta para revisão e importação azul');
});

test('desempacota o formato real da Ponte v1.0.61 e conserva emojis e quebras',()=>{
 assert.equal(kitContentResponseText(JSON.stringify({description:answer,factsUsed:[],unverified:[]})),answer);
 assert.equal(kitContentResponseText(answer),answer);
});

test('ignora mensagens de outra origem, kit, nonce ou variação',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const b=bridge();
 const pending=requestKitContent({kitSku:kit.kitSku,prompt},{target:b.target});
 const id=b.ready();
 b.emit({kind:'RA_EXTENSION_DESC_START_RESULT',nonce:id.nonce,ok:true});
 const message={kind:'RA_EXTENSION_DESC_RESULT',...id,ok:true,rawText:answer};
 b.emit(message,{origin:'https://example.com'});
 b.emit(message,{source:{}});
 for(const wrong of [{sku:'KIT-OUTRO-KIT'},{modelId:'7'},{itemId:'123'},{nonce:'outro'}])
  b.emit({...message,...wrong});
 assert.equal(b.listeners.size,1);
 assert.equal(b.messages.filter(m=>m.data.kind==='RA_SITE_DESC_ACK').length,0);
 b.result(id);assert.equal((await pending).rawText,answer);
});

test('exibe recusa da Ponte sem abrir aba alternativa e remove o listener',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const b=bridge();
 const pending=requestKitContent({kitSku:kit.kitSku,prompt},{target:b.target});
 const id=b.ready();
 b.emit({kind:'RA_EXTENSION_DESC_START_RESULT',nonce:id.nonce,ok:false,error:'ChatGPT indisponível'});
 await assert.rejects(pending,/ChatGPT indisponível/);
 assert.equal(b.listeners.size,0);
});

test('sem extensão responde em oito segundos; com ACK permite seis minutos',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let b=bridge();
 let pending=requestKitContent({kitSku:kit.kitSku,prompt},{target:b.target});
 t.mock.timers.tick(8000);await assert.rejects(pending,/Ponte não respondeu/);
 assert.equal(b.listeners.size,0);
 b=bridge();pending=requestKitContent({kitSku:kit.kitSku,prompt},{target:b.target});
 const id=b.ready();b.emit({kind:'RA_EXTENSION_DESC_START_RESULT',nonce:id.nonce,ok:true});
 t.mock.timers.tick(359999);assert.equal(b.listeners.size,1);
 t.mock.timers.tick(1);await assert.rejects(pending,/geração ainda não foi concluída/);
 assert.equal(b.listeners.size,0);
});

test('troca de kit cancela captura e resposta incompleta não vira sucesso',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let b=bridge();const controller=new AbortController();
 let pending=requestKitContent({kitSku:kit.kitSku,prompt},{target:b.target,signal:controller.signal});
 b.ready();controller.abort();await assert.rejects(pending,/kit foi trocado/);
 assert.equal(b.listeners.size,0);
 b=bridge();pending=requestKitContent({kitSku:kit.kitSku,prompt},{target:b.target});
 const id=b.ready();b.result(id,'DESCRIÇÃO: Somente um texto, sem os três títulos.');
 await assert.rejects(pending,/TÍTULO 1/);
 assert.equal(b.listeners.size,0);
});

test('anúncio recebido só altera os campos depois do clique no botão azul',async()=>{
 const source=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const handoff=source.slice(source.indexOf('async function kitContentHandoff('),source.indexOf('function kitContentReadManual('));
 const importer=source.slice(source.indexOf('async function kitImportCopiedContent('),source.indexOf('function kitPasteSeoReply('));
 const fields=new Map([['#kitTitle',{value:'Título salvo'}],['#kitDescription',{value:'Descrição salva'}]]);
 const get=s=>{if(!fields.has(s))fields.set(s,{value:'',disabled:false});return fields.get(s);};
 let imports=0,fetches=0;
 const context=vm.createContext({AbortController,prepared:{kit},$:get,
  kitContentRequest:null,kitContentReadyResult:null,kitContentAwaitingResponse:false,
  requestKitContent:async()=>({kitSku:kit.kitSku,rawText:answer}),
  kitImportState:()=>{},kitContentFeedback:()=>{},parseKitSeoResponse:()=>{},
  kitFetchGeneratedTextFromPonte:async()=>{fetches++;throw Error('Não deveria precisar reler a aba.');},
  importPlusText:()=>{imports++;get('#kitTitle').value='Título importado';return true;}
 });
 vm.runInContext(handoff+'\n'+importer,context);
 await context.kitContentHandoff(prompt);
 assert.equal(imports,0);assert.equal(get('#kitTitle').value,'Título salvo');
 assert.equal(get('#kitDescription').value,'Descrição salva');
 await context.kitImportCopiedContent();
 assert.equal(imports,1);assert.equal(fetches,0);
 assert.equal(get('#kitPlusTextResult').value,answer);
 assert.equal(get('#kitImportCopiedText').disabled,false);
});
