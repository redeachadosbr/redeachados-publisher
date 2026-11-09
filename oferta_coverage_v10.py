"""Private coverage by network with actual errors, not invented offers."""
from pathlib import Path

ENDPOINT = '''
@app.get('/api/admin/coverage')
async def admin_coverage(x_admin_token:Optional[str]=Header(None)):
    auth(x_admin_token)
    day=today()
    with session() as c:
        approved=[dict(x) for x in c.execute(
          'SELECT store_id,price,starts_on,ends_on FROM offers WHERE price>0').fetchall()]
        pending=[dict(x) for x in c.execute(
          "SELECT store_id FROM candidates WHERE status='pendente'").fetchall()]
        magazines=[dict(x) for x in c.execute(
          'SELECT network,status,ends_on FROM leaflets').fetchall()]
        recent=[dict(x) for x in c.execute(
          'SELECT network,result,detail,ran_at FROM runs ORDER BY id DESC LIMIT 250').fetchall()]
    networks=sorted({s['rede'] for s in ALL_STORES.values()})
    out=[]
    for name in networks:
        network_stores=[(sid,s) for sid,s in ALL_STORES.items() if s['rede']==name]
        ids={sid for sid,s in network_stores}
        live=sum(1 for o in approved if o['store_id'] in ids
                 and (not o.get('starts_on') or o['starts_on']<=day)
                 and (not o.get('ends_on') or o['ends_on']>=day))
        waiting=sum(1 for p in pending if p['store_id'] in ids)
        docs=sum(1 for m in magazines if m['network']==name and
                 (not m['ends_on'] or m['ends_on']>=day)
                 and m['status'] not in ('encarte_vencido_ignorado',))
        latest=next((r for r in recent if r['network']==name),None)
        status='sem_verificacao'
        if latest:
            note=(latest.get('detail') or '').lower()
            if latest['result']!='ok':
                status='bloqueado' if ('http 403' in note or 'http 401' in note) else 'erro_fonte'
            else:
                status='acessivel'
        mode=('encarte_digital' if name in ('Komprão','Fort Atacadista')
              else 'selecao_de_loja' if name=='Rede TOP'
              else 'canais_whatsapp' if name in ('Unibox Dinardelli','Brasil Atacadista')
              else 'consulta_oficial' if name=='Giassi'
              else 'revista_por_filial' if name=='Cooper'
              else 'oferta_por_filial')
        out.append({'network':name,'stores':len(ids),'approved_active':live,
                    'pending_review':waiting,'documents':docs,'source_status':status,
                    'last_attempt':latest.get('ran_at') if latest else None,
                    'last_detail':(latest.get('detail') or '')[:120] if latest else '',
                    'mode':mode,
                    'store_ids':[sid for sid,s in network_stores],
                    'official_urls':list(dict.fromkeys(s['url_ofertas'] for sid,s in network_stores))[:12]})
    return {'ok':True,'as_of':day,'total_active':sum(x['approved_active'] for x in out),
            'networks':out,
            'warning':'Fonte acessível não significa produto/preço disponível; revisar sempre antes de aprovar.'}
'''

def patch_source(server_path: str):
    p=Path(server_path);code=p.read_text(encoding='utf-8')
    if "@app.get('/api/admin/coverage')" not in code:
        code+='\\n'+ENDPOINT
        p.write_text(code,encoding='utf-8')
