"""Check the documented commercial-use product pricing API without altering offers."""
from pathlib import Path
PROBE = '''
@app.post('/api/internal/price-feed-probe')
async def price_feed_probe(request:Request):
    key=os.getenv('OFFER_SCHEDULE_SECRET','').strip()
    supplied=request.headers.get('x-schedule-secret','')
    if len(key)<40 or len(supplied)<40 or not hmac.compare_digest(key,supplied):
        raise HTTPException(401,'Acesso não autorizado')
    from urllib.parse import urlencode
    paths=(
        '/api/product/7896006716112',
        '/api/search?'+urlencode({'q':'arroz'}),
        '/api/search?'+urlencode({'q':'café'}),
    )
    out=[]
    async with httpx.AsyncClient(timeout=15,follow_redirects=False,trust_env=False,
          headers={'User-Agent':'OfertaBlumenau/1.2 (+https://oferta-blumenau-app.onrender.com)',
                   'Accept':'application/json'}) as client:
        for path in paths:
            item={'path':path}
            try:
                r=await client.get('https://www.precomelhor.com.br'+path)
                item['http']=r.status_code
                item['content_type']=r.headers.get('content-type','')[:55]
                item['bytes']=len(r.content)
                if len(r.content)>1500000:raise ValueError('Resposta acima do limite')
                if r.status_code==200 and 'json' in item['content_type']:
                    payload=r.json()
                    item['root_type']=type(payload).__name__
                    if isinstance(payload,dict):
                        item['keys']=list(payload.keys())[:35]
                        item['product']=dict((k,str(v)[:100]) for k,v in (payload.get('product') or {}).items()) if isinstance(payload.get('product'),dict) else None
                        for key in ('prices','results','products','items','data','stores'):
                            seq=payload.get(key)
                            if isinstance(seq,list):
                                item[key+'_length']=len(seq)
                                item[key+'_sample']=seq[:3]
                            elif isinstance(seq,dict):
                                item[key+'_keys']=list(seq.keys())[:20]
                    elif isinstance(payload,list):
                        item['length']=len(payload)
                        item['sample']=payload[:4]
                    item['payload_excerpt']=str(payload)[:2100]
                elif r.status_code!=200:
                    item['status_text']=str(r.text)[:200]
            except Exception as exc:
                item['error']=str(exc)[:180]
            out.append(item)
    return {'ok':True,'data':out,'source':'https://www.precomelhor.com.br/desenvolvedores',
            'disclaimer':'Observações de preço, não promoções e não garantem preço em loja física.'}
'''
def patch_source(server_path):
    p=Path(server_path);s=p.read_text(encoding='utf-8')
    if "@app.post('/api/internal/price-feed-probe')" in s:return
    anchor="'/api/internal/source-probe', '/robots.txt'"
    if anchor not in s:raise RuntimeError('Unknown protected route policy: '+anchor)
    s=s.replace(anchor,"'/api/internal/source-probe', '/api/internal/price-feed-probe', '/robots.txt'",1)
    s+="\n"+PROBE
    p.write_text(s,encoding='utf-8')
