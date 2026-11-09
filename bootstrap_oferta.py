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
(folder/'static/ob-premium-v3.css').write_text((root/'oferta-premium-v3.css').read_text(encoding='utf-8'),encoding='utf-8')
if '/static/ob-premium.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-premium.css?v=20261109"></head>')
if '/static/ob-premium-v3.css' not in html:
    html=html.replace('</head>','<link rel="stylesheet" href="/static/ob-premium-v3.css?v=20261109v3"></head>')
if '/static/ob-premium.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-premium.js?v=20261109" defer></script></body>')
subprocess.run(['node','--check',str(folder/'static/ob-premium.js')],check=True)
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
if '/static/ob-intel.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-intel.js?v=20261109smart10" defer></script></body>')
if '/static/ob-v3-center.js' not in html:
    html=html.replace('</body>','<script src="/static/ob-v3-center.js?v=20261109v3" defer></script></body>')
page.write_text(html,encoding='utf-8')


# Confirm runtime markup contracts before accepting a new deployment.
import re
for element_id in ('offersGrid','searchOffer','filterNetwork','filterStore','trackedName','compareTerm'):
    if ('id="'+element_id+'"') not in html and ("id='"+element_id+"'") not in html:
        raise RuntimeError('Missing critical UI control: '+element_id)
if 'data-page="ofertas"' not in html and "data-page='ofertas'" not in html:
    raise RuntimeError('Missing offers navigation page')
print('OB_UI_MARKUP_CONTRACT_PASS')
# Temporary read-only audit of existing favorites and comparison data structures.
import re as _ob_audit_re
_ob_app=(folder/'static/app.js').read_text(encoding='utf-8')
for _ob_match in list(_ob_audit_re.finditer(r'(?:async\\s+)?function\\s+(?:addTracked|loadTracked|drawTracked|refreshAll|compare|renderTracked|saveTracked|loadSaved|drawSaved|toggleFavorite)\\s*\\(',_ob_app))[:18]:
    print('OB_FAVORITES_AUDIT',_ob_app[_ob_match.start():_ob_match.start()+1850].replace('\\n',' | '))
for _ob_token in ('trackedName','trackedItems','localStorage','salvos','trackeds','favorite'):
    _ob_indices=[m.start() for m in _ob_audit_re.finditer(_ob_audit_re.escape(_ob_token),_ob_app,flags=_ob_audit_re.I)]
    print('OB_FAVORITES_TOKEN',_ob_token,len(_ob_indices),[_ob_app[max(0,p-150):p+230].replace('\\n',' | ') for p in _ob_indices[:3]])

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
