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
    const title=clean(data.productTitle||data.draftTitle||'Produto');
    const supplier=clean(data.supplierProduct?.name||'');
    const brand=clean(data.supplierProduct?.brand||'');
    const raw=[title,supplier];
    let kind='generic',phrases=[];
    const joined=raw.join(' ');
    if(/mochila|construtor|ferramentas/i.test(joined)&&/mochila|construtor/i.test(joined)){
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
    } else if(/garrafa t[eé]rmica/i.test(joined)){
      kind='bottle';
      phrases=['Garrafa para Bebidas','Para o Dia a Dia','Garrafa Térmica'];
    }
    // Nunca usar características de concorrentes ou promessa comercial como fato do produto.
    if(brand&&brand.length<35&&!/^(sem marca|gen[eé]rico|n[ãa]o informado|outros)$/i.test(brand))phrases.unshift(brand);
    return {title,supplier,brand,kind,phrases};
  }
  function variants(f,manual){
    const confirmed=manual.split(/[,;\n]/).map(clean).filter(x=>x.length>=3&&count(x)<=45).slice(0,12);
    const extra=[...new Map([...f.phrases,...confirmed].map(v=>[key(v),v])).values()];
    const title=f.title;
    const short=title.replace(/^(super|novo|novidade|promo[cç][aã]o|oferta)\s+/i,'');
    const alternate=f.supplier&&key(f.supplier)!==key(title)?f.supplier:short;
    const prefix=f.kind==='toy'?'🧰 ':'✨ ';
    return [
      {name:'Busca direta',subtitle:'Começa pelo nome do produto',base:title,terms:extra,emoji:prefix,
       reason:'Prioriza nome, tipo e termos relacionados ao produto identificado.'},
      {name:'Palavras-chave',subtitle:'Amplia buscas relacionadas',base:short,terms:extra.slice().reverse(),emoji:'🔎 ',
       reason:'Organiza sinônimos e termos de busca sem afirmar volume pesquisado.'},
      {name:'Uso e benefício',subtitle:'Contexto de compra',base:alternate,terms:extra.slice(2).concat(extra.slice(0,2)),emoji:'✨ ',
       reason:'Combina atributos existentes e contextos coerentes com a categoria.'},
      {name:'Presente e descoberta',subtitle:'Apresentação comercial',base:short,terms:extra.slice(4).concat(extra.slice(0,4)),emoji:f.kind==='toy'?'🎁 ':'⭐ ',
       reason:'Testa outra ordem de palavras mantendo as informações do anúncio.'}
    ];
  }
  function assemble(cfg){
    const base=clean(cfg.base);
    const prefix=cfg.emoji||'';
    const start=count(prefix+base)<=LIMIT?prefix+base:prefix+[...base].slice(0,LIMIT-count(prefix)).join('').replace(/\s+\S*$/,'');
    const terms=cfg.terms.filter((t,i,a)=>t&&a.findIndex(v=>key(v)===key(t))===i&&
      !key(base).includes(key(t)) && count(t)<=42);
    // Mochila 3 em 1 etc. Only the product's own title, supplier and optional approved terms.
    let states=new Map([[count(start),{text:start,score:0}]]);
    const additions=terms.slice(0,16);
    for(let i=0;i<additions.length;i++){
      const next=new Map(states);
      for(const [len,current] of states){
        for(const sep of [' · ',' | ',' ']){
          const part=sep+additions[i],n=len+count(part);
          if(n>LIMIT)continue;
          const score=current.score+count(additions[i])+(sep===' · '?1:0);
          const old=next.get(n);
          if(!old||score>old.score)next.set(n,{text:current.text+part,score});
        }
      }
      states=next;
    }
    let winner=null,score=-Infinity;
    for(const [len,state] of states){
      const value=len*5+state.score*.05-(len===LIMIT?0:0);
      if(value>score){winner=state.text;score=value;}
    }
    let chosen=clean(winner||start);
    // Optional accent emojis fill exact 1-character gaps, never add spaces as fake SEO.
    if(count(chosen)===LIMIT-1)chosen+='✨';
    return chosen;
  }
  function rating(title,kind){
    const n=count(title);
    const enough=n===LIMIT?20:n>=103?13:n>=90?8:2;
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
    const head=el('div','seo-studio-head');
    const hd=el('div','');
    hd.append(el('div','seo-studio-kicker','OTIMIZAÇÃO DE ANÚNCIOS · TÍTULO SEO'),
      el('h4','','Escolha um título que destaque seu produto'),
      el('p','','4 opções com emojis, análise de estrutura e edição manual antes de salvar.'));
    const badge=el('span','seo-studio-sku','SKU '+(sku||'—'));
    head.append(hd,badge);mount.append(head);
    const note=el('div','seo-studio-alert','Avaliação estimada de estrutura, não pontuação real de vendas. Pesquisa de concorrentes e volume de buscas só aparecem quando verificados; nenhuma garantia de conversão.');
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
      const output=variants(f,inp.value).map(v=>({...v,title:assemble(v)}));
      for(const [i,o] of output.entries()){
        const n=count(o.title),score=rating(o.title,f.kind);
        const card=el('article','seo-studio-card'+(n===LIMIT?' valid':' needs-review'));
        const meta=el('div','seo-studio-card-top');
        const group=el('div','seo-studio-option');
        group.append(el('strong','','0'+(i+1)+' · '+o.name),el('small','',o.subtitle));
        const meter=el('div','seo-studio-meter');
        meter.append(el('strong','',score+'/100'),el('small','','nota estrutural estimada'));
        meta.append(group,meter);card.append(meta);
        card.append(el('p','seo-studio-candidate',o.title));
        const keys=el('div','seo-studio-metrics');
        keys.append(el('span',n===LIMIT?'seo-studio-ok':'seo-studio-caution',n+'/120 caracteres'),
          el('span','','⚡ '+(n===LIMIT?'Pronto para revisão':'Ajustar para 120')));
        card.append(keys,el('p','seo-studio-why',o.reason));
        const actions=el('div','seo-studio-card-actions');
        const choose=el('button','seo-studio-choose','✓ Usar este título');choose.type='button';
        choose.onclick=()=>{
          onChoose(o.title);
          for(const c of grid.querySelectorAll('.seo-studio-card'))c.classList.remove('selected');
          card.classList.add('selected');
          setLabel(status,n===LIMIT?'Título selecionado. Revise e registre a conferência para salvar.':'Título selecionado. Complete os caracteres necessários no campo manual antes de salvar.');
        };
        const copy=el('button','secondary seo-studio-copy','Copiar');copy.type='button';
        copy.onclick=()=>copyText(o.title,status);
        actions.append(choose,copy);card.append(actions);grid.append(card);
      }
    }
    btn.addEventListener('click',regenerate);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();regenerate();}});
    regenerate();
  }
  globalThis.ShopeeTitleStudio={open};
})();