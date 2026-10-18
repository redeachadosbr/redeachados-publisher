import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const page=html.slice(html.indexOf('id="tab-discounts"'),html.indexOf('id="tab-products"'));

test('Descontos v1.19.6 preserva os planos reais e os seis KPIs da referência',()=>{
 for(const id of ['discountSavedBadge','discountSavedBadgeLabel','discountPlanCard','discountSku',
  'discountPlanDate','discountGross','discountPct','discountFinal','discountMargin',
  'discountProfit','discountSupplierCost','discountPlanStatus','discountPlanNotice',
  'discountReviewStatus','discountNoPlan','discountCopy','discountEdit',
  'discountOpenPromotion','discountRecentPlans','discountRefresh','discountRefreshLabel']){
   assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.equal((page.match(/class="discount-v2-kpi discount-v2-kpi-/g)||[]).length,6);
 for(const name of ['campaign','price','tax','ready'])
  assert.match(page,new RegExp('data-discount-review="'+name+'" disabled'));
 assert.match(page,/id="discountPlanCard"[^>]*hidden/);
 assert.match(page,/class="discount-v2-recent"/);
 assert.match(page,/id="discountRecentPlans"/);
 assert.match(html,/app\.js\?v=1\.19\.6/);
});
test('campos de conferência são manuais, não declaram confirmação Shopee automática',()=>{
 assert.match(app,/const discountReviewLabels=/);
 assert.match(app,/input.checked=false;input.disabled=!shDiscountQuote/);
 assert.match(app,/if\(!shDiscountQuote\)\{input.checked=false;return;\}/);
 assert.match(app,/all\?'Plano conferido manualmente · não aplicado'/);
 assert.match(app,/Number\(q.netMarginPct\)\+0.0001<Number\(q.minMarginPct\)/);
 assert.match(app,/data\?\.saved!==true/);
 assert.match(app,/shPriceSelection=\{sku:row.sku,itemId:String\(row.itemId\),modelId:String\(row.modelId\)\}/);
 assert.match(app,/json\('\/api\/shopee\/optimizer\/pricing\/prepare'/);
 assert.match(app,/json\('\/api\/shopee\/optimizer\/pricing\/recent'/);
 assert.match(app,/navigator.clipboard.writeText\(report\)/);
 assert.match(app,/setTab\('optimizer'\)/);
 assert.match(app,/https:\/\/seller\.shopee\.com\.br\//);
 assert.doesNotMatch(app,/\/api\/v2\/discount\/add_discount/);
});
test('render do plano mostra valores da cotação e só ativa os checkboxes desmarcados',()=>{
 const a=app.indexOf('function shDiscountResetReview(){');
 const b=app.indexOf('for(const input of document.querySelectorAll',a);
 const c=app.indexOf('function shDiscountRender(q){',b);
 const e=app.indexOf('function shDiscountStatus(',c);
 assert.ok(a>0&&b>a&&c>b&&e>c);
 const nodes=new Map(),checkboxes=['campaign','price','tax','ready'].map(dataset=>({
   dataset:{discountReview:dataset},checked:true,disabled:true
 }));
 const $=key=>{
   if(!nodes.has(key))nodes.set(key,{textContent:'',hidden:true,dataset:{}});
   return nodes.get(key);
 };
 const script='let shDiscountQuote=null;\n'+app.slice(a,b)+app.slice(c,e)+
   '\nthis.render=shDiscountRender;this.reset=shDiscountResetReview;';
 const scope={$,
   document:{querySelectorAll:()=>checkboxes},
   shPriceMoney:value=>'R$ '+Number(value).toFixed(2),
   shPricePercent:value=>Number(value).toFixed(1)+'%',
   fmtDate:value=>String(value)
 };
 runInNewContext(script,scope);
 const q={sku:'TRC1525',modelId:'0',grossPrice:236.72,unitCost:99.99,
    discountPct:20,customerPrice:187.49,netMarginPct:15,minMarginPct:5,netProfit:28.13,
    calculatedAt:'2026-10-18T23:00:00.000Z'};
 scope.render(q);
 assert.equal($('#discountSku').textContent,'SKU TRC1525');
 assert.equal($('#discountGross').textContent,'R$ 236.72');
 assert.equal($('#discountProfit').textContent,'R$ 28.13');
 assert.equal($('#discountSupplierCost').textContent,'R$ 99.99');
 assert.equal($('#discountPlanCard').hidden,false);
 assert.ok(checkboxes.every(x=>!x.checked&&!x.disabled));
 assert.equal($('#discountSavedBadgeLabel').textContent,'Plano salvo · revisão obrigatória');
 assert.throws(()=>scope.render({...q,netMarginPct:3}),/não possui preço, custo ou margem mínima válida/);
});
test('layout usa cards compactos e lista responsiva no mesmo menu do aplicativo',()=>{
 assert.match(css,/body\.view-discounts \.workspace-content/);
 assert.match(css,/#tab-discounts \.discount-v2-kpis\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/#tab-discounts \.discount-v2-detail-grid\{display:grid;grid-template-columns:1fr 1fr/);
 assert.match(css,/#tab-discounts \.discount-v2-recent-plan\{display:grid/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(app,/classList\?\.toggle\?\.\('view-discounts',name==='discounts'\)/);
});
