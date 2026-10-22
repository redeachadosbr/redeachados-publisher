/* Rede Achados BR — Estúdio de títulos SEO: revisão humana, sem promessas de conversão. */
(function(){
  'use strict';
  const LIMIT=120;
  const count=s=>[...String(s||'').normalize('NFC')].length;
  const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
  const key=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const savedTerms=new Map();

  // One in-flight generation per SKU/model/terms; starts as soon as the audit
  // identifies the product. Opening SEO reuses the same promise/results.
  const seoAiPrefetchCache=new Map();
  const prefetchKey=(data,extraTerms='')=>[
    String(data?.sku||''),String(data?.itemId||''),
    String(data?.modelId??data?.selectedModelId??'0'),
    clean(data?.productTitle||data?.title||''),
    clean(extraTerms||'')
  ].join('|');
  function prefetch(data,{force=false,extraTerms='',previousTitles=[]}={}){
    const sku=clean(data?.sku||''),itemId=String(data?.itemId||'');
    if(!sku||!itemId)return Promise.resolve({
      ok:false,source:'local_fallback',message:'SKU não identificada.',titles:[]
    });
    const key=prefetchKey(data,extraTerms),current=seoAiPrefetchCache.get(key),now=Date.now();
    if(current&&now<current.expiresAt&&(!force||now-current.createdAt<8000))return current.promise;
    const request=fetch('/api/shopee/optimizer/workflow/title-ai',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        sku,itemId,modelId:String(data.modelId??data.selectedModelId??'0'),
        extraTerms:String(extraTerms||'').slice(0,300),
        refresh:Boolean(force),previousTitles:(Array.isArray(previousTitles)?previousTitles:[])
          .slice(0,4).map(x=>String(x||'').slice(0,120))
      }),
      signal:AbortSignal.timeout(75000)
    }).then(async res=>{
      const result=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(result.error||'Serviço de IA indisponível (HTTP '+res.status+').');
      return result;
    });
    // On failure keep the fallback visible, but allow a retry later.
    seoAiPrefetchCache.set(key,{promise:request,createdAt:now,expiresAt:now+10*60000});
    request.catch(()=>{
      const saved=seoAiPrefetchCache.get(key);
      if(saved?.promise===request)seoAiPrefetchCache.delete(key);
    });
    if(seoAiPrefetchCache.size>36)seoAiPrefetchCache.delete(seoAiPrefetchCache.keys().next().value);
    return request;
  }

  const setLabel=(e,v)=>{e.textContent=v;return e;};
  function facts(data){
    const title=withoutInternalCode(data.productTitle||data.draftTitle||'Produto',data.sku);
    const supplier=withoutInternalCode(data.supplierProduct?.name||'',data.sku);
    const brand=clean(data.supplierProduct?.brand||'');
    const raw=[title,supplier];
    let kind='generic',phrases=[];
    const joined=raw.join(' ');
    if(/\bmoto\s*(?:el[eé]trica|infantil)|\bmotinha\b/iu.test(joined)){
      kind='electric_moto';
      phrases=[
        'Motinha de Brinquedo para Crianças',
        'Brinquedo Infantil Motorizado',
        'Moto de Brinquedo Infantil',
        'Para Passeio e Brincadeiras',
        'Estilo Retrô para Crianças',
        'Motinha Infantil Elétrica',
        'Brinquedo de Passeio Infantil'
      ];
      // Material/bateria são adicionados somente quando a ficha desta SKU comprova.
      const att=JSON.stringify(data.attributes||[]).toLowerCase();
      if(/(?:build.in battery|bateria interna|bateria embutida).{0,90}(?:yes|sim|true)/i.test(att))phrases.push('Com Bateria Interna');
      if(/(?:material).{0,50}(?:plastic|plástico|plastico)/i.test(att))phrases.push('Fabricada em Plástico');
    } else if(/\bbola\b/i.test(joined)&&/\binfantil|futebol/i.test(joined)){
      kind='ball';
      phrases=['Bola de Futebol para Crianças','Brinquedo Esportivo Infantil',
        'Para Chutes e Brincadeiras','Bola Infantil Recreativa','Para Jogos de Futebol Infantil'];
      if(/infl[aá]vel/i.test(joined))phrases.push('Bola Inflável');
      if(/vinil|pvc/i.test(joined))phrases.push('Vinil PVC');
    } else if(/piscina\s+infl[aá]vel/i.test(joined)){
      kind='pool';
      phrases=['Piscina Infantil Inflável','Para Brincadeiras na Água','Lazer Infantil',
        'Para Dias de Verão','Brinquedo de Água para Crianças'];
    } else if(/mochila|construtor|ferramentas/i.test(joined)&&/mochila|construtor/i.test(joined)){
      kind='toy';
      phrases=['Brinquedo de Faz de Conta','Kit de Ferramentas de Brinquedo',
       'Brincadeira de Construção','Para Brincar','Para Crianças','Presente Infantil',
       'Mochila de Ferramentas','Brinquedo Infantil','Construtor 3 em 1'];
    } else if(/passadeira a vapor|vaporizador de roupas/i.test(joined)){
      kind='steam';
      phrases=['Vaporizador para Roupas','Para Desamassar Roupas','Cuidados com Roupas','Passadeira Portátil','Passadeira a Vapor para Vestuário','Para o Cuidado de Tecidos','Vaporizador Portátil de Roupas'];
    } else if(/porta.?shampoo|organizador de box/i.test(joined)){
      kind='bath';
      phrases=['Organizador de Banheiro','Para Box de Banheiro','Prateleira para Shampoo','Organizador de Produtos de Banho','Suporte para Shampoo e Condicionador','Organização do Banheiro'];
      if(/2\s*andares|dois\s*andares/i.test(joined))phrases.push('Porta Shampoo de Dois Andares');
    } else if(/toalha/i.test(joined)&&/camping|acampamento/i.test(joined)){
      kind='camping_towel';
      // Expressões de contexto derivadas do produto; não são volumes de busca verificados.
      phrases=['Toalha para Camping','Toalha para Viagem','Toalha para Acampamento',
       'Camping e Viagem','Acessórios para Camping','Acampamento ao Ar Livre',
       'Toalha de Camping','Equipamentos para Acampamento','Para Levar em Viagens',
       'Toalha para Uso no Camping','Artigos para Camping','Toalha para Atividades ao Ar Livre',
       'Para Viagens e Camping','Toalha de Viagem','Camping ao Ar Livre'];
    } else if(/garrafa t[eé]rmica/i.test(joined)){
      kind='bottle';
      phrases=['Garrafa para Bebidas','Para o Dia a Dia','Para Transporte de Bebidas','Garrafa para Café e Chá','Para Uso em Casa e no Trabalho','Garrafa Portátil para Viagens','Acessórios para Bebidas'];
    }  else if(/cafeteira italiana|cafeteira moka/i.test(joined)){
      kind='coffee';
      phrases=['Cafeteira Estilo Italiano','Cafeteira para Preparar Café','Preparo de Café na Cozinha',
        'Cafeteira para Café no Dia a Dia','Cafeteira Tradicional Italiana','Utensílio para Preparo de Café'];
    }else if(/jogo\s+de?\s*chaves|kit\s+de?\s*chaves|conjunto de chaves/i.test(joined)){
      kind='keys';
      phrases=['Kit de Chaves e Ferramentas','Conjunto de Chaves para Reparos','Ferramentas Manuais',
        'Jogo de Chaves para Manutenção','Kit de Ferramentas para Oficina','Chaves para Uso Doméstico'];
    }else if(/lixeira.+(?:telada|metal)|cesto de lixo.+metal/i.test(joined)){
      kind='bin';
      phrases=['Cesto de Lixo Metálico','Lixeira para Escritório','Lixeira de Tela Metálica',
        'Lixeira para Home Office','Organização de Ambientes','Cesto para Resíduos'];
    }else if(/carrinho.*compras|carrinho.*feira/i.test(joined)){
      kind='cart';
      phrases=['Carrinho para Compras e Feira','Carrinho Dobrável para Mercado',
        'Para Transporte de Compras','Carrinho de Compras para Supermercado',
        'Carrinho para Ir à Feira','Acessório para Compras do Dia a Dia'];
    }else if(/liquidificador.*port[aá]til|mini liquidificador/i.test(joined)){
      kind='blender';
      phrases=['Mini Liquidificador Portátil','Liquidificador para Sucos',
        'Preparo de Bebidas e Vitaminas','Para Bebidas no Dia a Dia',
        'Liquidificador para Uso em Viagens','Liquidificador Compacto para Bebidas'];
    }else if(/porta.?temperos|organizador de temperos/i.test(joined)){
      kind='spices';
      phrases=['Organizador de Temperos para Cozinha','Kit de Potes para Condimentos',
        'Conjunto de Porta Temperos','Potes para Especiarias',
        'Organização dos Temperos da Cozinha','Acessórios para Armazenar Temperos'];
    }else if(/raquete.+(?:mosquito|inseto)/i.test(joined)){
      kind='swatter';
      phrases=['Raquete Mata Insetos','Raquete para Mosquitos',
        'Controle de Mosquitos em Casa','Raquete para Eliminar Insetos',
        'Acessório para Uso Doméstico','Raquete para Controle de Insetos'];
    }else if(/pote.*herm[eé]tico|recipiente.*herm[eé]tico/i.test(joined)){
      kind='container';
      phrases=['Pote com Fechamento Hermético','Pote para Guardar Mantimentos',
        'Recipiente Hermético para Cozinha','Organizador de Alimentos',
        'Pote para Armazenamento na Cozinha','Pote de Cozinha com Tampa'];
    }
    // Nunca usar características de concorrentes ou promessa comercial como fato do produto.
    if(brand&&brand.length<35&&!/^(sem marca|gen[eé]rico|n[ãa]o informado|outros)$/i.test(brand))phrases.unshift(brand);
    return {title,supplier,brand,kind,phrases};
  }
  // O SKU e os códigos internos do catálogo não são termos de busca.
  // A limpeza atua nas SUGESTÕES, nunca no título editado manualmente.
  function withoutInternalCode(value,sku=''){
    const normalized=clean(value);
    return clean(normalized.split(/\s+/).filter(word=>{
      const token=word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
      if(!token)return true;
      if(sku&&token.toLowerCase()===String(sku).toLowerCase())return false;
      return !/^(?=[a-z0-9-]{5,}$)(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9-]+$/i.test(token)||
        /^(?:\d+(?:w|v|ml|l|cm|mm|kg)|n\d{1,2})$/i.test(token);
    }).join(' '));
  }
  const MIN=100;
  function variants(f,manual,marketSample=[]){
    const confirmed=manual.split(/[,;\n]/).map(clean).filter(x=>x.length>=3&&count(x)<=44).slice(0,12);
    const frequency=term=>marketSample.reduce((sum,t)=>{
      const normalized=clean(t.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const part=clean(term).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      return sum+(part&&normalized.includes(part)?1:0);
    },0);
    const extra=[...new Map([...f.phrases,...confirmed].map(v=>[key(v),v])).values()];
    // Ranking de RECORRÊNCIA nos anúncios equivalentes, nunca volume de busca.
    // A origem de cada termo continua sendo produto/ficha ou digitação confirmada.
    const ordered=extra.map((t,i)=>({t,i,frequency:frequency(t)}))
      .sort((a,b)=>b.frequency-a.frequency||a.i-b.i).map(x=>x.t);
    const title=f.title.replace(/^(super|novo|novidade|promo[cç][aã]o|oferta)\s+/i,'');
    const alternate=f.supplier&&key(f.supplier)!==key(title)?f.supplier:title;
    const brand=f.brand&&!key(title).includes(key(f.brand))?' '+f.brand:'';
    let bases=[title+brand,title+brand,alternate+brand,title+brand];
    if(f.kind==='electric_moto'){
      const stripped=title.replace(/\s*[-–]\s*/g,' ').replace(/\s+/g,' ').trim();
      bases=[
       stripped+brand,
       stripped.replace(/\bMoto El[eé]trica Infantil\b/i,'Motinha Elétrica Infantil')+brand,
       stripped.replace(/\bMoto El[eé]trica Infantil\b/i,'Moto Infantil Elétrica')+brand,
       stripped.replace(/\bVintage\b/i,'Estilo Vintage')+brand
      ];
    }else if(f.kind==='ball'){
      bases=[title+brand,title.replace(/Bola\s+(?:de\s+)?Futebol\s+Infantil/i,'Bola Infantil de Futebol')+brand,
       title.replace(/Bola\s+(?:de\s+)?Futebol\s+Infantil/i,'Bola de Futebol para Crianças')+brand,title+brand];
    }
    const shift=i=>ordered.slice(i).concat(ordered.slice(0,i));
    const emoji=f.kind==='electric_moto'?'🏍️ ':f.kind==='ball'?'⚽ ':f.kind==='toy'?'🧰 ':f.kind==='camping_towel'?'🏕️ ':f.kind==='pool'?'🏖️ ':'✨ ';
    return [
      {name:'Busca direta',subtitle:'Nome principal + buscas relacionadas',base:bases[0],terms:shift(0),emoji,
       reason:'Combina o nome comprovado com termos relevantes sem copiar o título bruto da WeDrop.'},
      {name:'Palavras-chave',subtitle:'Sinônimos de busca do comprador',base:bases[1],terms:shift(2),emoji:'🔎 ',
       reason:'Variante com sinônimos da categoria e termos sustentados pela ficha.'},
      {name:'Uso e contexto',subtitle:'Finalidade real do produto',base:bases[2],terms:shift(4),emoji,
       reason:'Destaca o contexto de utilização sem inventar funções ou acessórios.'},
      {name:'Descoberta',subtitle:'Outra organização de SEO',base:bases[3],terms:shift(1),emoji:'⭐ ',
       reason:'Prioriza uma redação alternativa com palavras-chave comprovadas.'}
    ];
  }
  function assemble(cfg,excluded=new Set()){
    const base=clean(cfg.base).replace(/\s*[-–]\s*/g,' ').replace(/[\s|·]+$/,'');
    const prefix=cfg.emoji||'';
    const core=clean(prefix+base);
    if(count(core)>LIMIT){
      return [...core].slice(0,LIMIT).join('').replace(/\s+\S*$/u,'').trim();
    }
    const signature=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().split(/[^a-z0-9]+/g).filter(w=>w.length>=4&&!['para','infantil','crianças','criancas','brinquedo'].includes(w));
    const baseWords=new Set(signature(core));
    const terms=[...new Map((cfg.terms||[]).filter(Boolean).map(t=>[key(t),clean(t)])).values()].filter(t=>{
      if(count(t)>48||key(core).includes(key(t)))return false;
      const ws=signature(t),overlap=ws.filter(w=>baseWords.has(w)).length;
      return ws.length===0||overlap/ws.length<.82;
    }).slice(0,18);
    let best={text:core,quality:-9999};
    const inspect=(chosen)=>{
      const text=chosen.length?core+' | '+chosen.join(' · '):core;
      const length=count(text);
      if(length>LIMIT||excluded.has(key(text)))return;
      const qualified=length>=MIN;
      const tokens=signature(text),novel=new Set(tokens);
      const extraWeight=Math.min(chosen.length,2)*8;
      // Prefer 109–119 characters, good readability and <= 3 distinct phrases.
      const priorityPenalty=chosen.reduce((sum,term)=>sum+Math.max(0,terms.indexOf(term)),0)*12;
      const quality=(qualified?1500:0)+length*3-Math.abs(length-114)*4+
        novel.size*1.8+extraWeight-Math.max(0,chosen.length-2)*18-priorityPenalty;
      if(quality>best.quality)best={text,quality};
    };
    inspect([]);
    function visit(chosen,used,start){
      if(chosen.length>=3)return;
      for(let k=start;k<terms.length;k++){
        const term=terms[k];
        if(used.some(t=>key(t).includes(key(term))||key(term).includes(key(t))))continue;
        const next=[...chosen,term];
        if(count(core+' | '+next.join(' · '))>LIMIT)continue;
        inspect(next);visit(next,[...used,term],k+1);
      }
    }
    visit([],[],0);
    return best.text;
  }
  function rating(title,kind){
    const n=count(title);
    const enough=n>=100&&n<=LIMIT?20:n>=90?6:0;
    const front=/^(?:[^\p{L}\p{N}]*)(?:moto|motinha|bola|mochila|passadeira|vaporizador|porta|garrafa|kit|piscina|suporte|jogo|lixeira|carrinho|liquidificador|raquete|pote|cafeteira)/iu.test(title)?22:15;
    const emoji= /[\p{Extended_Pictographic}]/u.test(title)?12:5;
    const noHype=/\b(promo[cç][aã]o|gr[aá]tis|24h|certificado|melhor pre[cç]o|inmetro|25 acess[oó]rios)\b/i.test(title)?0:17;
    const natural=/([!]{2,}|\s{2,})/.test(title)?5:16;
    return Math.min(99,enough+front+emoji+noHype+natural+10);
  }
  function copyText(t,notice){
    navigator.clipboard?.writeText(t).then(()=>setLabel(notice,'Título copiado.')).catch(()=>setLabel(notice,'Selecione e copie o texto manualmente.'));
  }
  function open(data,onChoose){
    const mount=document.getElementById('optimizerTitleVariants');
    if(!mount)return;
    mount.replaceChildren();mount.hidden=false;
    mount.classList.add('seo-studio');
    const f=facts(data),sku=clean(data.sku||'');
    const identity=prefetchKey(data);
    mount.dataset.seoStudioIdentity=identity;
    let marketSample=[],researchToken=0,aiOptions=null,aiBusy=false,aiRequested=false;
    const head=el('div','seo-studio-head');
    const hd=el('div','');
    hd.append(el('div','seo-studio-kicker','OTIMIZAÇÃO DE ANÚNCIOS · TÍTULO SEO'),
      el('h4','','Escolha um título que destaque seu produto'),
      el('p','','4 opções elaboradas com termos do produto, de 100 a 120 caracteres, com edição manual.'));
    const badge=el('span','seo-studio-sku','SKU '+(sku||'—'));
    head.append(hd,badge);mount.append(head);
    const note=el('div','seo-studio-alert','A IA gera títulos em segundo plano, usando dados da SKU e anúncios comparáveis quando disponíveis. Não é um ranking de volume de buscas.');
    mount.append(note);
    const kw=el('div','seo-studio-facts');
    kw.append(el('strong','','Base confirmada: '),el('span','',f.title));
    if(f.supplier&&key(f.supplier)!==key(f.title))kw.append(el('small','',' · WeDrop: '+f.supplier));
    mount.append(kw);
    const manual=el('div','seo-studio-custom');
    const label=el('label','','Termos extras confirmados (opcional)');
    const inp=el('input','seo-studio-input');inp.type='text';inp.maxLength=320;
    inp.placeholder='Ex.: número de peças, material, capacidade — somente se comprovados';
    inp.value=savedTerms.get(sku)||'';
    label.append(inp);
    const btn=el('button','secondary seo-studio-rebuild','↻ Gerar novos títulos');btn.type='button';
    manual.append(label,btn);
    const help=el('small','','Separe termos por vírgula. Não invente quantidade, INMETRO, entrega, brinde nem promoção.');
    mount.append(manual,help);
    const grid=el('div','seo-studio-grid');mount.append(grid);
    const bottom=el('p','seo-studio-bottom','Selecione uma opção e edite livremente no campo “Título SEO proposto” abaixo. Nada é publicado automaticamente.');
    mount.append(bottom);
    const status=el('div','seo-studio-status');status.setAttribute('role','status');mount.append(status);
    function regenerate(){
      grid.replaceChildren();
      savedTerms.set(sku,inp.value);
      const reserved=new Set();
      const fallback=variants(f,inp.value,marketSample).map(v=>{
        const title=assemble(v,reserved);
        reserved.add(key(title));return {...v,title};
      });
      const output=Array.isArray(aiOptions)&&aiOptions.length===4
        ?aiOptions.map((v,i)=>({
          ...fallback[i],title:v.title,reason:v.reason||fallback[i].reason,
          ai:true,name:['Busca principal','Sinônimos de busca','Uso e contexto','Descoberta'][i]
        }))
        :fallback;
    const used=new Set();
    for(const o of output){
      if(used.has(key(o.title)))o.duplicate=true;
      used.add(key(o.title));
    }
      for(const [i,o] of output.entries()){
        const n=count(o.title),score=rating(o.title,f.kind);
        const card=el('article','seo-studio-card'+(n>=MIN&&n<=LIMIT&&!o.duplicate?' valid':' needs-review'));
        const meta=el('div','seo-studio-card-top');
        const group=el('div','seo-studio-option');
        group.append(el('strong','','0'+(i+1)+' · '+o.name),el('small','',o.ai?'✦ Elaborado pela API OpenAI':'Sugestão local · '+o.subtitle));
        const meter=el('div','seo-studio-meter');
        meter.append(el('strong','',score+'/100'),el('small','','nota estrutural estimada'));
        meta.append(group,meter);card.append(meta);
        card.append(el('p','seo-studio-candidate',o.title));
        const keys=el('div','seo-studio-metrics');
        keys.append(el('span',n>=MIN&&n<=LIMIT&&!o.duplicate?'seo-studio-ok':'seo-studio-caution',n+'/120 caracteres'+(o.duplicate?' · opção repetida':'')),
          el('span','','⚡ '+(n>=MIN&&n<=LIMIT&&!o.duplicate?'Pronto para revisão':n<MIN?'Faltam '+(MIN-n)+' caracteres':n>LIMIT?'Reduzir para até 120':'Opção repetida')));
        card.append(keys,el('p','seo-studio-why',o.reason));
        const actions=el('div','seo-studio-card-actions');
        const choose=el('button','seo-studio-choose','✓ Usar este título');choose.type='button';
        choose.disabled=n<MIN||n>LIMIT||Boolean(o.duplicate);
        choose.title=choose.disabled?'Não atende os 100 a 120 caracteres ou repete outra opção.':'Aplicar título válido na revisão';
        choose.onclick=()=>{
          if(choose.disabled)return;
          onChoose(o.title);
          for(const c of grid.querySelectorAll('.seo-studio-card'))c.classList.remove('selected');
          card.classList.add('selected');
          setLabel(status,'Título válido selecionado ('+n+'/120). Revise e registre a conferência para salvar.');
        };
        const copy=el('button','secondary seo-studio-copy','Copiar');copy.type='button';
        copy.onclick=()=>copyText(o.title,status);
        actions.append(choose,copy);card.append(actions);grid.append(card);
      }
    }
    const marketNotice=el('div','seo-studio-market-status','✦ Preparando pesquisa e geração de títulos por IA…');
    marketNotice.setAttribute('role','status');
    marketNotice.setAttribute('aria-live','polite');
    note.insertAdjacentElement('afterend',marketNotice);
    async function generateByAi(refresh=false){
      if(aiBusy)return;
      const token=++researchToken;
      aiBusy=true;aiRequested=true;btn.disabled=true;
      const desiredTerms=inp.value;
      const currentIdentity=identity;
      setLabel(marketNotice,'✦ Títulos em elaboração automática pela IA. Pesquisa e revisão de termos em andamento…');
      try{
        if(!sku||!data.itemId)throw Error('SKU sem identificação completa.');
        const oldTitles=Array.isArray(aiOptions)?aiOptions.map(x=>x.title):[];
        const result=await prefetch(data,{force:refresh,extraTerms:desiredTerms,previousTitles:oldTitles});
        if(token!==researchToken||!mount.isConnected||mount.dataset.seoStudioIdentity!==currentIdentity)return;
        if(result.source!=='openai_api'||!Array.isArray(result.titles)||result.titles.length!==4){
          aiOptions=null;
          setLabel(marketNotice,'◉ IA indisponível: '+(result.message||'Conecte a API OpenAI no sistema.')+
            ' As sugestões locais ficam disponíveis.');
        }else{
          const candidates=result.titles.map(t=>({title:clean(t.title),reason:clean(t.reason)}));
          const allValid=candidates.every(t=>count(t.title)>=MIN&&count(t.title)<=LIMIT);
          const unique=new Set(candidates.map(t=>key(t.title))).size===4;
          if(!allValid||!unique)throw Error('A API retornou títulos fora do intervalo ou repetidos.');
          aiOptions=candidates;
          setLabel(marketNotice,'✓ 4 títulos gerados automaticamente pela IA'+(result.cached?' (reaproveitados da SKU)':'')+
            ' · '+(result.marketVerified?result.marketCount+' anúncios comparáveis considerados':'sem amostra externa verificada')+
            '. Selecione um título ou use Gerar novos títulos.');
        }
        regenerate();
      }catch(err){
        if(token!==researchToken||!mount.isConnected||mount.dataset.seoStudioIdentity!==currentIdentity)return;
        aiOptions=null;
        setLabel(marketNotice,'◉ Falha na geração por IA: '+err.message+
          ' Sugestões locais preservadas; nenhuma publicação realizada.');
        regenerate();
      }finally{
        if(token===researchToken&&mount.dataset.seoStudioIdentity===currentIdentity){
          aiBusy=false;btn.disabled=false;
        }
      }
    }
    btn.addEventListener('click',()=>{
      if(aiBusy)return;
      void generateByAi(true);
    });
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();void generateByAi(true);}
    });
    regenerate();
    // A API é chamada pelo próprio Shopee Manager. Nenhuma aba do ChatGPT é aberta.
    void generateByAi(false);
  }
  globalThis.ShopeeTitleStudio={open,prefetch};
})();