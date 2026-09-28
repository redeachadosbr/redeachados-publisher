# Atualização visual · Publisher V5.4.14

O aplicativo recebeu uma nova interface em preto, dourado e fundo claro. A versão funcional permanece V5.4.14.

## Como atualizar o aplicativo que já funciona

No mesmo projeto usado atualmente, substitua:

- `public/index.html`
- `public/styles.css`

Adicione:

- `public/ui.js`

Envie esses três arquivos juntos para o repositório conectado ao Render e aguarde o deploy habitual. Atualize a página depois que o deploy terminar. Se uma aba antiga continuar aberta, feche-a e abra novamente o aplicativo.

Para essa atualização visual, não é necessário substituir `server.js`, `public/app.js`, `package.json`, `data/`, `uploads/`, variáveis do Render ou credenciais. Os dados locais de rascunho usam a mesma chave da versão anterior.

O ZIP contém o projeto completo para referência. Para atualizar a instalação em uso, aplique somente os três arquivos indicados acima; assim você preserva os dados atuais da instalação.

## O que mudou

- Envio manual e busca WeDrop reunidos em uma área compacta.
- Menu lateral no computador e navegação adaptada no celular.
- Prévia de vídeo ao lado dos campos no computador.
- Campos menores e organizados em colunas, conforme a largura disponível.
- Legendas separadas em abas: TikTok, Instagram e comentário de compra.
- Contadores de caracteres, atalhos de teclado nas abas e foco visível.
- Configurações separadas em Loja e catálogo, Inteligência artificial, TikTok e Instagram / Meta.
- Canais e histórico organizados em painéis laterais no computador.
- Ações de publicar, copiar, restaurar e trocar vídeo preservadas.

## Verificação realizada

- Sintaxe JavaScript de `server.js`, `public/app.js` e `public/ui.js` verificada.
- Todos os IDs originais preservados, sem IDs duplicados.
- Campos, limites de caracteres, arquivos aceitos e conexões com os controles existentes conferidos.
- Comparação com o ZIP original: código de funcionamento, servidor, catálogo, dados, dependências, Docker e configuração Render mantidos byte a byte.
- Nenhuma publicação real foi enviada durante a atualização.

A prévia no navegador deste ambiente foi bloqueada. Por isso, o layout foi revisado pelo código, mas sua aparência e os fluxos completos não foram validados em um navegador em execução. Após aplicar os três arquivos, confira a seleção de vídeo, a troca das abas e as configurações no seu computador e iPhone.
