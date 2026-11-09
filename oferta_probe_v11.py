"""Restricted network source diagnostics; limited to fixed first-party public pages."""
import re
from pathlib import Path
PROBE = '''
@app.post('/api/internal/source-probe')
async def source_probe(request: Request):
    key=os.getenv('OFFER_SCHEDULE_SECRET','').strip()
    supplied=request.headers.get('x-schedule-secret','')
    if len(key)<40 or len(supplied)<40 or not hmac.compare_digest(key,supplied):
        raise HTTPException(status_code=401,detail='Acesso não autorizado')
    targets={
      'TOP': 'https://www.redetop.com.br/institucional/tabloide-virtual/',
      'TOP_PDF': 'https://www.redetop.com.br/institucional/ofertas.php',
      'Komprão':'https://komprao.com.br/ofertas/blumenau/',
      'Giassi':'https://institucional.giassi.com.br/ofertas',
      'Brasil':'https://brasilatacadista.com.br/encarte/oferta-do-final-de-semana/',
      'Brasil_WA':'https://brasilatacadista.com.br/whatsapp/',
      'Unibox':'https://www.uniboxdinardelli.com.br/ofertas/',
      'Fort':'https://www.fortatacadista.com.br/encartes/sc/blumenau/blumenau-480'
    }
    out=[]
    async with httpx.AsyncClient(timeout=13,follow_redirects=False,trust_env=False,
         headers={'User-Agent':'OfertaBlumenau/1.1 (source diagnostics; official URLs only)',
                  'Accept':'text/html,application/xhtml+xml'}) as client:
        for net,url in targets.items():
            row={'network':net}
            try:
                r=await client.get(url)
                row['status']=r.status_code
                row['type']=r.headers.get('content-type','')[:70]
                row['bytes']=len(r.content)
                if r.status_code==200 and 'html' in row['type'] and len(r.content)<1_600_000:
                    from bs4 import BeautifulSoup
                    doc=BeautifulSoup(r.text,'html.parser')
                    row['selects']=[{'name':a.get('name'), 'id':a.get('id'),
                         'options':[{'v':o.get('value','')[:50],'label':o.get_text(' ',strip=True)[:70]}
                                     for o in a.select('option')[:22]]}
                                   for a in doc.select('select')[:5]]
                    row['links']=[{'text':a.get_text(' ',strip=True)[:65],
                                   'href':str(a.get('href') or '')[:170]}
                                  for a in doc.select('a[href]') if
                                  any(t in (a.get_text(' ',strip=True)+' '+str(a.get('href',''))).lower()
                                  for t in ('pdf','tabloide','encarte','ofertas','embed','issuu','revista'))][:25]
                    row['images']=[{'alt':im.get('alt','')[:90], 'src':str(im.get('src') or '')[:160]}
                                   for im in doc.select('img[src]')[:5]]
                    row['iframes']=[str(x.get('src') or '')[:160] for x in doc.select('iframe[src]')[:5]]
                    row['forms']=[{'action':x.get('action','')[:120],'method':x.get('method','')[:15]}
                                  for x in doc.select('form')[:5]]
                    row['js']=[str(x.get('src') or '')[:140] for x in doc.select('script[src]')[-5:]]
            except Exception as exc:
                row['error']=str(exc)[:100]
            out.append(row)
    return {'ok':True,'sources':out}
'''
def patch_source(path):
    p=Path(path);s=p.read_text(encoding='utf-8')
    if "@app.post('/api/internal/source-probe')" in s:return
    anchor="'/api/internal/ingest', '/robots.txt'"
    if anchor not in s:raise RuntimeError('Private source auth anchor moved')
    s=s.replace(anchor,"'/api/internal/ingest', '/api/internal/source-probe', '/robots.txt'",1)
    s+="\n"+PROBE
    p.write_text(s,encoding='utf-8')
