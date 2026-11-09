"""Fix login policy to honor a user-selected 10+ character password and explain server errors."""
from pathlib import Path

def patch_source(server_path):
    path = Path(server_path)
    source = path.read_text(encoding='utf-8')
    # Keep private sessions, server-only admin keys, secure cookies and rate limiting.
    original = "len(ACCESS_PASSWORD)<12"
    revised = "len(ACCESS_PASSWORD)<10"
    if source.count(original) != 2:
        raise RuntimeError("Login policy source changed; no deployment applied")
    source = source.replace(original, revised)
    original_form = 'required minlength="8"'
    if original_form not in source:
        raise RuntimeError("Password input policy changed")
    source = source.replace(original_form, 'required minlength="10"', 1)
    incorrect = "if(!r.ok){document.getElementById('senha').value='';throw new Error('Senha incorreta ou acesso temporariamente bloqueado')}"
    informative = (
        "if(!r.ok){document.getElementById('senha').value='';"
        "const msg=r.status===401?'Senha incorreta. Confira letras maiúsculas, minúsculas e números.':"
        "r.status===429?'Muitas tentativas. Tente novamente mais tarde.':"
        "r.status===503?'Servidor indisponível ou reiniciando. Tente novamente em instantes.':"
        "'Não foi possível entrar (HTTP '+r.status+').';"
        "throw new Error(msg)}"
    )
    if incorrect not in source:
        raise RuntimeError("Login UI source changed")
    source = source.replace(incorrect, informative, 1)
    path.write_text(source, encoding='utf-8')

if __name__ == '__main__':
    import sys
    patch_source(sys.argv[1])
