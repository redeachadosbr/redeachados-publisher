# Oferta Blumenau v0.4 — Instalação privada no Render Free

Este ramo é independente dos serviços existentes e contém apenas o arquivo `oferta-blumenau-bundle.b64`, com o aplicativo compactado (código, 8 redes, 28 filiais, PWA, API e painel de conferência).

## Criar serviço somente no plano gratuito

1. Abrir https://dashboard.render.com/new/web e selecionar repositório `redeachadosbr/redeachados-publisher`.
2. Branch: `oferta-blumenau-teste`. Nome sugerido: `oferta-blumenau-privado`.
3. Language/Runtime: **Python**. Região: Ohio. **Instance Type: Free**. Não selecionar Starter nem anexar disco.
4. Build Command (uma linha):

```sh
mkdir -p oferta-blumenau && python -c "import base64,lzma;open('/tmp/oferta-bundle.tar','wb').write(lzma.decompress(base64.b64decode(open('oferta-blumenau-bundle.b64','rb').read())))" && tar -xf /tmp/oferta-bundle.tar -C oferta-blumenau && pip install -r oferta-blumenau/requirements.txt
```

5. Start Command:

```sh
cd oferta-blumenau && uvicorn server:app --host 0.0.0.0 --port $PORT
```

6. Environment variables:

| Key | Value |
| --- | --- |
| PRIVATE_ACCESS | 1 |
| COOKIE_SECURE | 1 |
| TEMPORARY_STORAGE | 1 |
| AUTO_SYNC_STARTUP | 1 |
| ENABLE_SCHEDULER | 0 |
| ACCESS_PASSWORD | SENHA FORTE de 16+ caracteres, pessoal |
| ADMIN_TOKEN | Pode usar a mesma senha forte para gerenciar ofertas |
| SESSION_SECRET | Segredo aleatório de 32+ caracteres, diferente da senha |

**Não coloque senhas no GitHub.** Configure-as somente no painel privado do Render. Depois clique em Create Web Service.

## Testar

- O endereço final será `https://<nome-definido-pelo-render>.onrender.com`.
- Sem login, acessar `/` deve redirecionar para `/login`.
- Sem login, `/api/stores` deve retornar 401.
- Após login, `/api/status` mostra 8 redes e 28 lojas.
- iPhone Safari: Compartilhar → Adicionar à Tela de Início.
- Android Chrome: menu → Instalar app.
- Em Gestão, informe ADMIN_TOKEN para executar coleta das fontes e revisar ofertas.

## Limites importantes

- Hospedagem **Free**, não gera por si só mensalidade de máquina.
- O Render adormece após cerca de 15 minutos sem acesso. Ao reabrir, a partida pode demorar.
- SQLite é temporário e os cadastros podem sumir quando o servidor dorme/reinicia. **Use Gestão → Exportar backup** e restaure o JSON quando necessário.
- O agendador 6h/12h/18h não funciona de modo confiável em hospedagem que adormece.
- A coleta pública identifica referências de encartes; preços reais e fotos de todas as redes ainda não são extraídos com cobertura comprovada. Validar produto, preço, peso, loja e vigência antes de publicar.
- Se houver cartão cadastrado, o Render pode cobrar excedentes de banda ou builds. Confira Billing e limites de gastos; não autorize custos extras.
- É PWA para instalar na tela inicial do celular; não está na Google Play ou App Store.

Para documentação completa, descompacte o `oferta_blumenau_privado_android_iphone_v04.zip` fornecido no chat.
