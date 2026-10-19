import test from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_STORYBOARD,imageGenerationStatus,validateImageSourceUrl,imagePrompt,generateOpenAiImage} from '../shopeeOpenAiImages.js';

const sample={sku:'SKU-TESTE',title:'Chaleira de aço inox',attributeAudit:{attributes:[
 {state:'filled',name:'Material',values:[{name:'Aço inox',unit:''}]},
 {state:'missing',name:'Potência',values:[]}
]}};

test('roteiro de nove imagens na ordem aprovada pela loja',()=>{
 assert.equal(IMAGE_STORYBOARD.length,9);
 assert.match(IMAGE_STORYBOARD[0],/Capa/);
 assert.match(IMAGE_STORYBOARD[8],/Mockup/);
 assert.throws(()=>imagePrompt({record:sample,slot:0}),/Posição inválida/);
 assert.throws(()=>imagePrompt({record:sample,slot:10}),/Posição inválida/);
 const prompt=imagePrompt({record:sample,slot:3,masterPrompt:'Fundo moderno',note:'Luz natural'});
 assert.match(prompt,/1200 x 1200/);
 assert.match(prompt,/Aço inox/);
 assert.match(prompt,/Fundo moderno/);
 assert.match(prompt,/Luz natural/);
 assert.match(prompt,/não invente|Não invente/);
});

test('validação bloqueia URLs externas, HTTP e redirecionamentos inseguros',()=>{
 assert.equal(validateImageSourceUrl('https://down-br.img.susercontent.com/file/example'),'https://down-br.img.susercontent.com/file/example');
 assert.throws(()=>validateImageSourceUrl('http://down-br.img.susercontent.com/file/x'),/fora dos domínios/);
 assert.throws(()=>validateImageSourceUrl('https://susercontent.com.evil.test/x'),/fora dos domínios/);
 assert.throws(()=>validateImageSourceUrl('https://127.0.0.1/file'),/fora dos domínios/);
 assert.throws(()=>validateImageSourceUrl('https://x:password@down-br.img.susercontent.com/file/x'),/fora dos domínios/);
});

test('sem chave OpenAI informa configuração sem gerar',async()=>{
 const old=process.env.OPENAI_API_KEY;
 delete process.env.OPENAI_API_KEY;
 try{
  assert.equal(imageGenerationStatus().configured,false);
  await assert.rejects(()=>generateOpenAiImage({record:sample,slot:1,referenceUrls:[]}),/OPENAI_API_KEY/);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('edição OpenAI recebe foto original e retorna imagem 1200x1200 pronta para armazenamento',async()=>{
 const prevFetch=globalThis.fetch;
 const oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.OPENAI_IMAGE_MODEL;
 const orig=Buffer.alloc(32);orig[0]=255;orig[1]=216;
 const png=Buffer.alloc(400);
 Buffer.from([137,80,78,71,13,10,26,10]).copy(png,0);
 png.writeUInt32BE(1200,16);png.writeUInt32BE(1200,20);
 let seen=0;
 try{
  process.env.OPENAI_API_KEY='unit-test-key-do-not-send';
  process.env.OPENAI_IMAGE_MODEL='gpt-image-2';
  globalThis.fetch=async(url,options)=>{
   seen++;
   if(String(url).startsWith('https://down-br.img.susercontent.com/')){
    assert.equal(options.redirect,'manual');
    return new Response(orig,{status:200,headers:{'Content-Type':'image/jpeg'}});
   }
   assert.equal(url,'https://api.openai.com/v1/images/edits');
   assert.equal(options.method,'POST');
   assert.equal(options.headers.Authorization,'Bearer unit-test-key-do-not-send');
   assert.equal(options.body.get('size'),'1200x1200');
   assert.equal(options.body.get('model'),'gpt-image-2');
   assert.equal(options.body.getAll('image[]').length,1);
   assert.match(options.body.get('prompt'),/Fundo elegante/);
   return Response.json({data:[{b64_json:png.toString('base64')}]});
  };
  const result=await generateOpenAiImage({record:sample,slot:1,referenceUrls:['https://down-br.img.susercontent.com/file/test'],masterPrompt:'Fundo elegante'});
  assert.equal(result.mime,'image/png');
  assert.equal(result.file.readUInt32BE(16),1200);
  assert.equal(result.file.readUInt32BE(20),1200);
  assert.equal(seen,2);
 }finally{
  globalThis.fetch=prevFetch;
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  if(oldModel===undefined)delete process.env.OPENAI_IMAGE_MODEL;else process.env.OPENAI_IMAGE_MODEL=oldModel;
 }
});
