"""Discover structured public product offers; always submit to manual review."""
from __future__ import annotations
import json,re
from datetime import datetime
from urllib.parse import urlparse
from bs4 import BeautifulSoup
PACK=re.compile(r'(?<!\\w)(?:\\d+\\s*[x×]\\s*)?\\d+(?:[,.]\\d+)?\\s*(?:kg|g|ml|l|un(?:id(?:ades?)?)?)\\b',re.I)
def price(v):
    if isinstance(v,(int,float)):p=float(v)
    elif isinstance(v,str):
        s=re.sub(r'[^\\d,.]','',v)
        if not s:return None
        if '.' in s and ',' in s:p=float(s.replace('.','').replace(',','.')) if s.rfind(',')>s.rfind('.') else float(s.replace(',',''))
        elif ',' in s:p=float(s.replace(',','.'))
        else:p=float(s)
    else:return None
    return round(p,2) if 0<p<=10000 else None
def nodes(v):
    if isinstance(v,list):
        for x in v:yield from nodes(x)
    elif isinstance(v,dict):
        typ=v.get('@type',[])
        if isinstance(typ,str):typ=[typ]
        if 'Product' in typ or any(str(x).endswith('/Product') for x in typ):yield v
        for key in ('@graph','itemListElement','mainEntity','item','hasPart'):
            if key in v:yield from nodes(v[key])
def date_value(v):
    if not isinstance(v,str):return None
    try:return datetime.strptime(v.strip()[:10],'%Y-%m-%d').date().isoformat()
    except ValueError:return None
def extract_structured_candidates(html,store_id,source_url,current_date):
    if not store_id:return []
    soup=BeautifulSoup(html,'html.parser');out=[];seen=set()
    for script in soup.select('script[type="application/ld+json"]')[:50]:
        try:data=json.loads(script.string or script.get_text())
        except (ValueError,TypeError):continue
        for product in nodes(data):
            name=str(product.get('name') or '').strip()
            if not 7<=len(name)<=180:continue
            size=product.get('size') or product.get('weight') or ''
            match=PACK.search(name)
            pack=match.group(0) if match else str(size).strip()
            if not PACK.search(pack):continue
            offers=product.get('offers') or []
            if isinstance(offers,dict):offers=[offers]
            if not isinstance(offers,list):continue
            for offer in offers[:5]:
                if not isinstance(offer,dict):continue
                p=price(offer.get('price'))
                if p is None or offer.get('priceCurrency') not in (None,'BRL'):continue
                start=date_value(offer.get('validFrom') or offer.get('priceValidFrom'))
                end=date_value(offer.get('priceValidUntil') or offer.get('validThrough'))
                if end and end<current_date:continue
                img=product.get('image') or ''
                if isinstance(img,list):img=img[0] if img else ''
                if isinstance(img,dict):img=img.get('url') or ''
                img=str(img)
                if not img.startswith('https://') or urlparse(img).hostname!=urlparse(source_url).hostname:img=''
                brand=product.get('brand') or ''
                if isinstance(brand,dict):brand=brand.get('name') or ''
                key=(name.casefold(),pack.casefold(),p)
                if key in seen:continue
                seen.add(key)
                out.append({'store_id':store_id,'name':name,'brand':str(brand)[:80],
                            'package':pack[:80],'price':p,'source_url':source_url,
                            'starts_on':start,'ends_on':end,'image_url':img,
                            'category':'Outros','condition':'Verificar condições da loja'})
                if len(out)>=80:return out
    return out
