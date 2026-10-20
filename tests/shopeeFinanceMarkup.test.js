import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Cada aba deve ser filha direta de #app: a navegação aplica CSS
// #app > .tabpane.active. Uma section fechada cedo deixa a tela vazia.
test('Financeiro, WeDrop e Configurações continuam dentro de #app',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
 const stack=[],found=new Map();
 const pattern=/<(\/?)([A-Za-z][\w:-]*)([^>]*?)>/g;
 // A forma de fechamento não inclui espaço após a barra, portanto
 // usamos uma regex própria em vez de confiar em convenções CSS.
 const tokens=/<(\/?)([A-Za-z][\w:-]*)([^>]*?)>/g;
 for(const item of html.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*?)>/g)){
  const closing=item[1].includes('/'),tag=item[2].toLowerCase(),attrs=item[3];
  if(closing){
   assert.equal(stack.at(-1)?.tag,tag,'HTML mal fechado perto de '+item.index);
   stack.pop();continue;
  }
  if(voids.has(tag)||attrs.endsWith('/'))continue;
  const id=attrs.match(/\bid=["']([^"']+)["']/)?.[1]||'';
  if(['tab-wedrop','tab-finance','tab-settings'].includes(id)){
   assert.equal(stack.at(-1)?.id,'app',id+' saiu do container #app');
   assert.equal(stack.at(-1)?.tag,'section',id+' não é aba direta de #app');
   found.set(id,true);
  }
  stack.push({tag,id});
 }
 assert.deepEqual([...stack],[],'HTML ficou com elementos abertos');
 for(const id of ['tab-wedrop','tab-finance','tab-settings'])assert.ok(found.has(id),id+' ausente');
});
