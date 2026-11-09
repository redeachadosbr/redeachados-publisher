"""Fallback to the original first-party Fort image when the site's public thumbnail refuses access."""
from pathlib import Path
def patch_source(path):
    p=Path(path)
    txt=p.read_text(encoding='utf-8')
    old="                r=await client.get(url)\n                if r.status_code!=200:raise ValueError('HTTP '+str(r.status_code))"
    new="""                r=await client.get(url)
                # Only follow the exact official S3 image referenced by the Fort flyer.
                if r.status_code==403 and urlparse(url).hostname=='edge.osuper.com.br' and '/https://' in url:
                    source='https://'+url.split('/https://',1)[1]
                    if urlparse(source).hostname=='osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com':
                        r=await client.get(source)
                if r.status_code!=200:raise ValueError('HTTP '+str(r.status_code))"""
    if new not in txt:
        if old not in txt:raise RuntimeError('Flyer scanner changed; do not alter')
        txt=txt.replace(old,new,1)
    p.write_text(txt,encoding='utf-8')
