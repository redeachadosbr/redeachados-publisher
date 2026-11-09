"""Optional self-contained OCR fallback for Render Python (tesseract.js)."""
from pathlib import Path

FALLBACK = '''
def js_ocr_image(blob:bytes, extension:str='.png'):
    """Try optional sandboxed local Node OCR, never an external paid API."""
    import subprocess, tempfile, shutil
    script=ROOT/'ocr_fallback.cjs'
    if not script.exists() or not (ROOT/'node_modules'/'tesseract.js').exists() or not shutil.which('node'):
        raise ValueError('Motor OCR não instalado neste servidor')
    suffix=extension if extension in ('.png','.jpg','.jpeg','.webp') else '.png'
    name=None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix,delete=False) as handle:
            handle.write(blob);name=handle.name
        result=subprocess.run(['node',str(script),name],capture_output=True,text=True,timeout=55,check=False)
        if result.returncode!=0:raise ValueError((result.stderr or 'Erro OCR Node')[:160])
        if len(result.stdout.strip())<10:raise ValueError('OCR não reconheceu texto')
        return result.stdout,'ocr_js_por'
    finally:
        if name:Path(name).unlink(missing_ok=True)
'''

def patch_source(server_path):
    p=Path(server_path)
    s=p.read_text(encoding='utf-8')
    anchor='\n\ndef read_brochure(blob: bytes, name: str):'
    if FALLBACK not in s:
        if anchor not in s:raise RuntimeError('read_brochure unavailable')
        s=s.replace(anchor,FALLBACK+anchor,1)
    old="""        except Exception as e:
            raise ValueError('OCR indisponível: instale Tesseract com idioma por. '+str(e)[:100])"""
    new="""        except Exception as e:
            try:return js_ocr_image(blob,suffix)
            except Exception as another:
                raise ValueError('OCR não disponível ou falhou: '+str(another)[:130])"""
    if new not in s:
        if old not in s:raise RuntimeError('Image OCR fallback anchor missing')
        s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')

if __name__=='__main__':
    import sys
    patch_source(sys.argv[1])
