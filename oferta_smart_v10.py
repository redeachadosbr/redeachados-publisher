"""Oferta Blumenau smart network discovery & authenticated coverage diagnostics.

Discovers *references* from public official pages; does not guess or publish prices.
All OCR candidates require separate approval; no WhatsApp scraping.
"""
import ast
import hashlib
import re
import unicodedata
from urllib.parse import urljoin, urlparse

def norm(value):
    s=unicodedata.normalize("NFKD",str(value or ""))
    return re.sub(r"[^a-z0-9]+"," ", "".join(c for c in s if not unicodedata.combining(c)).lower()).strip()

def match_top_blumenau(label, all_stores):
    """Use the real 'Blumenau / store name' selector; reject other cities and duplicates."""
    parts=re.split(r"\s*/\s*", str(label or ""), maxsplit=1)
    if len(parts)!=2 or norm(parts[0])!="blumenau":
        return None
    name=norm(parts[1])
    if not name:
        return None
    matches=[]
    for sid,store in all_stores.items():
        if store.get("rede")!="Rede TOP":
            continue
        candidate_keys={norm(store.get("filial")),norm(store.get("bairro")),
                        norm(store.get("nome"))}
        if name in candidate_keys:
            matches.append(sid)
    return matches[0] if len(matches)==1 else None

def verified_official(url, expected):
    p=urlparse(url)
    return p.scheme=="https" and p.username is None and p.password is None and (
        (p.hostname or "").lower().removeprefix("www.") == expected)

def flyer_ref(network, store_id, title, page_url, asset_url, start, end, stamp, status):
    identifier="|".join((network,str(store_id),asset_url or page_url,title))
    return dict(network=network,store_id=store_id,title=title[:180],
                source_url=page_url,asset_url=asset_url,starts_on=start,ends_on=end,
                status=status,found_at=stamp,
                fingerprint=hashlib.sha256(identifier.encode("utf-8")).hexdigest())

def parse_giassi(html, store_id, source_url, stamp, today, allowed):
    """Capture dated campaign *links* only. Copyrighted artwork is not republished."""
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,"html.parser"); found=[]
    for item in soup.select("a[href]")[:220]:
        target=urljoin(source_url,item.get("href",""))
        if not verified_official(target,"institucional.giassi.com.br") or not allowed(target):
            continue
        path=urlparse(target).path.lower()
        if not re.fullmatch(r"/(?:ofertas[-\w]*|oferta/[-\w]+)",path):
            continue
        context=" ".join(item.parent.get_text(" ",strip=True).split())[:280]
        end_match=re.search(r"válid[oa]\s+até\s+(\d{1,2})/(\d{1,2})/(\d{4})",context,re.I)
        if not end_match:continue
        d,m,y=map(int,end_match.groups())
        try:
            from datetime import date
            ending=date(y,m,d).isoformat()
        except ValueError:
            continue
        if ending<today:continue
        # Publish no price and no inferred campaign start date.
        title=("Giassi — "+item.get_text(" ",strip=True))[:160]
        found.append(flyer_ref("Giassi",store_id,title,source_url,target,None,ending,stamp,"referencia_oficial"))
    return found[:20]

async def parse_top_store_pages(client,html,source_url,all_stores,extract,stamp,allowed):
    """Use only unambiguous store IDs supplied by Rede TOP's *own* dropdown."""
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,"html.parser"); found=[]
    seen=set()
    for option in soup.select("#idloja option[value]")[:150]:
        label=option.get_text(" ",strip=True)
        sid=match_top_blumenau(label,all_stores)
        if not sid:continue
        raw=option.get("value","").strip()
        # Numeric store ID or official path; IDs must come from dropdown.
        if re.fullmatch(r"\d{1,5}",raw):
            target=urljoin(source_url,"/institucional/tabloide-virtual/loja/"+raw+"/")
        elif raw.startswith("/institucional/tabloide-virtual/loja/"):
            target=urljoin(source_url,raw)
        else:
            continue
        if not verified_official(target,"redetop.com.br") or not allowed(target):continue
        if sid in seen:continue
        seen.add(sid)
        try:
            response=await client.get(target)
            if response.status_code!=200 or not verified_official(str(response.url),"redetop.com.br"):continue
            if "html" not in response.headers.get("content-type","").lower():continue
            if len(response.content)>1_500_000:continue
            items=extract(response.text,str(response.url),"Rede TOP",sid)
            found.extend(items[:12])
        except Exception:
            continue
    return found[:65]

def parse_komprao(html,source_url,all_stores,stamp,allowed):
    """Blumenau-wide official Issuu embed; no unverified start/expiry."""
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,"html.parser")
    source_path=urlparse(source_url).path.lower()
    if source_path.rstrip("/")!="/ofertas/blumenau":return []
    ids=[sid for sid,s in all_stores.items() if s.get("rede")=="Komprão" and s.get("cidade")=="Blumenau"]
    out=[]
    for tag in soup.select("a[href],iframe[src]")[:200]:
        target=urljoin(source_url,tag.get("href") or tag.get("src") or "")
        if not verified_official(target,"e.issuu.com") or not allowed(target):continue
        if "/embed.html" not in urlparse(target).path.lower():continue
        label=" ".join(tag.get_text(" ",strip=True).split())
        if not label:label="Encarte digital Komprão Blumenau"
        for sid in ids:
            out.append(flyer_ref("Komprão",sid,label,source_url,target,None,None,stamp,
                                 "referencia_sem_validade"))
    return out[:20]

async def discover_network(client,html,job,url,stores,extract,now,stamp,allowed):
    network=job["network"]
    if network=="Rede TOP" and job.get("store_id") is None:
        return await parse_top_store_pages(client,html,url,stores,extract,stamp,allowed)
    if network=="Komprão":
        return parse_komprao(html,url,stores,stamp,allowed)
    if network=="Giassi" and job.get("store_id"):
        return parse_giassi(html,job["store_id"],url,stamp,now,allowed)
    return []

def patch_source(path):
    from pathlib import Path
    f=Path(path);src=f.read_text(encoding="utf-8")
    if "import oferta_smart_v10" in src:return
    old="import oferta_source_v09\n"
    if src.count(old)!=1:raise RuntimeError("Source import contract changed")
    src=src.replace(old,old+"import oferta_smart_v10\n",1)
    anchor="""                        leaflets += await oferta_source_v09.discover_cooper_magazines(
                            client,html,job,url,today(),iso_now(),host_allowed)"""
    if src.count(anchor)!=1:raise RuntimeError("Cooper scanner contract changed")
    src=src.replace(anchor,anchor+"""
                    leaflets += await oferta_smart_v10.discover_network(
                        client,html,job,url,ALL_STORES,extract_leaflets,today(),iso_now(),host_allowed)""",1)
    # Monitor public Brasil Atacadista first-party magazine endpoints, not only WhatsApp.
    # Generic campaigns do NOT authorize association with a specific Blumenau branch.
    additions = """
# First-party magazine sources (no invented prices or branch assignments).
_original_source_jobs_v11 = source_jobs
def source_jobs():
    yield from _original_source_jobs_v11()
    for extra in (
        'https://brasilatacadista.com.br/encarte/encarte-semanal/',
        'https://brasilatacadista.com.br/encarte/oferta-do-final-de-semana/',
        'https://brasilatacadista.com.br/encarte/hortifruti-e-acougue/',
    ):
        yield {'url':extra,'network':'Brasil Atacadista','store_id':None}
"""
    if "_original_source_jobs_v11 = source_jobs" not in src:
        src += additions
    f.write_text(src,encoding="utf-8")
