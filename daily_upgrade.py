"""Idempotent update to daily scan; never expose scheduler secret."""
from pathlib import Path
def patch_source(path):
    p=Path(path);data=p.read_text(encoding='utf-8')
    changes=[
      ("import secrets\n", "import secrets\nimport daily_collect\n"),
      ("'/api/health', '/robots.txt'", "'/api/health', '/api/internal/daily', '/robots.txt'"),
      ("                    leaflets=extract_leaflets(html,url,job['network'],job['store_id'])",
       "                    leaflets=extract_leaflets(html,url,job['network'],job['store_id'])\n                    structured=daily_collect.extract_structured_candidates(html,job['store_id'],url,today())"),
      ("                    return {'network':job['network'],'url':url,'status':'ok','discovered':len(leaflets),'added':added}",
       "                    candidates_added=insert_candidates(structured) if structured else 0\n                    return {'network':job['network'],'url':url,'status':'ok','discovered':len(leaflets),'added':added,'pending_structured':candidates_added}"),
      ("        details=await asyncio.gather(*(visit(j) for j in jobs))\n    return {'checked':len(jobs)",
       "        details=await asyncio.gather(*(visit(j) for j in jobs))\n    with session() as c:\n        c.execute('DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 800)')\n    return {'pending_structured':sum(d.get('pending_structured',0) for d in details), 'checked':len(jobs)"),
      ("@app.post('/api/admin/scan-leaflets')",
       """@app.post('/api/internal/daily')
async def scheduled_daily(request:Request):
    key=os.getenv('OFFER_SCHEDULE_SECRET','').strip()
    supplied=request.headers.get('x-schedule-secret','')
    if len(key)<40 or len(supplied)<40 or not hmac.compare_digest(key,supplied):
        raise HTTPException(401,'Acesso não autorizado')
    result=await sync_sources()
    return {'ok':True,'checked':result['checked'],'accessible':result['ok'],
            'failed':result['failed'],'new_leaflets':result['new_leaflets'],
            'pending_structured':result.get('pending_structured',0),
            'note':'Preços individuais exigem revisão'}

@app.post('/api/admin/scan-leaflets')"""),
      ("        start,end=parse_dates(haystack)", "        start,end=daily_collect.parse_date_span(haystack)"),
      ("'scheduler_enabled':os.getenv('ENABLE_SCHEDULER')=='1'", "'scheduler_enabled':(os.getenv('ENABLE_SCHEDULER')=='1' or os.getenv('EXTERNAL_SCHEDULE_ENABLED')=='1')"),
      ("version='0.4.0'", "version='0.6.0'"),
      ("'version':'0.4.0'", "'version':'0.6.0'"),
    ]
    for old,new in changes:
        if new in data:continue
        if old not in data:raise ValueError('Base drift: '+old[:80])
        data=data.replace(old,new,1)
    p.write_text(data,encoding='utf-8')
    page=p.parent/'static/index.html'
    html=page.read_text(encoding='utf-8')
    html=html.replace('Somente ofertas com preço e prazo aprovados. Nenhum valor inventado.',
         'Verificações automáticas às 6h, 12h e 18h (Blumenau). Apenas ofertas com preço, filial, peso e prazo conferidos.')
    page.write_text(html,encoding='utf-8')
if __name__=='__main__':
    import sys
    patch_source(sys.argv[1])
