import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKitChatResult} from '../public/kit-chat-result-parser.js';

const whitelist=['DTY1126','DTY1127','BAS25021','FUT25020','GOL25022','050','1509','CO0961295','1259','70005','303448','A203925','285BR','221-JXP','977395','1665','MD5093','309709','10619','MD5284','3539','310200','278CHOCALHO'];

test('importação total do arquivo JSON do ChatGPT com produtos e combinação de 2 e 3 SKUs',()=>{
 const json={kits:[
  {nome:'Mini Parque de Diversões',skus_we_drop:['DTY1126','DTY1127'],custo_total:18.98},
  {nome:'Mini Esportes de Mesa',produtos:[{sku:'BAS25021',custo:12.99},{sku:'FUT25020'},{sku:'GOL25022'}]},
  {nome:'Massinha Criativa',componentes:[{sku_wedrop:'050'},{sku_wedrop:'1509'},{sku_wedrop:'CO0961295'}]},
  {nome:'Oficina do Dinossauro',itens:[{supplier_sku:'1259'},{supplier_sku:'70005'}]},
  {nome:'Mundo dos Dinossauros',skus:'303448 + A203925'},
  {nome:'Cozinha de Faz de Conta',sku1:'285BR',sku2:'221-JXP'}
 ]};
 const result=parseKitChatResult(JSON.stringify(json),{allowedCodes:whitelist,limit:10});
 assert.equal(result.format,'json');
 assert.equal(result.kits.length,6);
 assert.deepEqual(result.kits[0],['DTY1126','DTY1127']);
 assert.deepEqual(result.kits[1],['BAS25021','FUT25020','GOL25022']);
 assert.deepEqual(result.kits[2],['050','1509','CO0961295']);
 assert.deepEqual(result.kits[5],['285BR','221-JXP']);
});

test('tabela de texto integral com + e custos não exige copiar SKU por SKU',()=>{
 const text=['| Kit | SKUs WeDrop | Custo total | Preço base |',
  '|---|---|---|---|',
  '| 1. Mini Parque de Diversões | DTY1126 + DTY1127 | R$ 18,98 | R$ 56,94 |',
  '| 2. Mini Esportes | BAS25021 + FUT25020 + GOL25022 | R$ 42,97 | R$ 128,91 |',
  '| 3. Massinha | 050 + 1509 + CO0961295 | R$ 63,97 | R$ 191,91 |',
  '4. Oficina do Dinossauro: 1259 + 70005'].join('\n');
 const result=parseKitChatResult(text,{allowedCodes:whitelist,limit:10});
 assert.equal(result.format,'text');
 assert.equal(result.kits.length,4);
 assert.deepEqual(result.kits[2],['050','1509','CO0961295']);
});
test('não aceita SKU inventada, mesma SKU repetida ou duplicação de kit',()=>{
 const result=parseKitChatResult({kits:[
  {skus:['DTY1126','INVENTADO']},
  {skus:['DTY1126','DTY1126']},
  {skus:['DTY1126','DTY1127']},
  {skus:['DTY1127','DTY1126']}
 ]},{allowedCodes:whitelist,limit:10});
 assert.deepEqual(result.kits,[['DTY1126','DTY1127']]);
 assert.ok(result.rejected>=2);
});
test('mensagem completa delimitada em bloco JSON',()=>{
 const full='Veja o arquivo:\n'+String.fromCharCode(96).repeat(3)+'json\n'+
   '{"kits":[{"skus":["MD5284","3539"]}]}\n'+String.fromCharCode(96).repeat(3);
 assert.deepEqual(parseKitChatResult(full,{allowedCodes:whitelist}).kits,[['MD5284','3539']]);
});
test('limite de 15 e ausência de whitelist protegem o catálogo',()=>{
 const txt='DTY1126 + DTY1127\nBAS25021 + FUT25020 + GOL25022';
 assert.equal(parseKitChatResult(txt,{allowedCodes:whitelist,limit:1}).kits.length,1);
 assert.throws(()=>parseKitChatResult(txt,{allowedCodes:[]}),/WeDrop/);
});

test('JSON com SKU desconhecida não descarta silenciosamente componente e não cria kit truncado',()=>{
 const result=parseKitChatResult({kits:[
  {itens:[{sku:'DTY1126'},{sku:'SKU_DESCONHECIDA'},{sku:'DTY1127'}]},
  {itens:[{sku:'050'},{sku:'1509'},{sku:'CO0961295'}]}
 ]},{allowedCodes:whitelist,limit:10});
 assert.deepEqual(result.kits,[['050','1509','CO0961295']]);
 assert.equal(result.rejected,1);
});
test('campo de arquivo mantém nome e mostra feedback visível mesmo com importação automática concorrente',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="kitPlusFileStatus"[\s\S]{0,150}role="status"/);
 assert.match(app,/kitChatQueuedManualImport=\{uploadedText,silent:false\}/);
 assert.match(app,/if\(queued\)void importPlusSuggestions\(queued\)/);
 assert.match(app,/kitChatFilePickerOpen\|\|kitChatManualImportActive\|\|kitChatQueuedManualImport/);
 assert.match(app,/event\.currentTarget\.value=''/);
 assert.doesNotMatch(app,/event\.target\.value='';[\s\S]{0,12}\}\);\nconst drop=/);
});
test('JSON com nomes de produtos e preços é aceito somente com SKU WeDrop da whitelist',()=>{
 const rows={kits:[
  {nome:'Kit mini parque',componentes:[{sku:'DTY1126',preco:999},{sku:'DTY1127',custo:1}]},
  {nome:'Kit falsificado',componentes:[{sku:'DTY1126'}, {sku:'SKU_INVENTADO'}]}
 ]};
 const result=parseKitChatResult(JSON.stringify(rows),{allowedCodes:whitelist,limit:10});
 assert.deepEqual(result.kits,[['DTY1126','DTY1127']]);
 assert.equal(result.rejected,1);
});

test('até 20 kits com quantidade exata e zeros iniciais; não consome limite com kit de tamanho errado',()=>{
 const allowed=['050',...Array.from({length:42},(_,i)=>'W'+String(i).padStart(3,'0'))];
 const entries=[['W000','W001','W002'],
  ...Array.from({length:20},(_,i)=>[i===0?'050':'W'+String(i+2).padStart(3,'0'),
    'W'+String(i+22).padStart(3,'0')])];
 const parsed=parseKitChatResult({kits:entries},{allowedCodes:allowed,limit:20,size:2});
 assert.equal(parsed.kits.length,20);
 assert.equal(parsed.kits[0][0],'050');
 assert.equal(parsed.rejected,1);
 assert.ok(parsed.kits.every(k=>k.length===2));
 assert.throws(()=>parseKitChatResult({kits:entries},{allowedCodes:allowed,limit:21}),/Limite inválido/);
});

test('arquivo escolhido tem prioridade sobre importação automática da área de transferência',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(app,/kitChatManualImportActive=true;[\s\S]*?const data=await file\.text\(\);/);
 assert.match(app,/finally\{\s*kitChatManualImportActive=false;/);
 assert.match(app,/if\(readClipboard&&\(kitChatFilePickerOpen\|\|kitChatManualImportActive\|\|kitChatQueuedManualImport\)\)/);
 assert.match(app,/permission\.state!=='granted'\|\|kitChatFilePickerOpen\|\|kitChatManualImportActive/);
 assert.match(app,/const source=uploadedText!==null\?'arquivo':readClipboard\?'área de transferência':'campo de texto'/);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/kit-builder\.js\?v=3\.9\.19-kit-import-file-priority/);
});

test('importação TXT de três SKUs nunca reduz kit quando um código não existe na whitelist',()=>{
 const txt='TRC0359 + TRC0413 + TRC0895\nTRC6938 + TRC0413 + TRC0895';
 const result=parseKitChatResult(txt,{allowedCodes:['TRC0359','TRC6938','TRC0895'],size:3,limit:20});
 assert.deepEqual(result.kits,[]);
 assert.equal(result.rejected,2);
});
test('importação TXT preserva três SKUs quando os três constam no catálogo',()=>{
 const txt='TRC0359 + TRC0413 + TRC0895';
 const result=parseKitChatResult(txt,{allowedCodes:['TRC0359','TRC0413','TRC0895'],size:3,limit:20});
 assert.deepEqual(result.kits,[['TRC0359','TRC0413','TRC0895']]);
});
