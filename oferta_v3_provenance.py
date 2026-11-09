"""Secure bridge from authenticated Oferta Blumenau to isolated Supabase V3 provenance storage."""
from pathlib import Path
ROUTES = r'''
def v3_bridge_endpoint():
    root=os.getenv('OFFER_STATE_URL','').strip()
    token=os.getenv('OFFER_STATE_TOKEN','').strip()
    parsed=urlparse(root)
    if parsed.scheme!='https' or not (parsed.hostname or '').endswith('.supabase.co'):
        raise HTTPException(503,'Origem de armazenamento não configurada')
    if not parsed.path.endswith('/oferta-blumenau-state') or len(token)<48:
        raise HTTPException(503,'Ligação de armazenamento não configurada')
    return root.rsplit('/',1)[0]+'/oferta-blumenau-data-v3', token

async def v3_provenance_call(data):
    addr, secret = v3_bridge_endpoint()
    if not isinstance(data,dict) or len(str(data))>40000:
        raise HTTPException(413,'Dados acima do limite')
    try:
        async with httpx.AsyncClient(timeout=22,follow_redirects=False,trust_env=False) as client:
            r=await client.post(addr,json=data,headers={'x-offer-secret':secret,'accept':'application/json'})
            if r.status_code!=200:
                safe=(r.json() or {}).get('error') if 'json' in r.headers.get('content-type','') else None
                raise HTTPException(r.status_code,safe or 'Falha no serviço de evidências')
            result=r.json()
            if not isinstance(result,dict) or result.get('ok') is not True:
                raise HTTPException(502,'Resposta inesperada do serviço de evidências')
            return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503,'Serviço de evidências temporariamente indisponível')

@app.get('/api/fiscal-prices')
async def fiscal_prices(limit:int=80,store_id:Optional[str]=None):
    # Existing app session middleware protects this endpoint. It is NOT in the bypass list.
    if limit<1 or limit>160:
        raise HTTPException(422,'Limite entre 1 e 160')
    if store_id is not None and not re.fullmatch(r'BLU-\d{3}',store_id):
        raise HTTPException(422,'Filial inválida')
    return await v3_provenance_call({'action':'list_fiscal','limit':limit,'store_id':store_id})


@app.post('/api/internal/v3-selftest')
async def v3_selftest(request:Request):
    # Read-only, scoped to the already configured schedule token. No secret in the response.
    key=os.getenv('OFFER_SCHEDULE_SECRET','').strip()
    supplied=request.headers.get('x-schedule-secret','').strip()
    if len(key)<40 or len(supplied)<40 or not hmac.compare_digest(key,supplied):
        raise HTTPException(401,'Acesso não autorizado')
    evidence=await v3_provenance_call({'action':'summary'})
    return {'ok':True,'backend':'oferta-v3','fiscal_verified':evidence.get('fiscal_verified',0),
        'fiscal_pending':evidence.get('fiscal_pending',0),
        'leaflets_verified':evidence.get('leaflets_verified',0),
        'leaflets_pending':evidence.get('leaflets_pending',0),
        'reviews_pending':evidence.get('reviews_pending',0)}

@app.post('/api/admin/provenance')
async def admin_provenance(payload:dict=Body(...),x_admin_token:Optional[str]=Header(None)):
    auth(x_admin_token)
    allowed={'summary','pending','submit_fiscal','submit_leaflet','review'}
    if payload.get('action') not in allowed:
        raise HTTPException(400,'Ação não permitida')
    if payload.get('action') in {'submit_fiscal','submit_leaflet'} and payload.get('store_id') not in ALL_STORES:
        raise HTTPException(400,'Filial não cadastrada')
    return await v3_provenance_call(payload)
'''
def patch_source(path):
    f=Path(path);src=f.read_text(encoding="utf-8")
    if "async def v3_provenance_call(" in src:return
    # The existing server has a login middleware; new user-facing routes intentionally
    # stay subject to it. Administrative writes also require X-Admin-Token.
    anchor="import oferta_smart_v10\n"
    if anchor not in src:
        raise RuntimeError("V3 provenance requires existing official-source scanner")
    bypass="'/api/internal/source-probe', '/robots.txt'"
    if bypass not in src:
        raise RuntimeError('Existing protected routes changed; no new diagnostic bypass allowed')
    src=src.replace(bypass,"'/api/internal/source-probe', '/api/internal/v3-selftest', '/robots.txt'",1)
    src+="\n"+ROUTES
    f.write_text(src,encoding="utf-8")
