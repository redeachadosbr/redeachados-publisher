import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('ponte de nove imagens informa slot, limita rede e libera o estado ocupado',()=>{
 const src=read('public/kit-existing-optimization.js');
 assert.match(src,/async function transferImages\(\{automatic=false,optional=false,onProgress=null\}=\{\}\)/);
 assert.match(src,/Localizando as nove fotos salvas do kit/);
 assert.match(src,/Imagem '\+slot\+'\/9 confirmada no armazenamento privado/);
 assert.match(src,/AbortSignal\.timeout\(65000\)/);
 assert.match(src,/kitImageBridgeBounded\(kitPhotoStore\.list\(current\),20000/);
 assert.match(src,/finally\{busy=false;paint\(\);\}/);
 assert.match(src,/RAKitTransferImagesToWorkflow=options=>transferImages/);
});
test('etapa 10 recebe progresso, captura falha, restaura botao e nao conclui sem imagem',()=>{
 const src=read('public/kit-builder.js');
 assert.match(src,/RAKitTransferImagesToWorkflow\?\.\(\{\s*onProgress:message=>/);
 assert.match(src,/if\(copied===true\)kitWizardImagesSyncedFor=identity/);
 assert.match(src,/if\(notes\.length\)\{/);
 assert.match(src,/\}catch\(error\)\{\s*const message='Execução interrompida:/);
 assert.match(src,/kitWizardExecutionOpening=false;kitWizardExecutionIntent=false/);
 assert.match(src,/if\(button\)button\.disabled=false/);
});
test('servidor confere a identidade sem baixar nove árvores de atributos',()=>{
 const src=read('server.js');
 const a=src.indexOf("app.post('/api/shopee/kits/optimization/image'");
 const b=src.indexOf('// Stage reviews are internal Shopee records.',a);
 const route=src.slice(a,b);
 assert.ok(a>=0&&b>a);
 assert.match(route,/const live=await shopeeLiveEditableItem\(cfg,auth,link\.itemId\)/);
 assert.doesNotMatch(route,/await\\s+auditShopeeItem\\(/);
 assert.doesNotMatch(route,/path:\\s*['\"]\\/api\\/v2\\/product\\/get_attribute_tree/);
 assert.match(route,/if\(selected\.length!==1\)throw Error/);
});
