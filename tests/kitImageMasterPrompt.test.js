import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitPrompts} from '../shopeeKitBuilder.js';
test('prompt mestre tem 9 posições independentes com dupla de SKUs visível e sem mosaico',()=>{
 const kit={kitSku:'KIT-278CHOCALHO-310200',components:[
  {sku:'310200',name:'Elefante Brincalhão Musical',imageUrl:'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/e.jpg'},
  {sku:'278CHOCALHO',name:'Torre e Bola Chocalho',dimensions:'20 x 30 cm'}
 ]};
 const prompts=kitPrompts(kit,{manualFacts:{'310200':'Medidas 18 × 20 × 15 cm. Peso 400 g.'}});
 assert.equal(prompts.length,9);
 for(const [i,p] of prompts.entries()){
  assert.match(p,/SKU 310200/);assert.match(p,/SKU 278CHOCALHO/);
  assert.match(p,/JUNTOS na MESMA CENA/);
  assert.match(p,/Nunca separar em duas fotos, quadros ou mosaico/);
  assert.match(p,/somente UMA IMAGEM FINAL/i);
  assert.match(p,/1200 × 1200/);
  assert.match(p,/18 × 20 × 15 cm/);
  assert.match(p,new RegExp('GERAR IMAGEM '+String(i+1).padStart(2,'0')+'\\/09'));
 }
 assert.match(prompts[0],/sem título, selos, preço, frase ou QUALQUER texto/);
 assert.match(prompts[2],/não somar ou transferir dimensões/i);
 assert.match(prompts[7],/até 3 perguntas e respostas/);
 assert.match(prompts[8],/Compra Segura/);
});
test('geração automática requer confirmação explícita e não publica',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.post('/api/shopee/kits/image'");
 const end=server.indexOf("app.get('/api/shopee/status'",start);
 const route=server.slice(start,end);
 assert.match(route,/confirmPaidApi!==true/);
 assert.match(route,/verifiedSameOrigin/);
 assert.match(route,/openAiApiKey/);
 assert.match(route,/composeKit/);
 assert.match(route,/generateKitImage/);
 assert.ok(!route.includes('kitPublishApproved')&&!route.includes('/discount/execute'));
});
