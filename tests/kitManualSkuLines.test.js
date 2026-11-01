import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseManualKitSkuBlock,parseKitChatResult} from '../public/kit-chat-result-parser.js';

test('tres SKUs em linhas individuais viram UM kit na ordem digitada',()=>{
 const text='1.26051.01.1000\n1.26088.80.0001\nTRC0663';
 assert.deepEqual(parseManualKitSkuBlock(text),{
  kits:[['1.26051.01.1000','1.26088.80.0001','TRC0663']],
  size:3,sourceCount:1,rejected:0,format:'manual'
 });
 // Falha antiga: a leitura por linha ignorava cada SKU isolada.
 assert.deepEqual(parseKitChatResult(text,{
  allowedCodes:['1.26051.01.1000','1.26088.80.0001','TRC0663'],size:3
 }).kits,[]);
});

test('duas SKUs por linha e quebra Windows; nao filtra uma SKU sem catalogo',()=>{
 const parsed=parseManualKitSkuBlock('\uFEFF trc6808 \r\n KTE022BCF \r\n');
 assert.deepEqual(parsed.kits,[['TRC6808','KTE022BCF']]);
 assert.equal(parsed.size,2);
 assert.deepEqual(parseManualKitSkuBlock('TRC6808\nSKU_NOVA\nKTE022BCF').kits,
  [['TRC6808','SKU_NOVA','KTE022BCF']]);
});

test('listas malformadas nao sao tratadas como kit; repetidas sao bloqueadas',()=>{
 assert.equal(parseManualKitSkuBlock('TRC6808'),null);
 assert.equal(parseManualKitSkuBlock('TRC6808\nKTE022BCF\nTRC0663\nTRC6809'),null);
 assert.equal(parseManualKitSkuBlock('1. Kit Banheiro\nTRC6808\nKTE022BCF'),null);
 assert.throws(()=>parseManualKitSkuBlock('trc6808\nTRC6808'),/repetidas/);
});

test('botao manual ignora filtro de categoria e deixa o servidor validar disponibilidade',()=>{
 const builder=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const from=builder.indexOf('async function importPlusSuggestions(');
 const until=builder.indexOf('async function kitChatTryAutoClipboard()',from);
 const body=builder.slice(from,until);
 assert.match(body,/parseManualKitSkuBlock\(response\)/);
 assert.match(body,/manualBlock\|\|fileParsed\?selectedContext:await kitChatEnsureFreshResearch\(\)/);
 assert.match(body,/manualBlock\?\.size\|\|fileParsed\?\.size\|\|context\.size/);
 assert.match(body,/if\(!fileParsed&&!manualBlock\)kitCaptureResearchJson/);
 assert.match(body,/\.\.\.\(manualBlock\?\{idea:''\}:\{\}\),kits:rows/);
 assert.match(body,/await api\('\/api\/shopee\/kits\/plus-import'/);
});
