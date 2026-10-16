import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseShopeeSignature} from '../shopee.js';

const config={
  mode:'live',
  host:'https://partner.shopeemobile.com',
  partnerId:2047694,partnerKey:'shpkchave-simulada-para-teste',
  redirectUri:'https://redeachados-shopee.onrender.com/auth/shopee/callback',
  configured:true
};

test('distingue assinatura completa rejeitada e alternativa sem shpk aceita',async()=>{
  const urls=[];
  const res=await diagnoseShopeeSignature(config,{
    httpFetch:async(url,opt)=>{
      urls.push(String(url));
      assert.equal(opt.redirect,'manual');
      assert.equal(opt.method,'GET');
      if(urls.length===1){
        return new Response(JSON.stringify({error:'error_sign',message:'Wrong sign.',request_id:'req-123'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      return new Response('',{status:302,headers:{Location:'https://shopee.com.br/login'}});
    }
  });
  assert.equal(res.results.length,2);
  assert.equal(res.results[0].classification,'wrong_sign');
  assert.equal(res.results[0].requestId,'req-123');
  assert.equal(res.results[1].classification,'authorization_redirect');
  assert.equal(res.keyHasShpkPrefix,true);
  assert.notEqual(new URL(urls[0]).searchParams.get('sign'),new URL(urls[1]).searchParams.get('sign'));
  assert.equal(JSON.stringify(res).includes(config.partnerKey),false);
  assert.equal(JSON.stringify(res).includes('chave-simulada'),false);
  assert.match(res.recommendation,/prefixo shpk/);
});

test('não tenta variação de prefixo quando chave original não possui shpk',async()=>{
  let calls=0;
  const res=await diagnoseShopeeSignature({...config,partnerKey:'chave-sem-prefixo'},{
    httpFetch:async()=>{
      calls++;
      return new Response(JSON.stringify({error:'error_sign',request_id:'req-2'}),{
        status:200,headers:{'Content-Type':'application/json'}
      });
    }
  });
  assert.equal(calls,1);
  assert.equal(res.results.length,1);
  assert.equal(res.results[0].classification,'wrong_sign');
});

test('falha de rede é classificada sem divulgação de segredo',async()=>{
  const res=await diagnoseShopeeSignature({...config,partnerKey:'credencial_teste'},{
    httpFetch:async()=>{throw new Error('proxy failed - dummy');}
  });
  assert.equal(res.results[0].classification,'network_error');
  assert.equal(JSON.stringify(res).includes('dummy'),false);
});

test('não executa requisição com Partner Key ausente',async()=>{
  await assert.rejects(()=>diagnoseShopeeSignature({...config,configured:false}),/Configure/);
});
