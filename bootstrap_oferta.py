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
print('Oferta Blumenau: secure app prepared')
