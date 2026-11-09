"""Discover structured public product offers; always submit to manual review."""
from __future__ import annotations
import json,re
from datetime import datetime
from urllib.parse import urlparse
from bs4 import BeautifulSoup
PACK=re.compile(r'(?<!\w)(?:\d+\s*[x×]\s*)?\d+(?:[,.]\d+)?\s*(?:kg|g|ml|l|un(?:id(?:ades?)?)?)\b',re.I)
def price(v):
    if isinstance(v,(int,float)):p=float(v)
    elif isinstance(v,str):
        s=re.sub(r'[^\d,.]','',v)
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


MONTHS={'JAN':1,'FEV':2,'MAR':3,'ABR':4,'MAI':5,'JUN':6,'JUL':7,'AGO':8,'SET':9,'OUT':10,'NOV':11,'DEZ':12}
def parse_date_span(text):
    """Return dates only when the promotion explicitly names month and year."""
    import datetime as dt
    # Existing common notation, e.g. 28/10 a 10/11/2026.
    m=re.search(r'(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s*(?:a|até|-|–)\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})',text,re.I)
    if m:
        a,b,y1,c,d,y2=m.groups()
        y2=int(y2);y2=2000+y2 if y2<100 else y2
        y1=int(y1) if y1 else y2;y1=2000+y1 if y1<100 else y1
        try:return dt.date(y1,int(b),int(a)).isoformat(),dt.date(y2,int(d),int(c)).isoformat()
        except ValueError:pass
    # "30 a 15_OUT_NOV_26" crosses the month boundary.
    m=re.search(r'(?<!\d)(\d{1,2})\s*(?:a|e|[-_])\s*(\d{1,2})[_\s-]*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[_\s-]+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[_\s-]*(\d{2,4})',text,re.I)
    if m:
        a,c,m1,m2,yy=m.groups();yy=int(yy);yy=2000+yy if yy<100 else yy
        try:return dt.date(yy,MONTHS[m1.upper()],int(a)).isoformat(),dt.date(yy,MONTHS[m2.upper()],int(c)).isoformat()
        except ValueError:pass
    m=re.search(r'(?<!\d)(\d{1,2})\s*(?:a|e|[-_])\s*(\d{1,2})[_\s-]*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[_\s-]*(\d{2,4})',text,re.I)
    if m:
        a,c,mon,yy=m.groups();yy=int(yy);yy=2000+yy if yy<100 else yy
        try:return dt.date(yy,MONTHS[mon.upper()],int(a)).isoformat(),dt.date(yy,MONTHS[mon.upper()],int(c)).isoformat()
        except ValueError:pass
    return None,None
