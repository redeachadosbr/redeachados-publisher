// Referências visuais do ANÚNCIO confirmado na Shopee, nunca de SKU vizinha.
// Retorna URLs oficiais sem misturar imagens preparadas de outras posições.
// Os domínios são limitados aos CDNs de origem já usados pelo Manager.
export function visualReferenceCandidates(input=[]){
 const output=[],seen=new Set();
 const add=value=>{
  try{
   const url=new URL(String(value||''));
   const host=url.hostname.toLowerCase();
   const approved=host==='cf.shopee.com.br'||
    host==='down-br.img.susercontent.com'||
    host==='wedrop-products-images.nyc3.cdn.digitaloceanspaces.com'||
    host==='shopee.com.br'||host.endsWith('.susercontent.com');
   if(url.protocol!=='https:'||url.username||url.password||url.port||!approved)return;
   const normalized=url.toString();
   if(!seen.has(normalized)){seen.add(normalized);output.push(normalized);}
  }catch{}
 };
 for(const candidate of Array.isArray(input)?input:[]){
  try{
   const u=new URL(String(candidate||''));
   // A imagem oficial publicada em cf.shopee.com.br também é distribuída
   // pelo CDN de mídia. Testar o domínio de imagem direto ANTES do cf,
   // que em algumas extensões retorna conteúdo inválido ao anexar.
   if(u.protocol==='https:'&&u.hostname==='cf.shopee.com.br'&&
      /^\/file\/[A-Za-z0-9_-]{8,190}$/.test(u.pathname))
    add('https://down-br.img.susercontent.com'+u.pathname);
  }catch{}
  add(candidate);
 }
 return output.slice(0,8);
}
// A Ponte para anúncios individuais recebe SOMENTE fotos do Item ID Shopee.
// Fotos da WeDrop continuam disponíveis para a prévia e os prompts, mas
// podem ser rejeitadas pela validação de origem da extensão Chrome.
export function bridgeShopeeReferenceCandidates(shopeeItemPhotos=[]){
 const refs=visualReferenceCandidates(shopeeItemPhotos);
 const official=refs.filter(value=>{
  try{
   const url=new URL(value),host=url.hostname.toLowerCase();
   return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
    (host==='cf.shopee.com.br'||host==='down-br.img.susercontent.com'||
     host.endsWith('.susercontent.com'));
  }catch{return false;}
 });
 // Preferir o endereço cf.shopee.com.br que a extensão identifica como
 // origem Shopee; a variante CDN é retentada apenas em caso de recusa.
 return official.sort((a,b)=>{
  const priority=url=>{
   const host=new URL(url).hostname;
   return host==='cf.shopee.com.br'?0:
    host==='down-br.img.susercontent.com'?1:2;
  };
  return priority(a)-priority(b);
 }).slice(0,6);
}

export function isVisualReferenceError(message){
 return /fotografia original fora da shopee|(?:foto|imagem|fotografia)[^\n]{0,80}fora da shopee|refer[eê]ncia visual inv[aá]lida|(?:refer[eê]ncia|foto|imagem)[^\n]{0,80}(?:inv[aá]lida|n[aã]o (?:carrega|abre|recebida))|invalid (?:visual |image )?reference/i
  .test(String(message||''));
}
