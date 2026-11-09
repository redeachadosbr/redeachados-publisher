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
if '/static/ob-premium.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-premium.css?v=20261109"></head>')
if '/static/ob-premium.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-premium.js?v=20261109" defer></script></body>')
subprocess.run(['node','--check',str(folder/'static/ob-premium.js')],check=True)
# Optional public full-resolution image fallback, restricted to Fort's published S3 bucket.
(folder/'oferta-direct-image-fallback.py').write_text((root/'oferta-direct-image-fallback.py').read_text(encoding='utf-8'),encoding='utf-8')
runpy.run_path(str(folder/'oferta-direct-image-fallback.py'),run_name='__bootstrap_no_exec__')['patch_source'](str(folder/'server.py'))
page.write_text(html,encoding='utf-8')

# Temporary read-only build validation of the bundled app contract.
import re as _ob_re
_backend=(folder/'server.py').read_text(encoding='utf-8')
_front=(folder/'static/app.js').read_text(encoding='utf-8')
for _name in ('offers','candidates','leaflets'):
    _ddl=_ob_re.search(r'CREATE TABLE(?: IF NOT EXISTS)?\s+'+_name+r'\s*\((.*?)\)\s*;', _backend,_ob_re.I|_ob_re.S)
    print('OB_DDL_'+_name.upper(), _ddl.group(1)[:2200].replace('\n',' ') if _ddl else 'NOT_FOUND')
print('OB_BACKEND_OFFER_LINES',[_line.strip()[:180] for _line in _backend.splitlines() if (_ob_re.search(r'(?:@app\.|def\s+|INSERT INTO|UPDATE\s+)',_line) and _ob_re.search(r'offer|candidate|backup|import|approve',_line,_ob_re.I))][:55])
print('OB_FRONT_GLOBALS',[_line.strip()[:180] for _line in _front.splitlines() if _ob_re.search(r'^(?:let|const|var|async function|function)\s+(?:offers|stores|leaflets|refreshAll|drawOffers|loadOffers|sanitize|buildFilterStore|selectPage|fmtDate|money)',_line.strip())][:25])
print('OB_FRONT_API_ENDPOINTS',sorted(set(_ob_re.findall(r'/(?:api/[a-zA-Z0-9/_-]+)',_front)))[:45])


import ast as _ob_ast
_ast=_ob_ast.parse(_backend)
for _fn in ('OfferPayload','offer_fingerprint','checks_offer','insert_offer','map_offer','add_offer','refresh_state'):
    _node=next((_n for _n in _ast.body if isinstance(_n,(_ob_ast.FunctionDef,_ob_ast.AsyncFunctionDef,_ob_ast.ClassDef)) and _n.name==_fn),None)
    if _node:
        _text=_ob_ast.get_source_segment(_backend,_node) or ''
        print('OB_FUNC_'+_fn.upper(),_text[:2700].replace('\n',' | '))
for _target in ('async function refreshAll()', 'function drawOffers()', 'function buildFilterStore()'):
    _i=_front.find(_target)
    if _i!=-1:print('OB_JS_'+_target.replace(' ','_'),_front[_i:_i+1400].replace('\n',' | '))

print('Oferta Blumenau: secure app prepared')
