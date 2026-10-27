import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/login-sidebar-premium.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/ui.js',import.meta.url),'utf8');
test('painel lateral fixo pode rolar e mostra seu rodapé por inteiro',()=>{
 assert.match(css,/\.sidebar\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/max-height:850px/);
 assert.match(css,/\.sidebar-footer\{margin-top:auto/);
 assert.match(css,/max-width:950px/);
 assert.match(css,/overflow:visible/);
});
test('login de duas colunas com logos da loja e plataformas e acessibilidade',()=>{
 assert.match(html,/class="login-shell"/);
 assert.match(html,/class="login-store-mark"/);
 assert.match(html,/class="login-platform login-platform-tiktok"/);
 assert.match(html,/class="login-platform login-platform-instagram"/);
 assert.match(html,/href="#i-tiktok"/);
 assert.match(html,/href="#i-instagram"/);
 assert.match(html,/id="loginTitle"/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.07fr\) minmax\(0,\.93fr\)/);
 assert.match(css,/max-width:520px/);
 assert.ok(html.indexOf('\/studio-depth.css?v=')<html.indexOf('\/login-sidebar-premium.css?v='));
});
test('autenticação e envio preservados com ids únicos',()=>{
 for(const id of ['loginScreen','loginPassword','loginBtn','app','settingsBtn','wedropSearchBtn','publishBtn']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(app,/\$\('#loginBtn'\)\.onclick=async/);
 assert.match(app,/\/api\/login/);
 assert.match(ui,/byId\('loginPassword'\)\.addEventListener\('keydown'/);
});
