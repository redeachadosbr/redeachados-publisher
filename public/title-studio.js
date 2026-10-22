/* Rede Achados BR — Estúdio de títulos SEO: revisão humana, sem promessas de conversão. */
(function(){
  'use strict';
  const LIMIT=120;
  const count=s=>[...String(s||'').normalize('NFC')].length;
  const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
  const key=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const savedTerms=new Map();
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
      phrases=['Vaporizador para Roupas','Desamassa no Cabide','Cuidados com Roupas','Passadeira Portátil'];
    } else if(/porta.?shampoo|organizador de box/i.test(joined)){
      kind='bath';
      phrases=['Organizador de Banheiro','Para Box de Banheiro','Suporte de Canto','Prateleira para Shampoo'];
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
      phrases=['Garrafa para Bebidas','Para o Dia a Dia','Garrafa Térmica'];
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
  function assemble(cfg){
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
      if(length>LIMIT)return;
      const qualified=length>=MIN;
      const tokens=signature(text),novel=new Set(tokens);
      const extraWeight=Math.min(chosen.length,2)*8;
      // Prefer 109–119 characters, good readability and <= 3 distinct phrases.
      const quality=(qualified?1500:0)+length*3-Math.abs(length-115)*5+
        novel.size*1.8+extraWeight-Math.max(0,chosen.length-2)*15;
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
    const front=/^(?:[^\p{L}\p{N}]*)(?:mochila|passadeira|vaporizador|porta|garrafa|kit|piscina|suporte)/iu.test(title)?22:15;
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
    let marketSample=[],researchToken=0;
    const head=el('div','seo-studio-head');
    const hd=el('div','');
    hd.append(el('div','seo-studio-kicker','OTIMIZAÇÃO DE ANÚNCIOS · TÍTULO SEO'),
      el('h4','','Escolha um título que destaque seu produto'),
      el('p','','4 opções elaboradas com termos do produto, de 100 a 120 caracteres, com edição manual.'));
    const badge=el('span','seo-studio-sku','SKU '+(sku||'—'));
    head.append(hd,badge);mount.append(head);
    const note=el('div','seo-studio-alert','Pontuação estrutural estimada. A pesquisa verifica termos recorrentes em ofertas similares quando disponível, mas não mede o volume de buscas.');
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
    const btn=el('button','secondary seo-studio-rebuild','↻ Gerar novas opções');btn.type='button';
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
      const output=variants(f,inp.value,marketSample).map(v=>({...v,title:assemble(v)}));
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
        group.append(el('strong','','0'+(i+1)+' · '+o.name),el('small','',o.subtitle));
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
    const marketNotice=el('div','seo-studio-market-status','🔎 Consultando ofertas Shopee para pesquisa de termos…');
    marketNotice.setAttribute('role','status');note.insertAdjacentElement('afterend',marketNotice);
    async function research(){
      const token=++researchToken;
      if(!data.itemId||!sku){setLabel(marketNotice,'Sem SKU/Item ID para pesquisa. Sugestões baseadas na ficha.');return;}
      setLabel(marketNotice,'🔎 Pesquisando títulos em ofertas Shopee comparáveis…');
      try{
        const params=new URLSearchParams({item_id:String(data.itemId),model_id:String(data.modelId||'0'),sku});
        const response=await fetch('/api/shopee/optimizer/workflow/title-research?'+params,{credentials:'same-origin',signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw Error('Falha de pesquisa HTTP '+response.status);
        const result=await response.json();
        if(token!==researchToken||!mount.isConnected)return;
        marketSample=Array.isArray(result.sample)?result.sample.filter(x=>x.title).slice(0,5):[];
        const total=marketSample.length;
        setLabel(marketNotice,result.verifiedSample&&total
          ?'🔎 '+total+' anúncios comparáveis encontrados. A ordem das palavras-chave foi ajustada por recorrência, sem supor volume de buscas.'
          :total?'🔎 '+total+' oferta(s) parcial(is) localizada(s), comparabilidade não confirmada; sugestões seguem fatos do produto.'
          :'🔎 Sem pesquisa externa verificável nesta consulta. Sugestões baseadas em dados confirmados da SKU.');
        regenerate();
      }catch(err){
        if(token!==researchToken||!mount.isConnected)return;
        marketSample=[];
        setLabel(marketNotice,'🔎 Pesquisa externa indisponível: termos SEO derivados da ficha, sem alegar volume de buscas.');
        regenerate();
      }
    }
    btn.addEventListener('click',()=>{regenerate();void research();});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();regenerate();}});
    regenerate();
    void research();
  }
  globalThis.ShopeeTitleStudio={open};
})();