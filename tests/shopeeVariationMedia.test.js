import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 validateVariationName,variationImagePrompt,validateVariationDetails,buildVariationPayload
} from '../shopeeVariationMedia.js';

const asset={storagePath:'123/456/0/variations/fe30c932-1122-44ab-88dd-aabb99887766.png',
 mime:'image/png',sha256:'a'.repeat(64)};
const details={type:'Cor',options:[{
 name:'Rosa',price:745.99,stock:1,sku:'SUPER-CAR-ROSA',noGtin:true,gtin:'',
 stockConfirmed:true,photoConfirmed:true,asset
}]};
test('publicação usa estoque 1 e o image_id correto por opção',()=>{
 const checked=validateVariationDetails(details,{requirePhotos:true});
 const payload=buildVariationPayload('58221125342',checked,['image-rose-123']);
 assert.equal(payload.model[0].seller_stock[0].stock,1);
 assert.equal(payload.model[0].original_price,745.99);
 assert.equal(payload.model[0].model_sku,'SUPER-CAR-ROSA');
 assert.equal(payload.tier_variation[0].option_list[0].image.image_id,'image-rose-123');
 assert.equal(payload.standardise_tier_variation[0].variation_id,0);
 assert.equal(payload.standardise_tier_variation[0].variation_option_list[0].variation_option_name,'Rosa');
 assert.ok(!('gtin_code' in payload.model[0]));
});
test('confirmação física e foto são indispensáveis antes de aplicar',()=>{
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],stockConfirmed:false}]},{requirePhotos:true}),/Confirme/);
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],photoConfirmed:false}]},{requirePhotos:true}),/Confirme/);
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],asset:null}]},{requirePhotos:true}),/Foto pendente/);
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],stock:0}]},{requirePhotos:true}),/pelo menos 1/);
});
test('rejeita GTIN inválido, duplicatas e SKUs iguais',()=>{
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],noGtin:false,gtin:'abc'}]}),/GTIN/);
 assert.throws(()=>validateVariationDetails({...details,options:[details.options[0],{...details.options[0],name:'rosa'}]}),/repetidas/);
 assert.throws(()=>validateVariationDetails({...details,options:[details.options[0],{...details.options[0],name:'Azul'}]}),/SKU diferente/);
});
test('prompt preserva geometria e solicita apenas a característica da opção',()=>{
 const p=variationImagePrompt({title:'Moto Elétrica Infantil 6V Vintage'},'Cor','Rosa');
 assert.match(p,/1200x1200/);
 assert.match(p,/Cor = Rosa/);
 assert.match(p,/SOMENTE a característica/);
 assert.match(p,/geometria/);
});
test('interface contém upload, geração, prévia e confirmação de estoque',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/optimizer-variations.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/optimizer-variations\.js\?v=[\d.]+/);
 assert.match(js,/Gerar foto IA/);
 assert.match(js,/Incluir foto/);
 assert.match(js,/Estoque \(mínimo 1\)/);
 assert.match(js,/Confirmei pelo fornecedor/);
 assert.match(js,/\/api\/shopee\/optimizer\/variants\/apply/);
 assert.match(app,/RedeVariants\?\.load/);
});

test('novo anúncio exige opção original e nova opção no preview; não apaga a cor Vermelha',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/Para criar variações sem apagar a opção original/);
 assert.match(server,/Informe a opção original e a nova variação/);
});
