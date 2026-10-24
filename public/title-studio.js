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
    clean(data?.supplierProduct?.name||''),clean(data?.supplierProduct?.brand||''),
    clean(extraTerms||'')
  ].join('|');
  // Gratuito e local: não chamar serviços de IA pagos nem usar créditos de API.
  // A assinatura ChatGPT Plus não é uma credencial de API do sistema.
  // Sem ChatGPT conectado, não simular "IA" por frases locais repetidas.
  // A pesquisa começa ao abrir a etapa SEO; não abre abas no carregamento da SKU.
  function prefetch(){return Promise.resolve({ok:false,source:'chatgpt_extension',titles:[],message:'Aguardando geração pelo ChatGPT.'});}

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
        'Para Chutes e Brincadeiras','Bola Infantil Recreativa','Para Jogos de Futebol Infantil',
        'Para Lazer e Recreação','Para Chutes e Passes','Para Brincar','Para Atividades Recreativas'];
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
    let researchToken=0,aiOptions=null,aiBusy=false,researchKeywords=[],researchResult=null;
    const persistKey=['ra-seo-four-chatgpt-v2',data.shopId||'shop',data.itemId,data.modelId||0,sku].join(':');
    try{
     const saved=JSON.parse(localStorage.getItem(persistKey)||'null');
     if(saved?.product===f.title&&saved?.supplierUpdatedAt===(data.sourceEvidence?.updatedAt||null)
       &&Array.isArray(saved.result?.titles)&&saved.result.titles.length===4){
      researchResult=saved.result;aiOptions=saved.result.titles;
      researchKeywords=saved.result.keywords||[];
     }
    }catch{}
    const head=el('div','seo-studio-head');
    const hd=el('div','');
    hd.append(el('div','seo-studio-kicker','OTIMIZAÇÃO DE ANÚNCIOS · TÍTULO SEO'),
      el('h4','','Escolha um título que destaque seu produto'),
      el('p','','4 opções elaboradas com termos do produto, de 100 a 120 caracteres, com edição manual.'));
    const badge=el('span','seo-studio-sku','SKU '+(sku||'—'));
    head.append(hd,badge);mount.append(head);
    const note=el('div','seo-studio-alert','Os quatro títulos são pedidos ao ChatGPT pela Ponte do Chrome (sem API paga). Palavras-chave pesquisadas terão fontes indicadas, quando o ChatGPT conseguir consultá-las.');
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
    const btn=el('button','secondary seo-studio-rebuild','✦ Gerar 4 títulos com ChatGPT');btn.type='button';
    const recover=el('button','secondary seo-studio-recover','↻ Recuperar títulos da aba ChatGPT');recover.type='button';
    manual.append(label,btn,recover);
    const help=el('small','','Separe termos por vírgula. Não invente quantidade, INMETRO, entrega, brinde nem promoção.');
    mount.append(manual,help);
    const grid=el('div','seo-studio-grid');mount.append(grid);
    const bottom=el('p','seo-studio-bottom','Selecione uma opção ou escreva manualmente. O título é salvo primeiro como rascunho desta SKU, sem publicar na Shopee.');
    mount.append(bottom);
    const status=el('div','seo-studio-status');status.setAttribute('role','status');mount.append(status);
    function regenerate(){
      grid.replaceChildren();
      savedTerms.set(sku,inp.value);
      if(!Array.isArray(aiOptions)||aiOptions.length!==4){
       const names=['Busca principal','Palavras-chave','Uso e contexto','Descoberta'];
       for(let i=0;i<4;i++){
        const card=el('article','seo-studio-card seo-studio-empty-card');
        const top=el('div','seo-studio-card-top'),group=el('div','seo-studio-option');
        group.append(el('strong','','0'+(i+1)+' · '+names[i]),
         el('small','','Aguardando pesquisa do ChatGPT'));
        const meter=el('div','seo-studio-meter');
        meter.append(el('strong','','— /100'),el('small','','nota SEO'));
        top.append(group,meter);
        const title=el('p','seo-studio-candidate','Aguardando título validado de 100 a 120 caracteres.');
        const info=el('div','seo-studio-metrics');
        info.append(el('span','seo-studio-caution','Sem título recebido'));
        const action=el('div','seo-studio-card-actions');
        const choose=el('button','seo-studio-choose','✓ Usar este título');
        choose.type='button';choose.disabled=true;action.append(choose);
        card.append(top,title,info,action);grid.append(card);
       }
       return;
      }
      const options=aiOptions.map((v,i)=>({
        ...v,name:['Busca principal','Sinônimos de busca','Uso e contexto','Descoberta'][i],
        reason:v.reason||'Termos sugeridos na pesquisa de mercado'
      }));
      const ranking=globalThis.RASeoTitleScore?.rank(options,{
       keywords:researchKeywords,productTitle:f.supplier||f.title
      });
      if(!ranking||ranking.length!==4){
       grid.append(el('p','seo-studio-empty','O módulo de classificação não carregou. Atualize a página com Ctrl+Shift+R.'));
       return;
      }
      const used=new Set();
      for(const [i,o] of ranking.entries()){
        const n=count(o.title),score=o.score;
        const repeated=used.has(key(o.title));used.add(key(o.title));
        const eligible=n>=MIN&&n<=LIMIT&&!repeated&&o.valid!==false;
        const card=el('article','seo-studio-card'+(eligible?' valid':' needs-review')+
         (o.ideal?' seo-studio-ideal':''));
        const meta=el('div','seo-studio-card-top');
        const group=el('div','seo-studio-option');
        group.append(el('strong','','0'+(i+1)+' · '+o.name),
          el('small','',o.ideal?'★ RECOMENDADO — maior nota SEO':'Classificado em '+(i+1)+'º lugar · ChatGPT'));
        const meter=el('div','seo-studio-meter');
        meter.append(el('strong','',score+'/100'),el('small','','nota SEO estimada'));
        const track=el('div','seo-studio-score-track');
        track.setAttribute('role','progressbar');
        track.setAttribute('aria-label','Nota SEO do título '+(i+1));
        track.setAttribute('aria-valuemin','0');
        track.setAttribute('aria-valuemax','100');
        track.setAttribute('aria-valuenow',String(score));
        const fill=el('div','seo-studio-score-fill');
        fill.style.width=Math.max(0,Math.min(100,score))+'%';
        track.append(fill);meter.append(track);
        meta.append(group,meter);card.append(meta);
        card.append(el('p','seo-studio-candidate',o.title));
        const keys=el('div','seo-studio-metrics');
        keys.append(el('span',eligible?'seo-studio-ok':'seo-studio-caution',n+'/120 caracteres'+(repeated?' · repetido':'')),
          el('span','',o.matchedKeywords.length+' termos da pesquisa incorporados'),
          el('span','',o.warning||('Emojis separados · pesquisa '+(researchResult?.researchStatus==='verified'?'com URLs citadas':'sem fonte comprovada'))));
        card.append(keys);
        // Reduzir a altura dos cartões: explicação e metodologia sob demanda.
        const analysis=el('details','seo-studio-analysis-details');
        const analysisSummary=el('summary','','▸ Ver análise e critérios da nota');
        const explain=el('small','seo-studio-score-detail',
         'Nota: aproveitamento do limite '+o.breakdown.length+'/30 · palavras-chave '+o.breakdown.keywords+
         '/35 · posição da busca '+o.breakdown.front+'/10 · nome do produto '+o.breakdown.product+
         '/10 · emojis '+o.breakdown.emojis+'/10 · clareza '+o.breakdown.readability+'/5.');
        analysis.append(analysisSummary,el('p','seo-studio-why',o.reason),explain);
        card.append(analysis);
        const actions=el('div','seo-studio-card-actions');
        const choose=el('button','seo-studio-choose',o.ideal?'✓ Usar título recomendado':'✓ Usar este título');choose.type='button';
        choose.disabled=!eligible;
        choose.title=choose.disabled?(o.warning||'Título exige correção antes de usar.'): 'Usar esta opção como rascunho da SKU';
        choose.onclick=()=>{
          if(choose.disabled)return;
          onChoose(o.title);
          for(const c of grid.querySelectorAll('.seo-studio-card'))c.classList.remove('selected');
          card.classList.add('selected');
          setLabel(status,'Título na posição '+(i+1)+' selecionado ('+n+'/120). Salve manualmente ou registre a conferência antes de publicar.');
        };
        const copy=el('button','secondary seo-studio-copy','Copiar');copy.type='button';
        copy.onclick=()=>copyText(o.title,status);
        actions.append(choose,copy);card.append(actions);grid.append(card);
      }
    }
    const marketNotice=el('div','seo-studio-market-status','Ponte ChatGPT: pronta para gerar as quatro opções.');
    marketNotice.setAttribute('role','status');
    marketNotice.setAttribute('aria-live','polite');
    note.insertAdjacentElement('afterend',marketNotice);
    const importer=el('details','seo-studio-manual-import');
    importer.append(el('summary','','Se a extensão não estiver instalada: usar ChatGPT manualmente ▾'));
    const openChat=el('button','secondary','Copiar pesquisa e abrir ChatGPT');openChat.type='button';
    const paste=el('textarea','seo-studio-paste');paste.rows=5;
    paste.placeholder='Cole aqui o JSON completo com os quatro títulos produzido pelo ChatGPT.';
    const insert=el('button','secondary','Importar 4 títulos recebidos');insert.type='button';
    const pasteDirect=el('button','secondary seo-studio-direct-import','📋 Importar resposta copiada do ChatGPT');
    pasteDirect.type='button';
    const research=el('div','seo-studio-research');research.setAttribute('role','status');
    importer.append(openChat,paste,insert);
    mount.append(pasteDirect,importer,research);
    function displayResearch(result){
      research.replaceChildren();
      const verified=result.researchStatus==='verified';
      research.append(el('strong','',verified?'URLs citadas pelo ChatGPT (verifique as fontes):':'Sem fontes verificáveis: não afirmar que são as palavras mais buscadas.'));
      if(Array.isArray(result.keywords)&&result.keywords.length)
       research.append(el('p','','Palavras-chave por relevância apontada na pesquisa: '+result.keywords.map((t,i)=>(i+1)+'º '+t).join(' · ')));
      for(const url of result.sources||[]){
       const anchor=el('a','seo-studio-research-link',url);anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';
       research.append(anchor);
      }
    }
    function accept(result){
      aiOptions=result.titles;researchResult=result;
      researchKeywords=result.keywords||[];
      try{
       localStorage.setItem(persistKey,JSON.stringify({
        product:f.title,supplierUpdatedAt:data.sourceEvidence?.updatedAt||null,
        savedAt:new Date().toISOString(),result
       }));
       if(JSON.parse(localStorage.getItem(persistKey)||'null')?.result?.titles?.length!==4)
        throw Error('O armazenamento não confirmou os quatro títulos.');
      }catch(error){throw Error('Os cartões não foram salvos no navegador; a aba ChatGPT permanecerá aberta. '+error.message);}
      displayResearch(result);
      setLabel(marketNotice,'✓ 4 títulos importados e classificados por nota SEO de 0 a 100. O cartão 01 é a opção recomendada. A pontuação estima qualidade estrutural, não volume oficial de buscas.');
      regenerate();
    }
    openChat.onclick=async()=>{
      try{
       const prompt=globalThis.RASeoChatGPT?.prompt(data,inp.value,aiOptions?.map(x=>x.title)||[]);
       if(!prompt)throw Error('Ponte do site não carregada.');
       await navigator.clipboard.writeText(prompt);
       window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
       setLabel(marketNotice,'Pesquisa copiada. Cole no ChatGPT e importe a resposta JSON nas quatro opções.');
      }catch(error){setLabel(marketNotice,'Não foi possível copiar a pesquisa: '+error.message);}
    };
    insert.onclick=()=>{
      try{
       const result=globalThis.RASeoChatGPT?.parse(paste.value);
       if(!result)throw Error('Validador do ChatGPT não carregado.');
       accept(result);
      }catch(error){setLabel(marketNotice,'Resposta não importada: '+error.message);}
    };
    pasteDirect.onclick=async()=>{
     // Clique explícito: pedir acesso somente ao texto copiado pelo usuário.
     try{
      const raw=await navigator.clipboard.readText();
      if(!raw?.trim())throw Error('Área de transferência vazia.');
      const result=globalThis.RASeoChatGPT?.parse(raw);
      if(!result)throw Error('Validador SEO não carregado.');
      accept(result);
      if(grid.querySelectorAll('article.seo-studio-card').length!==4)
       throw Error('Não foi possível apresentar os quatro títulos.');
      setLabel(marketNotice,'✓ Quatro títulos importados do texto copiado, classificados e salvos. Nenhuma pesquisa nova foi iniciada.');
     }catch(error){
      importer.open=true;
      paste.focus();
      setLabel(marketNotice,'Não foi possível ler a resposta copiada: '+error.message+
       ' Clique em Copiar no ChatGPT, cole no campo aberto com Ctrl+V e pressione Importar 4 títulos recebidos.');
     }
    };
    async function generateTitles(refresh=false){
      if(aiBusy)return;
      const token=++researchToken,oldOptions=aiOptions;
      aiBusy=true;btn.disabled=true;
      const currentIdentity=identity;
      setLabel(marketNotice,'Abrindo o ChatGPT pela extensão e pesquisando termos do produto. Aguarde o retorno na tela.');
      try{
        if(!globalThis.RASeoChatGPT?.request)throw Error('Módulo SEO ChatGPT não carregado. Recarregue com Ctrl+Shift+R.');
        const result=await globalThis.RASeoChatGPT.request(data,{
          extraTerms:inp.value,previousTitles:refresh&&oldOptions?oldOptions.map(x=>x.title):[],
          onProgress:msg=>{if(token===researchToken&&mount.isConnected&&mount.dataset.seoStudioIdentity===currentIdentity)setLabel(marketNotice,msg);}
        });
        if(token!==researchToken||!mount.isConnected||mount.dataset.seoStudioIdentity!==currentIdentity)return;
        accept(result);
        if(grid.querySelectorAll('article.seo-studio-card').length!==4)
         throw Error('O Manager não conseguiu apresentar as quatro opções. A aba ChatGPT será mantida para recuperação.');
        // ACK somente depois da importação, ordenação e armazenamento por SKU.
        globalThis.RASeoChatGPT.acknowledge(result);
      }catch(err){
        if(token!==researchToken||!mount.isConnected||mount.dataset.seoStudioIdentity!==currentIdentity)return;
        aiOptions=oldOptions;
        setLabel(marketNotice,'A pesquisa não foi importada: '+err.message+' A aba ChatGPT foi preservada; copie o JSON e use Importar 4 títulos recebidos ou clique em Gerar novamente.');
        regenerate();
      }finally{
        if(token===researchToken&&mount.dataset.seoStudioIdentity===currentIdentity){
          aiBusy=false;btn.disabled=false;
        }
      }
    }
    recover.addEventListener('click',()=>{
      if(aiBusy)return;
      void (async()=>{
       const token=++researchToken;
       aiBusy=true;recover.disabled=true;btn.disabled=true;
       const oldOptions=aiOptions;
       setLabel(marketNotice,'Recuperando os quatro títulos da aba do ChatGPT sem iniciar outra pesquisa…');
       try{
        if(!globalThis.RASeoChatGPT?.recover)throw Error('Instale a Ponte 1.0.31 e atualize o Manager.');
        const result=await globalThis.RASeoChatGPT.recover(data);
        if(token!==researchToken||!mount.isConnected||mount.dataset.seoStudioIdentity!==identity)return;
        accept(result);
        if(grid.querySelectorAll('article.seo-studio-card').length!==4)
         throw Error('O Manager ainda não conseguiu exibir os quatro títulos.');
        globalThis.RASeoChatGPT.acknowledgeRecovery(result);
        setLabel(marketNotice,'✓ 4 títulos recuperados e classificados por nota. A aba da pesquisa foi liberada para fechamento.');
       }catch(error){
        aiOptions=oldOptions;regenerate();
        setLabel(marketNotice,'Recuperação não concluída: '+error.message+' Confira a aba e tente novamente.');
       }finally{
        if(token===researchToken){aiBusy=false;recover.disabled=false;btn.disabled=false;}
       }
      })();
    });
    btn.addEventListener('click',()=>{
      if(aiBusy)return;
      void generateTitles(true);
    });
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();void generateTitles(true);}
    });
    regenerate();
    if(researchResult){
      displayResearch(researchResult);
      setLabel(marketNotice,'✓ Quatro títulos e suas notas restaurados para esta SKU. Clique em Gerar novos títulos para uma NOVA pesquisa ChatGPT.');
    }else if(globalThis.RASeoChatGPT?.hasPending?.(data)){
      // A etapa SEO pode ser redesenhada pelo Motor Matriz enquanto o ChatGPT trabalha.
      // Reanexar à requisição original sem abrir nova aba ou perder o retorno.
      setLabel(marketNotice,'Retomando automaticamente os títulos desta SKU, sem repetir a pesquisa ChatGPT…');
      void generateTitles(false);
    }else{
      setLabel(marketNotice,'Nenhum título importado. Clique em Gerar 4 títulos com ChatGPT ou Recuperar títulos da aba ChatGPT. As etapas anteriores permanecem salvas.');
    }
  }
  globalThis.ShopeeTitleStudio={open,prefetch};
})();