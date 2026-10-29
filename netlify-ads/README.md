# Rede Achados BR — Decisor Ads no Netlify + histórico no Google Drive

Este projeto é **uma versão de preparação** da V16. Não altera campanhas da Shopee. O histórico só será compartilhado depois de configurar e testar o Google Apps Script e o Netlify.

## Arquitetura

- `site/index.html`: Decisor Ads V16 (Produtos, Campanhas, Histórico).
- `site/cloud-sync.js`: login e sincronização de produtos, alterações, análises e consultas anteriores, sem chaves no navegador.
- `netlify/functions/access.mjs`: sessão por cookie HttpOnly + senha de acesso no ambiente Netlify.
- `netlify/functions/history.mjs`: acesso protegido, servidor→Google Apps Script.
- `netlify/functions/shopee-ads.mjs`: leitura de Shopee Ads via sessão no Render (precisa da senha de Render configurada no Netlify).
- `google-apps-script/Code.gs`: lê e atualiza arquivo JSON no Drive, com LockService para evitar gravações concorrentes.

## 1) Configurar Google Drive

1. Na conta Google que será proprietária dos dados, crie uma pasta chamada `Rede Achados BR - Historico Ads` (não precisa compartilhá-la).
2. Abra a pasta e copie **somente o ID da pasta** da URL `drive.google.com/drive/folders/ID`.
3. Acesse [script.google.com](https://script.google.com) → Novo projeto, cole o conteúdo de `google-apps-script/Code.gs`.
4. Em Configurações do projeto → Propriedades do script, configure:
   - `DRIVE_FOLDER_ID`: ID da pasta.
   - `HISTORY_API_SECRET`: segredo aleatório com pelo menos 32 caracteres (não publique no GitHub).
5. Implantar → Nova implantação → Aplicativo da Web → **Executar como: Eu**; **Quem tem acesso: Qualquer pessoa**. Esta escolha permite ao servidor Netlify chamar o script sem login Google em cada chamada; a validação de segredo no corpo continua obrigatória.
6. Autorize os escopos solicitados do seu Google Drive. Copie a URL final terminada em `/exec`.
7. O arquivo `Rede_Achados_BR_Ads_Historico.json` será criado automaticamente no primeiro salvamento autenticado. **Não** compartilhe a URL do script nem o segredo.

## 2) Configurar Netlify

1. Crie um **novo projeto** no Netlify (não substitua sua Central Financeira).
2. Selecione GitHub → repositório `redeachadosbr/redeachados-publisher`.
3. Selecione a branch `feat/ads-netlify-google-drive-20261029`.
4. **Base directory:** `netlify-ads`.
5. **Build command:** em branco (site estático).
6. **Publish directory:** `site` (relativo ao base directory). Funções em `netlify/functions`, definidas em `netlify.toml`.
7. Configure em Project configuration → Environment variables (somente servidor, não expor no HTML):
   - `APP_ACCESS_PASSWORD` → senha forte para entrar no aplicativo Netlify (pode ser compartilhada apenas com pessoas autorizadas).
   - `SESSION_SECRET` → string aleatória de 32 caracteres ou mais, diferente das demais.
   - `GOOGLE_SCRIPT_URL` → URL do Apps Script terminada em `/exec`.
   - `GOOGLE_HISTORY_SECRET` → **exatamente o mesmo valor** de `HISTORY_API_SECRET` do Apps Script.
   - `RENDER_APP_PASSWORD` → senha que já protege o Shopee Manager no Render, se você quiser usar Shopee Ads via Netlify.
   - `RENDER_SHOPEE_URL` → opcional; padrão `https://redeachados-shopee.onrender.com`.
8. Faça o deploy, entre com `APP_ACCESS_PASSWORD` e clique em **Sincronizar agora**.
9. Abra o Google Drive e confirme que `Rede_Achados_BR_Ads_Historico.json` foi criado e atualizado.

## 3) Migrar seus cadastros atuais sem perder nada

1. No Render V16, **Baixar backup JSON**.
2. Abra o aplicativo do Netlify, faça login e **restaure o mesmo backup JSON** no cadastro.
3. Clique em **Sincronizar agora**; confirme a mensagem “Sincronizado com Google Drive”.
4. Abra em outro navegador/anônimo, entre e confirme que os mesmos produtos e alterações são exibidos.
5. Só passe a utilizar Netlify como principal depois do teste com dois navegadores.

## 4) Comportamento e limites

- O histórico usa a **data e hora registradas automaticamente** no momento do clique em Salvar.
- Os filtros continuam limitados a SKUs com registros de histórico.
- Alterações não são aplicadas automaticamente na Shopee.
- A sincronização combina produtos pelo SKU e alterações pelo ID; registros removidos são mantidos como exclusões lógicas para não reaparecerem em outro navegador.
- O histórico local **continua como cópia de contingência**; o arquivo no Drive é a fonte compartilhada após o primeiro sincronismo.
- **Se o Google Drive estiver indisponível**, a interface mostra erro, preserva dados locais e é preciso sincronizar novamente; não conclua que outra pessoa já verá as modificações.
- Quem possui a senha do aplicativo poderá **visualizar e modificar** os dados; esta versão não tem papéis separados de só leitura.
- Antes de usar em produção, valide a consulta de Ads e o acesso real dos dois usuários. Nenhum teste da sua conta Google Drive/Netlify é feito automaticamente ao criar este código.

## Verificação de saúde

- `GET /api/access`: `{"ok":true,"authenticated":false}` antes do login (ou `true` depois).
- `POST /api/access` com `{"password":"..."}`: define cookie HttpOnly.
- `POST /api/history` com `{"action":"read"}`: retorna o estado autorizado da pasta no Drive.
- `GET /api/shopee/ads/overview?start_date=2026-10-22&end_date=2026-10-27`: consulta leitura se `RENDER_APP_PASSWORD` configurada.

**Observação:** não use drag-and-drop manual do Netlify como método de instalação desta integração, porque ela depende das funções de servidor; conecte o repositório GitHub.
