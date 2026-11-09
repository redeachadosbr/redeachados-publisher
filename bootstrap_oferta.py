"""Build Oferta Blumenau from the committed v0.4 archive + v0.5 state bridge."""
from pathlib import Path
import base64
import io
import lzma
import ast
import tarfile
import zlib

root = Path(__file__).resolve().parent
archive = lzma.decompress(base64.b64decode((root/'oferta-blumenau-bundle.b64').read_bytes()))
folder = root/'oferta-blumenau'
folder.mkdir(parents=True, exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
    tar.extractall(path=folder, filter='data')
bridge = zlib.decompress(base64.b64decode((root/'oferta-blumenau-remote.z64').read_bytes()))
(folder/'remote_state.py').write_bytes(bridge)
source=ast.parse(bridge.decode('utf-8'))
patch=next(node for node in source.body if isinstance(node,ast.FunctionDef) and node.name=='patch_source')
namespace={}
exec(compile(ast.Module(body=[patch],type_ignores=[]),'<remote-bridge-patch>','exec'),namespace)
namespace['patch_source'](str(folder/'server.py'))
# Install safe scheduled scanner and structured review-only product discovery.
(folder/'daily_collect.py').write_text((root/'daily_collect.py').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'daily_upgrade.py').write_text((root/'daily_upgrade.py').read_text(encoding='utf-8'),encoding='utf-8')
import runpy
runpy.run_path(str(folder/'daily_upgrade.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(folder/'server.py'))
# Show genuine flyer images and filter misidentified navigation links.
(folder/'upgrade_v07.py').write_bytes(base64.b64decode((root/'oferta-upgrade-v07.b64').read_text(encoding='ascii')))
runpy.run_path(str(folder/'upgrade_v07.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(folder/'server.py'))
# Optional Portuguese image OCR, using open-source JS instead of a paid API.
(folder/'ocr_fallback.cjs').write_text((root/'ocr_fallback.cjs').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'upgrade_v08.py').write_text((root/'upgrade_v08.py').read_text(encoding='utf-8'),encoding='utf-8')
runpy.run_path(str(folder/'upgrade_v08.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(folder/'server.py'))
import subprocess
try:
    npm=subprocess.run(['npm','install','--prefix',str(folder),'--no-audit','--no-fund','--save-exact','tesseract.js@7.0.0'],
                       capture_output=True,text=True,timeout=105,check=False)
    print('OCR_DEPENDENCY_READY' if npm.returncode==0 else 'OCR_DEPENDENCY_UNAVAILABLE')
except (OSError,subprocess.TimeoutExpired):
    print('OCR_DEPENDENCY_UNAVAILABLE')
# TEMP: compare publicly accessible document dimensions; non-fatal read-only diagnostics.
def _probe_flyer_dimensions():
    import urllib.request
    sources = [
      ('fort_s3_original','https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/7e0f74bb-scfortseara30-a-15outnov26regionalpage0001.jpg'),
      ('fort_edge_330','https://edge.osuper.com.br/gMFkOVCCFUvqq5-8xILDj1fP_wo=/0x330/smart/https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/7e0f74bb-scfortseara30-a-15outnov26regionalpage0001.jpg'),
      ('other_copy_481894_candidate','https://na.leafletscdn.com/com.br/data/119/481894/0.jpg'),
      ('other_copy_479765_known','https://na.leafletscdn.com/com.br/data/119/479765/0.jpg')
    ]
    def size(b):
      if b.startswith(b'\x89PNG') and len(b)>24:
        return (int.from_bytes(b[16:20],'big'),int.from_bytes(b[20:24],'big'))
      if not b.startswith(b'\xff\xd8'):return None
      p=2
      while p<len(b)-12:
        if b[p]!=0xff:p+=1;continue
        while p<len(b) and b[p]==0xff:p+=1
        if p>=len(b):break
        k=b[p];p+=1
        if k==0xd9 or k==0xda:break
        if k in [0xd8,0x01] or 0xd0<=k<=0xd7:continue
        if p+2>len(b):break
        n=int.from_bytes(b[p:p+2],'big')
        if k in [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf] and p+7<len(b):
          return (int.from_bytes(b[p+5:p+7],'big'),int.from_bytes(b[p+3:p+5],'big'))
        p+=max(2,n)
      return None
    for name,url in sources:
      try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 OfertaBlumenau diagnostic','Accept':'image/jpeg,image/png,image/webp'})
        with urllib.request.urlopen(req,timeout=6) as resp:
          data=resp.read(500000)
          print('OB_IMAGE_PROBE',name,'status',resp.status,'content_type',resp.headers.get('Content-Type'),'bytes_seen',len(data),'total_bytes',resp.headers.get('Content-Length'),'dimensions',size(data))
      except Exception as e:
        print('OB_IMAGE_PROBE',name,'error',str(e)[:160])
_probe_flyer_dimensions()
# Further non-fatal candidate check: official resized transform and current alternate HTML.
import re as _qr
from urllib.error import HTTPError as _Http
from urllib.parse import urlparse as _parse
import urllib.request as _ur
_qs=[
 ('fort_resize_1100','https://edge.osuper.com.br/gMFkOVCCFUvqq5-8xILDj1fP_wo=/0x1100/smart/https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/7e0f74bb-scfortseara30-a-15outnov26regionalpage0001.jpg'),
 ('fort_resize_0','https://edge.osuper.com.br/gMFkOVCCFUvqq5-8xILDj1fP_wo=/0x0/smart/https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/7e0f74bb-scfortseara30-a-15outnov26regionalpage0001.jpg'),
 ('portafolhetos_food_09nov','https://www.portafolhetos.com.br/fort-atacadista/fort-atacadista-ofertas-food-service-de-segunda-feira-09-11-2026-481894/'),
 ('kimbino_food_09nov','https://www.kimbino.com.br/fort-atacadista/fort-atacadista-ofertas-food-service-de-segunda-feira-09-11-2026-6481894/'),
 ('brcatalogos_fort','https://brcatalogos.com.br/fort/ofertas-a-maior-black-blumenau-indaial-e-jaragua-do-sul'),
]
for _label,_url in _qs:
 try:
  _request=_ur.Request(_url,headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36','Accept':'text/html,image/avif,image/webp,image/apng,image/*,*/*'})
  with _ur.urlopen(_request,timeout=6) as _reply:
   _response=_reply.read(400000)
   _ct=_reply.headers.get('Content-Type','')
   _txt=_response.decode('utf-8','ignore') if 'html' in _ct else ''
   _found=_qr.findall(r'https?[^"\s<>]{0,230}(?:leafletscdn|kimbicdn|pdf|\.jpg|\.webp)[^"\s<>]{0,200}',_txt,_qr.I)
   _og=_qr.findall(r'<meta[^>]+(?:og:image|twitter:image)[^>]+>',_txt,_qr.I)
   print('OB_IMAGE_COMPARE',_label,'status',_reply.status,'ctype',_ct,'bytes',len(_response),'possible_assets',str(_found[:4])[:650],'meta',str(_og[:2])[:350])
 except Exception as _e:
  print('OB_IMAGE_COMPARE',_label,'error',str(_e)[:160])
# Actual image candidates extracted from the HTML above: check size, not just URL existence.
def _image_size_from_bytes(b):
    if b.startswith(b'\xff\xd8'):
        i=2
        while i+9<len(b):
            if b[i]!=0xff:i+=1;continue
            i+=1
            while i<len(b) and b[i]==0xff:i+=1
            if i>=len(b):break
            marker=b[i];i+=1
            if marker in (0xda,0xd9):break
            if marker in (0x01,0xd8) or 0xd0<=marker<=0xd7:continue
            n=int.from_bytes(b[i:i+2],'big')
            if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf) and i+7<len(b):
                return int.from_bytes(b[i+5:i+7],'big'),int.from_bytes(b[i+3:i+5],'big')
            i+=max(2,n)
    if b[:4]==b'RIFF' and b[8:12]==b'WEBP':
        typ=b[12:16]
        if typ==b'VP8X' and len(b)>30:
            return 1+int.from_bytes(b[24:27],'little'),1+int.from_bytes(b[27:30],'little')
        if typ==b'VP8L' and len(b)>25:
            v=int.from_bytes(b[21:25],'little');return (v&0x3fff)+1,((v>>14)&0x3fff)+1
        if typ==b'VP8 ' and len(b)>30 and b[23:26]==b'\x9d\x01\x2a':
            return int.from_bytes(b[26:28],'little')&0x3fff,int.from_bytes(b[28:30],'little')&0x3fff
    return None
_accurate=[
 ('food09_kimbino','https://na.kimbicdn.com/thumbor/eNxItp9pR-pRyUCiagPWp0wtDtY=/0x0/filters:format(webp):quality(65)/com.br/data/119/481894/0.jpg'),
 ('food09_portafolhetos','https://na.leafletscdn.com/thumbor/eNxItp9pR-pRyUCiagPWp0wtDtY=/0x0/filters:format(webp):quality(65)/com.br/data/119/481894/0.jpg'),
 ('fort_2026_food_old','https://na.leafletscdn.com/thumbor/uKBkWQZ7D8JHmDzz0ks2-C92X9Y=/0x0/filters:format(webp):quality(65)/com.br/data/119/479765/0.jpg'),
]
for _label,_url in _accurate:
 try:
  _req=_ur.Request(_url,headers={'User-Agent':'Mozilla/5.0','Accept':'image/webp,image/jpeg,*/*'})
  with _ur.urlopen(_req,timeout=9) as _rp:
   _data=_rp.read(600000)
   print('OB_IMAGE_SIZE',_label,'status',_rp.status,'type',_rp.headers.get('Content-Type'),'size',_image_size_from_bytes(_data),'content_length',_rp.headers.get('Content-Length'),'bytes_sampled',len(_data))
 except Exception as _ex:print('OB_IMAGE_SIZE',_label,'error',str(_ex)[:120])
# Compare other campaigns from the same publisher without assuming the regional edition matches.
import html as _html_entities
for _tag,_url in [
 ('food09','https://www.portafolhetos.com.br/fort-atacadista/fort-atacadista-ofertas-food-service-de-segunda-feira-09-11-2026-481894/'),
 ('brf09','https://www.portafolhetos.com.br/fort-atacadista/fort-atacadista-ofertas-brf-de-segunda-feira-09-11-2026-481895/'),
 ('seara30','https://www.portafolhetos.com.br/fort-atacadista/fort-atacadista-ofertas-seara-de-sexta-feira-30-10-2026-479115/')
]:
 try:
  _rq=_ur.Request(_url,headers={'User-Agent':'Mozilla/5.0','Accept':'text/html'})
  with _ur.urlopen(_rq,timeout=8) as _rp:_source=_rp.read(350000).decode('utf-8','replace')
  _meta=_qr.search(r'<meta[^>]*property="og:image"[^>]*>',_source,_qr.I)
  _full=_html_entities.unescape(_meta.group(0)) if _meta else ''
  _uri=_qr.search(r'content="(https://[^"]+)"',_full)
  _candidate=_uri.group(1) if _uri else None
  _p1=_qr.findall(r'[^"<> ]{0,150}'+('481894' if _tag=='food09' else '481895' if _tag=='brf09' else '479115')+r'/1\.jpg[^"<> ]{0,40}',_source,_qr.I)
  if not _candidate:print('OB_ALT_CATALOG',_tag,'html_found','image_unknown');continue
  _irq=_ur.Request(_candidate,headers={'User-Agent':'Mozilla/5.0','Accept':'image/webp,image/jpeg'})
  with _ur.urlopen(_irq,timeout=8) as _img:_ib=_img.read(650000)
  print('OB_ALT_CATALOG',_tag,'size',_image_size_from_bytes(_ib),'bytes',len(_ib),'url',_candidate,'page2_urls',str(_p1[:2])[:250])
 except Exception as _exc:
  print('OB_ALT_CATALOG',_tag,'error',str(_exc)[:170])
# END TEMP diagnostic.
# Enforce consistent login form/server policy and accurate authentication errors.
(folder/'fix_login.py').write_text((root/'fix_login.py').read_text(encoding='utf-8'),encoding='utf-8')
runpy.run_path(str(folder/'fix_login.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(folder/'server.py'))
# Update the old SQLite-only warning: state is now stored in Supabase.
page=folder/'static/index.html'
html=page.read_text(encoding='utf-8')
html=html.replace('o servidor pode reiniciar e perder ofertas cadastradas. Exporte uma cópia depois de cada atualização importante.',
                  'as ofertas cadastradas ficam salvas no Supabase mesmo após reiniciar. Exporte backups periodicamente como proteção extra.')
# Premium 3D interface: additive CSS/JS; never change authenticated API or price records.
(folder/'static/ob-premium.css').write_text((root/'oferta-premium-visual.css').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-premium.js').write_text((root/'oferta-premium-vitrine.js').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-premium-v3.css').write_text((root/'oferta-premium-v3.css').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-flyer-gallery-v6.css').write_text((root/'oferta-flyer-gallery-v6.css').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-flyer-gallery-v6.js').write_text((root/'oferta-flyer-gallery-v6.js').read_text(encoding='utf-8'),encoding='utf-8')
if '/static/ob-premium.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-premium.css?v=20261109"></head>')
if '/static/ob-premium-v3.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-premium-v3.css?v=20261109v3"></head>')
if '/static/ob-flyer-gallery-v6.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-flyer-gallery-v6.css?v=20261109v16reader"></head>')
if '/static/ob-premium.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-premium.js?v=20261109v14noshorcuts" defer></script></body>')
subprocess.run(['node','--check',str(folder/'static/ob-premium.js')],check=True)
# Stable V4 pricing engine and UI for category leaders and existing favorites.
(folder/'static/ob-compare-engine-v4.js').write_text((root/'oferta-compare-engine-v4.js').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-smart-compare-v4.js').write_text((root/'oferta-smart-comparison-v4.js').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-smart-compare-v4.css').write_text((root/'oferta-smart-comparison-v4.css').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-photo-cards-v5.css').write_text((root/'oferta-photo-cards-v5.css').read_text(encoding='utf-8'),encoding='utf-8')
subprocess.run(['node','--check',str(folder/'static/ob-compare-engine-v4.js')],check=True)
subprocess.run(['node','--check',str(folder/'static/ob-smart-compare-v4.js')],check=True)
subprocess.run(['node',str(root/'oferta-compare-tests-v4.cjs')],cwd=str(root),check=True)
if '/static/ob-smart-compare-v4.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-smart-compare-v4.css?v=20261109v4"></head>')
if '/static/ob-photo-cards-v5.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-photo-cards-v5.css?v=20261109v51"></head>')
if '/static/ob-compare-engine-v4.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-compare-engine-v4.js?v=20261109v4" defer></script></body>')
if '/static/ob-smart-compare-v4.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-smart-compare-v4.js?v=20261109v42" defer></script></body>')
if '/static/ob-photo-cards-v5.css' not in html: 
    raise RuntimeError('Foto-first card styles must be included')
photo_code=(folder/'static/ob-premium.js').read_text(encoding='utf-8')
assert 'ob-mini-offer' in photo_code and 'data-ob-list' in photo_code
assert 'ob-foottiles' not in photo_code, 'Duplicate shortcut footer must not be created'
assert 'data-ob-brand' in photo_code and 'data-ob-package' in photo_code
assert 'addTracked()' in photo_code and 'drawOffers()' in photo_code
assert 'ob-mini-add' in (folder/'static/ob-photo-cards-v5.css').read_text(encoding='utf-8')
subprocess.run(['node',str(root/'oferta-photo-list-tests-v5.cjs')],cwd=str(root),check=True)
assert '#installApp' in (folder/'static/ob-photo-cards-v5.css').read_text(encoding='utf-8')
assert 'ob-mini-offer-badge' in (folder/'static/ob-premium.js').read_text(encoding='utf-8')
print('OB_V51_DISCOUNT_AND_INSTALL_REMOVAL_PASS')
print('OB_V5_PHOTO_LIST_UI_CONTRACT_PASS')
print('OB_V4_CATEGORY_COMPARE_AND_FAVORITES_READY')
# Optional public full-resolution image fallback, restricted to Fort's published S3 bucket.
(folder/'oferta-direct-image-fallback.py').write_text((root/'oferta-direct-image-fallback.py').read_text(encoding='utf-8'),encoding='utf-8')
runpy.run_path(str(folder/'oferta-direct-image-fallback.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(folder/'server.py'))
# Strict official-source ingestion: original Cooper magazine images and safe OCR retries.
(folder/'oferta_source_v09.py').write_text((root/'oferta_source_v09.py').read_text(encoding='utf-8'),encoding='utf-8')
source_patch=runpy.run_path(str(folder/'oferta_source_v09.py'),run_name='__bootstrap_no_exec__')
source_patch['patch_source'](str(folder/'server.py'))
# Build assertions: OCR must not publish/guess price or infer missing dates.
check=source_patch['high_precision_candidates']
assert len(check('Arroz Tipo 1 5 kg 21,99','BLU-001','https://www.redetop.com.br/', '2026-11-01','2026-11-10','2026-11-08'))==1
assert not check('Arroz Tipo 1 5 kg de R$ 29,99 por R$ 21,99','BLU-001','https://www.redetop.com.br/', '2026-11-01','2026-11-10','2026-11-08')
assert not check('Arroz Tipo 1 5 kg 21,99','BLU-001','https://www.redetop.com.br/', None,'2026-11-10','2026-11-08')
assert not check('Arroz Tipo 1 5 kg 21,99','BLU-001','https://www.redetop.com.br/', '2026-10-01','2026-11-01','2026-11-08')
print('OB_STRICT_PRICE_GUARD_TESTS_PASS')
# Official network-specific adapters. These do NOT publish OCR prices automatically.
(folder/'oferta_smart_v10.py').write_text((root/'oferta_smart_v10.py').read_text(encoding='utf-8'),encoding='utf-8')
smart=runpy.run_path(str(folder/'oferta_smart_v10.py'),run_name='__bootstrap_no_exec__')
smart['patch_source'](str(folder/'server.py'))
assert smart['norm']('Itoupava Central')=='itoupava central'
assert smart['verified_official']('https://www.redetop.com.br/institucional/ofertas.php','redetop.com.br')
assert not smart['verified_official']('https://redetop.com.br.evil.example/ofertas','redetop.com.br')
assert smart['match_top_blumenau']('Blumenau / Escola Agrícola',{'BLU-X':{'rede':'Rede TOP','filial':'Escola Agrícola'}})=='BLU-X'
assert smart['match_top_blumenau']('Gaspar / Escola Agrícola',{'BLU-X':{'rede':'Rede TOP','filial':'Escola Agrícola'}}) is None
assert 'lookup[' not in (folder/'oferta_smart_v10.py').read_text(encoding='utf-8')
print('OB_SMART_SOURCE_GUARDS_PASS')
# Private coverage by source and current approved prices.
(folder/'oferta_coverage_v10.py').write_text((root/'oferta_coverage_v10.py').read_text(encoding='utf-8'),encoding='utf-8')
runpy.run_path(str(folder/'oferta_coverage_v10.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(folder/'server.py'))
# Reveal the original OCR text to the owner in Gestão after importing an image/PDF.
_js_path=folder/'static/app.js'
_jscode=_js_path.read_text(encoding='utf-8')
_old="msg(`${d.inserted} sugestões novas por ${d.method}. Revise preços e prazo antes de aprovar.`);await loadCandidates()"
_new="msg(`${d.inserted} sugestões novas por ${d.method}. Revise preços e prazo antes de aprovar.`);const obText=document.getElementById('obOCRPreview');if(obText)obText.textContent=String(d.preview||'Texto não reconhecido').slice(0,1600);await loadCandidates()"
if _jscode.count(_old)!=1:raise RuntimeError('Original private OCR import interface changed; abort')
_js_path.write_text(_jscode.replace(_old,_new,1),encoding='utf-8')
(folder/'static/ob-intel.js').write_text((root/'oferta-smart-ui.js').read_text(encoding='utf-8'),encoding='utf-8')
(folder/'static/ob-v3-center.js').write_text((root/'oferta-v3-center.js').read_text(encoding='utf-8'),encoding='utf-8')
subprocess.run(['node','--check',str(folder/'static/ob-v3-center.js')],check=True)
subprocess.run(['node','--check',str(folder/'static/ob-intel.js')],check=True)
# The public Offers page must prioritize products; fiscal provenance and proof are
# still available through authenticated admin tools, never as an empty shopper section.
_ui_main=(folder/'static/ob-premium.js').read_text(encoding='utf-8')
_ui_trust=(folder/'static/ob-v3-center.js').read_text(encoding='utf-8')
_ui_compare=(folder/'static/ob-smart-compare-v4.js').read_text(encoding='utf-8')
assert 'obTrustStrip' not in _ui_main and 'Informação que você pode conferir' not in _ui_main
assert 'obFiscalSection' not in _ui_trust and 'Preços fiscais observados' not in _ui_trust
assert 'obV3Admin' in _ui_trust and 'admin_provenance' not in _ui_trust
assert 'page.append(section)' in _ui_compare and 'obBestPrices' in _ui_compare
assert 'ob-mini-offer' in _ui_main and 'data-ob-list' in _ui_main
print('OB_V52_SHOPPING_FOCUS_NO_EMPTY_TRUST_SECTIONS_PASS')
if '/static/ob-intel.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-intel.js?v=20261109smart10" defer></script></body>')
if '/static/ob-v3-center.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-v3-center.js?v=20261109v32" defer></script></body>')
# The leaflet gallery runs after the original app.js and additive UI scripts.
if '/static/ob-flyer-gallery-v6.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-flyer-gallery-v6.js?v=20261109v16reader" defer></script></body>')
subprocess.run(['node','--check',str(folder/'static/ob-flyer-gallery-v6.js')],check=True)
subprocess.run(['node',str(root/'oferta-flyer-gallery-tests-v6.cjs')],cwd=str(root),check=True)
assert 'id="leafletGrid"' in html and 'id="onlyActive"' in html
assert 'data-page="encartes"' in html and 'data-page="gestao"' in html
assert html.index('/static/ob-flyer-gallery-v6.js')>html.index('/static/ob-premium.js')
assert not any(line.lstrip().startswith('print(') and 'LEAFLET_INSPECT' in line for line in (root/'bootstrap_oferta.py').read_text(encoding='utf-8').splitlines())
print('OB_V6_FLYERS_GALLERY_INTEGRATION_PASS')
# V7: page-independent neon-glass sidebar overlay; preserve navigation and data handlers.
_neon_css=(root/'oferta-sidebar-neon-v7.css').read_text(encoding='utf-8')
assert 'body.ob-premium .sidebar .sidebtn.active' in _neon_css
assert 'body.ob-premium .bottomnav' in _neon_css
assert 'url(http' not in _neon_css and '@import' not in _neon_css
(folder/'static/ob-sidebar-neon-v7.css').write_text(_neon_css,encoding='utf-8')
if '/static/ob-sidebar-neon-v7.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-sidebar-neon-v7.css?v=20261109v7"></head>')
assert '/static/ob-sidebar-neon-v7.css?v=20261109v7' in html
assert html.index('/static/ob-sidebar-neon-v7.css') > html.index('/static/ob-flyer-gallery-v6.css')
print('OB_V7_NEON_MENU_INTEGRATION_PASS')
# V8: true promotion-card selectors, photo depth, glass highlights, safe mobile layout.
_depth_css=(root/'oferta-promo-cards-depth-v8.css').read_text(encoding='utf-8')
assert '#offersGrid.ob-photo-grid .ob-mini-offer' in _depth_css
assert '#offersGrid.ob-photo-grid .ob-mini-add.is-saved' in _depth_css
assert 'prefers-reduced-motion' in _depth_css
assert '@import' not in _depth_css and 'url(' not in _depth_css
(folder/'static/ob-promo-depth-v8.css').write_text(_depth_css,encoding='utf-8')
if '/static/ob-promo-depth-v8.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-promo-depth-v8.css?v=20261109v8"></head>')
assert html.count('/static/ob-promo-depth-v8.css')==1
assert html.index('/static/ob-promo-depth-v8.css') > html.index('/static/ob-photo-cards-v5.css')
assert all(marker in (folder/'static/ob-premium.js').read_text(encoding='utf-8') for marker in
           ('ob-mini-offer','ob-mini-photo-box','ob-mini-add','data-ob-list'))
print('OB_V8_PROMO_DEPTH_INTEGRATION_PASS')
# V9: make individual Supermercados cards display existing network logos with HD glass styling.
_market_js=(root/'oferta-market-cards-v9.js').read_text(encoding='utf-8')
_market_css=(root/'oferta-market-cards-v9.css').read_text(encoding='utf-8')
assert "[data-page=\"mercados\"]" in _market_js and '.marketcard' in _market_js
assert "window.OBPremiumPublic" in _market_js and 'data-obStore' not in _market_js
assert '[data-page="mercados"]' in _market_css and 'prefers-reduced-motion' in _market_css
assert "data-ob-market-glass-secret" not in _market_js
assert "data-ob-list" not in _market_js
(folder/'static/ob-market-cards-v9.js').write_text(_market_js,encoding='utf-8')
(folder/'static/ob-market-cards-v9.css').write_text(_market_css,encoding='utf-8')
if '/static/ob-market-cards-v9.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-market-cards-v9.css?v=20261109v13logo"></head>')
if '/static/ob-market-cards-v9.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-market-cards-v9.js?v=20261109v13logo" defer></script></body>')
subprocess.run(['node','--check',str(folder/'static/ob-market-cards-v9.js')],check=True)
subprocess.run(['node',str(root/'oferta-market-quality-tests-v13.cjs')],cwd=str(root),check=True)
assert html.index('/static/ob-market-cards-v9.css') > html.index('/static/ob-promo-depth-v8.css')
assert html.index('/static/ob-market-cards-v9.js') > html.index('/static/ob-premium.js')
assert html.count('/static/ob-market-cards-v9.css')==1 and html.count('/static/ob-market-cards-v9.js')==1
print('OB_V9_STORES_BRAND_INTEGRATION_PASS')
# V10 — prevent unwanted horizontal scrolling on mobile without impacting data.
_mobile_css=(root/'oferta-mobile-fullwidth-v10.css').read_text(encoding='utf-8')
assert '@media (max-width:760px)' in _mobile_css
assert 'grid-template-columns:repeat(2,minmax(0,1fr))' in _mobile_css
assert 'grid-template-columns:repeat(5,minmax(0,1fr))' in _mobile_css
assert 'overflow-x:clip' in _mobile_css and 'safe-area-inset-bottom' in _mobile_css
assert 'font-size:16px' in _mobile_css and '@import' not in _mobile_css
assert not any(x in _mobile_css for x in ('url(http','/api/','localStorage','sessionStorage'))
(folder/'static/ob-mobile-fullwidth-v10.css').write_text(_mobile_css,encoding='utf-8')
if '/static/ob-mobile-fullwidth-v10.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-mobile-fullwidth-v10.css?v=20261109v10"></head>')
if 'name="viewport"' not in html and "name='viewport'" not in html:
    html=html.replace('</head>','<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>')
assert html.count('/static/ob-mobile-fullwidth-v10.css')==1
assert html.index('/static/ob-mobile-fullwidth-v10.css') > html.index('/static/ob-market-cards-v9.css')
assert 'id="offersGrid"' in html
print('OB_V10_MOBILE_VIEWPORT_PASS')
# V11 — browse only confirmed promotions assigned to each individual branch.
# The original supplier CTA and all saved state remain unchanged.
_branch_css=(root/'oferta-branch-offers-v11.css').read_text(encoding='utf-8')
_branch_js=(root/'oferta-branch-offers-v11.js').read_text(encoding='utf-8')
assert '.ob-branch-offers-btn' in _branch_css
assert 'byBranch' in _branch_js and 'store_id' in _branch_js
assert 'Nenhum preço promocional confirmado nesta filial' in _branch_js
assert "String(o.store_id||'')===id" in _branch_js
assert "String(l.store_id||'')===id" in _branch_js
assert 'prefers-reduced-motion' in _branch_css
assert "@import" not in _branch_css and "url(http" not in _branch_css
(folder/'static/ob-branch-offers-v11.css').write_text(_branch_css,encoding='utf-8')
(folder/'static/ob-branch-offers-v11.js').write_text(_branch_js,encoding='utf-8')
subprocess.run(['node','--check',str(folder/'static/ob-branch-offers-v11.js')],check=True)
if '/static/ob-branch-offers-v11.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-branch-offers-v11.css?v=20261109v13status"></head>')
if '/static/ob-branch-offers-v11.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-branch-offers-v11.js?v=20261109v13status" defer></script></body>')
assert html.count('/static/ob-branch-offers-v11.js')==1
assert html.count('/static/ob-branch-offers-v11.css')==1
assert html.index('/static/ob-branch-offers-v11.js')>html.index('/static/ob-market-cards-v9.js')
assert html.index('/static/ob-branch-offers-v11.css')>html.index('/static/ob-mobile-fullwidth-v10.css')
print('OB_V11_BRANCH_OFFERS_UI_PASS')

# V15 — premium status dashboard for official sources; visual-only, no scanner/API changes.
_sources_ui_js=(root/'oferta-sources-visual-v15.js').read_text(encoding='utf-8')
_sources_ui_css=(root/'oferta-sources-visual-v15.css').read_text(encoding='utf-8')
assert 'data-page="fontes"' in _sources_ui_js and 'sourcesGrid' in _sources_ui_js
assert '.obv-source-card' in _sources_ui_css and 'prefers-reduced-motion' in _sources_ui_css
(folder/'static/ob-sources-visual-v15.js').write_text(_sources_ui_js,encoding='utf-8')
(folder/'static/ob-sources-visual-v15.css').write_text(_sources_ui_css,encoding='utf-8')
if '/static/ob-sources-visual-v15.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-sources-visual-v15.css?v=20261109v15"></head>')
if '/static/ob-sources-visual-v15.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-sources-visual-v15.js?v=20261109v15" defer></script></body>')
subprocess.run(['node','--check',str(folder/'static/ob-sources-visual-v15.js')],check=True)
subprocess.run(['node',str(root/'oferta-sources-visual-tests-v15.cjs')],cwd=str(root),check=True)
assert html.count('/static/ob-sources-visual-v15.js')==1
assert html.count('/static/ob-sources-visual-v15.css')==1
assert html.index('/static/ob-sources-visual-v15.js')>html.index('/static/ob-branch-offers-v11.js')
assert 'id="sourcesGrid"' in html
print('OB_V15_SOURCE_DASHBOARD_UI_PASS')

page.write_text(html,encoding='utf-8')


# Confirm runtime markup contracts before accepting a new deployment.
import re
for element_id in ('offersGrid','searchOffer','filterNetwork','filterStore','trackedName','compareTerm'):
    if ('id="'+element_id+'"') not in html and ("id='"+element_id+"'") not in html:
        raise RuntimeError('Missing critical UI control: '+element_id)
if 'data-page="ofertas"' not in html and "data-page='ofertas'" not in html:
    raise RuntimeError('Missing offers navigation page')
print('OB_UI_MARKUP_CONTRACT_PASS')
# Authenticated diagnostic endpoint: permits real readback of the live product catalogue
# from Supabase-backed SQLite without exposing private offers publicly.
_backend_path=folder/'server.py'
_backend_source=_backend_path.read_text(encoding='utf-8')
_auth_anchor="'/api/internal/ingest', '/robots.txt'"
if _auth_anchor not in _backend_source:
    raise RuntimeError('Missing auth exclusion anchor for protected catalogue readback')
_backend_source=_backend_source.replace(_auth_anchor,"'/api/internal/ingest', '/api/internal/catalog-selftest', '/robots.txt'",1)
_backend_source+='''
@app.post('/api/internal/catalog-selftest')
async def internal_catalog_selftest(request:Request):
    key=os.getenv('OFFER_SCHEDULE_SECRET','').strip()
    supplied=request.headers.get('x-schedule-secret','')
    if len(key)<40 or len(supplied)<40 or not hmac.compare_digest(key,supplied):
        raise HTTPException(401,'Acesso não autorizado')
    day=today()
    with session() as c:
        total=c.execute('SELECT count(*) FROM offers').fetchone()[0]
        active=c.execute('SELECT count(*) FROM offers WHERE starts_on<=? AND ends_on>=? AND price>0',(day,day)).fetchone()[0]
        branches=[r[0] for r in c.execute('SELECT DISTINCT store_id FROM offers WHERE starts_on<=? AND ends_on>=?', (day,day)).fetchall()]
        pending=c.execute("SELECT count(*) FROM candidates WHERE status='pendente'").fetchone()[0]
        leaflet_count=c.execute('SELECT count(*) FROM leaflets').fetchone()[0]
    return {'ok':True,'as_of':day,'approved_offers':total,'active_offers':active,
            'store_ids':branches,'networks_with_offers':sorted({ALL_STORES[x]['rede'] for x in branches if x in ALL_STORES}),
            'pending_candidates':pending,'leaflets':leaflet_count}
'''
_backend_path.write_text(_backend_source,encoding='utf-8')
# Protected source diagnostic endpoint for first-party public URLs only.
(folder/'oferta_probe_v11.py').write_text((root/'oferta_probe_v11.py').read_text(encoding='utf-8'),encoding='utf-8')
runpy.run_path(str(folder/'oferta_probe_v11.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(_backend_path))
# Separate trust and evidence model: uses only the already configured server-to-server token.
(folder/'oferta_v3_provenance.py').write_text((root/'oferta_v3_provenance.py').read_text(encoding='utf-8'),encoding='utf-8')
runpy.run_path(str(folder/'oferta_v3_provenance.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(_backend_path))
print('OB_V3_PROVENANCE_ENDPOINTS_PREPARED')
import py_compile
py_compile.compile(str(_backend_path),doraise=True)
print('OB_SERVER_SYNTAX_AND_PROTECTED_READBACK_PASS')
print('Oferta Blumenau: secure app prepared')
