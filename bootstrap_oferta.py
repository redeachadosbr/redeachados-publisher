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
# Update the old SQLite-only warning: state is now stored in Supabase.
page=folder/'static/index.html'
html=page.read_text(encoding='utf-8')
html=html.replace('o servidor pode reiniciar e perder ofertas cadastradas. Exporte uma cópia depois de cada atualização importante.',
                  'as ofertas cadastradas ficam salvas no Supabase mesmo após reiniciar. Exporte backups periodicamente como proteção extra.')
page.write_text(html,encoding='utf-8')
print('Oferta Blumenau: secure app prepared')
