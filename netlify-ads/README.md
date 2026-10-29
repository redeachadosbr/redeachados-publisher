# Rede Achados BR — Decisor Shopee Ads no Netlify + histórico Google Drive

## Acesso público, sem senha

O **Decisor Shopee Ads** será aberto por qualquer pessoa que conheça ou encontre o endereço do site. Sem login, todos poderão:
- consultar produtos e histórico da loja;
- cadastrar e alterar produtos;
- registrar ou excluir modificações manuais;
- sincronizar dados da loja armazenados no Google Drive.

**Atenção:** sem login, não é possível restringir o sistema apenas a pessoas autorizadas. Qualquer visitante poderá também apagar registros. Faça backups frequentes do arquivo do Google Drive. A integração da Shopee continua **somente leitura**, sem publicar ou alterar anúncios.

Este repositório contém o código preparado. A publicação no Netlify e a conexão real com o Google Drive ainda dependem de configuração na conta do proprietário e validação antes de uso.

## Componentes

- `site/index.html`: Decisor V16, produtos, campanhas e histórico.
- `site/cloud-sync.js`: sincronização pública do catálogo, mudanças e histórico sem senha.
- `netlify/functions/history.mjs`: função pública de leitura/gravação no Drive, com credencial Google **somente no servidor**.
- `netlify/functions/shopee-ads.mjs`: consulta **somente leitura** aos Ads, opcionalmente via Render (sem operações na Shopee).
- `google-apps-script/Code.gs`: Google Apps Script que lê/grava um arquivo JSON numa pasta particular no Google Drive.
- `netlify.toml`: configurações de publicação.

Não há senhas para entrar no aplicativo. **Ainda é obrigatório manter um segredo técnico privado entre Netlify e Google Apps Script**, para não expor as credenciais da conta Google.

## 1. Netlify — publicar a interface

1. Selecione o repositório GitHub `redeachadosbr/redeachados-publisher`.
2. Branch: `feat/ads-netlify-google-drive-20261029`.
3. Projeto sugerido: `redeachados-ads`.
4. Base directory: `netlify-ads`.
5. Build command: deixar vazio.
6. Publish directory: `site` (ou `netlify-ads/site` conforme a forma como o formulário mostra os caminhos).
7. Functions directory: `netlify/functions` (ou `netlify-ads/netlify/functions` no resumo do formulário).
8. Pode publicar sem as variáveis de ambiente para verificar a interface; **nesse caso o histórico compartilhado não sincronizará até configurar o Drive**. O site continuará salvando no navegador.

Não utilize o projeto `redeachadosbrfinancas`; crie um novo para o Decisor.

## 2. Google Drive — criar o histórico compartilhado

1. Crie uma pasta **privada** `Rede Achados BR - Histórico Ads` no Google Drive.
2. Copie o identificador da pasta na URL `drive.google.com/drive/folders/ID`.
3. Entre em [script.google.com](https://script.google.com), crie um projeto e cole o conteúdo de `google-apps-script/Code.gs`.
4. Em **Configurações do projeto → Propriedades do script**, cadastre:
   - `DRIVE_FOLDER_ID`: ID da pasta;
   - `HISTORY_API_SECRET`: segredo aleatório, com 32+ caracteres, não fornecido a outros usuários e **não publicado no GitHub**.
5. Implantar → Nova implantação → Aplicativo da Web → **Executar como: Eu**; **Quem tem acesso: Qualquer pessoa**. A autenticação técnica é feita pelo segredo transmitido pela função Netlify, e não por login de usuário.
6. Autorize o Google Drive e copie a URL final terminada em `/exec`.

## 3. Netlify — variáveis privadas (sem senha para entrar)

Em **Site configuration → Environment variables**, configure:

| Variável | Valor |
|---|---|
| `GOOGLE_SCRIPT_URL` | URL de implantação do Apps Script, terminando em `/exec` |
| `GOOGLE_HISTORY_SECRET` | Mesmo segredo configurado em `HISTORY_API_SECRET` do Apps Script |
| `RENDER_APP_PASSWORD` (opcional) | Senha interna do serviço Render, para o proxy público **somente leitura** da Shopee Ads |
| `RENDER_SHOPEE_URL` (opcional) | `https://redeachados-shopee.onrender.com` |

**Não configure** `APP_ACCESS_PASSWORD` nem `SESSION_SECRET`: não são mais usados nesta versão sem login.

Após salvar as variáveis, execute um novo deploy para garantir que as funções carregaram as configurações.

## 4. Migrar os registros existentes

1. No Render V16 atual, baixe o **backup JSON**.
2. No novo endereço Netlify, use **Restaurar backup JSON** para importar seus produtos e modificações.
3. Clique em **Sincronizar agora**.
4. Confirme na interface **Sincronizado com Google Drive** e verifique o arquivo `Rede_Achados_BR_Ads_Historico.json` na pasta privada.
5. Abra o endereço em outro navegador e confirme que os registros são os mesmos.
6. Só considere a migração concluída depois do teste de **salvar em um navegador e consultar no outro**.

Não compartilhe o link até confirmar que o histórico está corretamente armazenado e que você aceita o acesso livre à edição.

## Limites importantes

- A interface pública pode alterar somente **dados do Decisor Ads**, não anúncios Shopee.
- A sincronização usa o SKU para identificar produtos e IDs únicos para alterações; o Drive funciona como fonte compartilhada após configurado.
- A exclusão é propagada entre navegadores, com marcadores para impedir que registros apagados reapareçam.
- A sincronização falha sem as variáveis do Drive, mas mantém uma cópia no navegador e mostra o erro.
- Para impedir edições indesejadas ou identificar quem fez uma mudança, seria necessário adicionar autenticação ou outra barreira. Com acesso público, não há identificação confiável do autor.
