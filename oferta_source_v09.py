"""Official supermarket flyer discovery; strict OCR candidates with human review only."""
from __future__ import annotations

import ast
import hashlib
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse


_PRODUCT_PRICE = re.compile(r'(?<![\d,.])(?:R\$\s*)?(\d{1,4},\d{2})(?!\d)')
_PACK = re.compile(r'(?<!\w)(?:\d+\s*[x×]\s*)?\d+(?:[,.]\d+)?\s*(?:kg|g|ml|l|un(?:id(?:ades?)?)?)\b',re.I)
_NOISE = re.compile(r'(?i)\b(?:leve\s*\d|pague\s*\d|2[ªa]\s*unidade|desconto|por cento|cupom|parcel|frete|taxa|cadastro|club[e]?|app|pelo aplicativo|a cada 100\s*g|compre\s*\d)\b|%|\b(?:de|por)\s*R\$')

def high_precision_candidates(text: str, store_id: str, source_url: str, start: str | None, end: str | None, current_date: str):
    """Never guess dates or merge adjacent products; OCR candidates ALWAYS need review."""
    if not start or not end or not (start <= current_date <= end):
        return []
    result, seen = [], set()
    for raw in text.splitlines()[:5000]:
        line = ' '.join(raw.split())
        if not 13 <= len(line) <= 175 or _NOISE.search(line):
            continue
        matches = list(_PRODUCT_PRICE.finditer(line))
        if len(matches) != 1:
            continue
        price_match = matches[0]
        packages = list(_PACK.finditer(line[:price_match.start()]))
        if len(packages) != 1:
            continue
        package_match = packages[0]
        name = line[:package_match.start()].strip(' -:/,.;')
        suffix = line[package_match.end():price_match.start()].strip(' -:/,.;')
        if suffix or not (7 <= len(name) <= 120) or not re.search(r'[A-Za-zÀ-ÿ]{3}', name):
            continue
        if re.search(r'(?i)\b(?:válid[oa]|preço|economia|ofertas?|novembro|dezembro|categoria)\b', name):
            continue
        price = round(float(price_match.group(1).replace(',','.')),2)
        if price is None or price > 5000:
            continue
        pack = package_match.group(0).strip()
        key = (name.casefold(), pack.casefold(), price)
        if key in seen:
            continue
        seen.add(key)
        result.append({'store_id':store_id,'name':name,'brand':'','package':pack,
                       'price':price,'source_url':source_url,'starts_on':start,
                       'ends_on':end,'image_url':'','category':'Outros',
                       'condition':'Pendente de conferência: preço extraído de encarte'})
        if len(result) >= 75:
            break
    return result

async def discover_cooper_magazines(client, html: str, job: dict, page_url: str,
                                    current_date: str, found_at: str, is_allowed):
    """Follow dated store-specific official magazines and register exact page images.

    No guessed magazine IDs or images; does nothing if the source refuses public access.
    """
    if job.get('network') != 'Cooper' or not job.get('store_id'):
        return []
    from bs4 import BeautifulSoup
    import daily_collect
    soup = BeautifulSoup(html, 'html.parser')
    out, seen = [], set()
    for a in soup.select('a[href]')[:180]:
        label = ' '.join(a.get_text(' ', strip=True).split())[:180]
        start, end = daily_collect.parse_date_span(label)
        if not start or not end or end < current_date or start > end:
            continue
        target = urljoin(page_url, a.get('href',''))
        target_host = (urlparse(target).hostname or '').removeprefix('www.')
        if target_host != 'cooper.coop.br' or urlparse(target).path.rstrip('/') != '/revista' or not is_allowed(target):
            continue
        if target in seen:
            continue
        seen.add(target)
        try:
            response = await client.get(target)
            final = urlparse(str(response.url))
            if response.status_code != 200 or (final.hostname or '').removeprefix('www.') != 'cooper.coop.br':
                continue
            if 'html' not in response.headers.get('content-type','').lower() or len(response.content) > 1_500_000:
                continue
            magazine = BeautifulSoup(response.text,'html.parser')
            pages = []
            for img in magazine.select('img[src],img[data-src]'):
                path = img.get('src') or img.get('data-src') or ''
                asset = urljoin(str(response.url), path)
                parsed = urlparse(asset)
                if (parsed.hostname or '').removeprefix('www.') != 'cooper.coop.br' or not is_allowed(asset):
                    continue
                m = re.fullmatch(r'/revista/imagens/\d{1,8}/(\d{1,2})\.(?:jpg|jpeg|png)', parsed.path, re.I)
                if not m:
                    continue
                pages.append((int(m.group(1)),asset))
            for page,asset in sorted(set(pages))[:16]:
                fp = hashlib.sha256(f"Cooper|{job['store_id']}|{asset}".encode()).hexdigest()
                out.append({'network':'Cooper','store_id':job['store_id'],
                            'title':f'{label} — página {page}', 'source_url':target,
                            'asset_url':asset,'starts_on':start,'ends_on':end,
                            'status':'coletado_validacao_pendente','found_at':found_at,
                            'fingerprint':fp})
        except Exception:
            continue
        if len(out) >= 48:
            break
    return out

def _replace_function(src: str, function_name: str, replacement: str) -> str:
    module = ast.parse(src)
    nodes = [n for n in module.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name == function_name]
    if len(nodes) != 1:
        raise RuntimeError(f'Backend function contract changed: {function_name} ({len(nodes)})')
    node = nodes[0]
    lines = src.splitlines(keepends=True)
    return ''.join(lines[:node.lineno-1])+replacement.strip('\n')+'\n'+''.join(lines[node.end_lineno:])

STRICT_DETECT = '''
def detect_candidate_lines(text: str, store_id: str, source_url: str, start, end):
    # OCR is evidence for pending review, NEVER an approved retail price.
    return oferta_source_v09.high_precision_candidates(text,store_id,source_url,
                                                       start,end,today())
'''

STRICT_SCAN = '''
async def scan_leaflets(limit: int = 8):
    """Read only authentic official images; retry transient blocks once per day."""
    current=today()
    with session() as c:
        rows=c.execute("""SELECT * FROM leaflets
          WHERE store_id IS NOT NULL AND asset_url IS NOT NULL
          AND (status='coletado_validacao_pendente' OR status='ocr_falhou'
               OR (status LIKE 'ocr_bloqueado_%' AND status<>?)
               OR (status LIKE 'ocr_erro_%' AND status<>?))
          ORDER BY CASE WHEN status='coletado_validacao_pendente' THEN 0 ELSE 1 END,
                   id DESC LIMIT 600""",('ocr_bloqueado_'+current,'ocr_erro_'+current)).fetchall()
        eligible=[dict(r) for r in rows if actual_flyer(dict(r))]
        rows=eligible[:max(0,min(int(limit),8))]
    result={'checked':0,'read':0,'failed':0,'new_candidates':0,'details':[]}
    async with httpx.AsyncClient(timeout=22,follow_redirects=False,trust_env=False,
      headers={'User-Agent':'OfertaBlumenau/0.9 (official public flyer; human-reviewed prices)',
               'Accept':'image/webp,image/jpeg,image/png,application/pdf'}) as client:
        for item in rows:
            url=item['asset_url']; result['checked']+=1
            if item.get('ends_on') and item['ends_on']<current:
                with session() as c:c.execute('UPDATE leaflets SET status=? WHERE id=?',('encarte_vencido_ignorado',item['id']))
                result['details'].append({'id':item['id'],'result':'vencido'})
                continue
            if not item.get('starts_on') or not item.get('ends_on'):
                with session() as c:c.execute('UPDATE leaflets SET status=? WHERE id=?',('ocr_sem_validade',item['id']))
                result['details'].append({'id':item['id'],'result':'sem_validade'})
                continue
            error_status='ocr_erro_'+current
            try:
                if not host_allowed(url):raise ValueError('Domínio do documento não autorizado')
                r=await client.get(url)
                if r.status_code==403 and urlparse(url).hostname=='edge.osuper.com.br' and '/https://' in url:
                    original='https://'+url.split('/https://',1)[1]
                    if urlparse(original).hostname=='osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com':
                        r=await client.get(original)
                if r.status_code in (401,403,429):
                    error_status='ocr_bloqueado_'+current
                if r.status_code!=200:raise ValueError('HTTP '+str(r.status_code))
                raw=r.content
                if len(raw)>MAX_IMAGE_BYTES:raise ValueError('Documento acima do limite de 8 MB')
                if raw.startswith(b'%PDF-'):ext='.pdf'
                elif raw[:2]==bytes([255,216]):ext='.jpg'
                elif raw[:8]==bytes([137,80,78,71,13,10,26,10]):ext='.png'
                elif raw[:4]==b'RIFF' and raw[8:12]==b'WEBP':ext='.webp'
                else:raise ValueError('Resposta sem assinatura de imagem/PDF')
                text,method=await asyncio.to_thread(read_brochure,raw,'encarte'+ext)
                found=detect_candidate_lines(text,item['store_id'],item['source_url'],item['starts_on'],item['ends_on'])
                inserted=insert_candidates(found) if found else 0
                with session() as c:c.execute('UPDATE leaflets SET status=? WHERE id=?',
                                             ('ocr_lido' if found else 'ocr_sem_produtos',item['id']))
                result['read']+=1;result['new_candidates']+=inserted
                result['details'].append({'id':item['id'],'result':'lido','method':method,'pending':inserted})
            except Exception as exc:
                with session() as c:c.execute('UPDATE leaflets SET status=? WHERE id=?',(error_status,item['id']))
                result['failed']+=1
                result['details'].append({'id':item['id'],'result':'erro',
                                          'detail':str(exc)[:110],
                                          'retry':'dia seguinte' if error_status.startswith('ocr_bloqueado_') else 'agendado'})
            await asyncio.sleep(.4)
    return result
'''

def patch_source(server_path: str):
    p=Path(server_path);source=p.read_text(encoding='utf-8')
    if 'import oferta_source_v09' in source:
        return
    old='import daily_collect\n'
    if source.count(old)!=1:
        raise RuntimeError('Daily collector import moved; abort')
    source=source.replace(old,old+'import oferta_source_v09\n',1)
    source=_replace_function(source,'detect_candidate_lines',STRICT_DETECT)
    source=_replace_function(source,'scan_leaflets',STRICT_SCAN)
    # Only canonical redirects on the same official website are permitted.
    old="async with httpx.AsyncClient(timeout=14, follow_redirects=False, headers={"
    new="async with httpx.AsyncClient(timeout=14, follow_redirects=True, max_redirects=3, headers={"
    if old not in source:
        raise RuntimeError('Source scanner client contract changed; abort')
    source=source.replace(old,new,1)
    old="if resp.status_code!=200: raise ValueError('HTTP '+str(resp.status_code))"
    new="""if resp.status_code!=200: raise ValueError('HTTP '+str(resp.status_code))
                        if (urlparse(str(resp.url)).hostname or '').removeprefix('www.') != (urlparse(url).hostname or '').removeprefix('www.'):
                            raise ValueError('Fonte redirecionada para domínio diferente')"""
    if old not in source:
        raise RuntimeError('Response status anchor changed; abort')
    source=source.replace(old,new,1)
    old="leaflets=extract_leaflets(html,url,job['network'],job['store_id'])"
    new="""leaflets=extract_leaflets(html,url,job['network'],job['store_id'])
                    if job['network']=='Cooper' and job['store_id']:
                        leaflets += await oferta_source_v09.discover_cooper_magazines(
                            client,html,job,url,today(),iso_now(),host_allowed)"""
    if old not in source:
        raise RuntimeError('Network-specific magazine anchor changed; abort')
    source=source.replace(old,new,1)
    p.write_text(source,encoding='utf-8')
