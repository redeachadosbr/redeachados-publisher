"""Build Oferta Blumenau from committed v0.4 archive and durable database bridge."""
from pathlib import Path
import base64
import io
import lzma
import subprocess
import sys
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
subprocess.run([sys.executable, str(folder/'remote_state.py'), '--patch', str(folder/'server.py')], check=True)
print('Oferta Blumenau: private app prepared')
