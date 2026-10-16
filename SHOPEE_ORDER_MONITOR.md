# Monitor de vendas e prazos — Shopee Rede Achados BR

## Fontes de regras e dados
- [Shopee Brasil: Cancelamento e prazo para envio](https://help.shopee.com.br/portal/4/article/76324-%5BCancelamento%20do%20pedido%5D%20Por%20que%20meu%20pedido%20foi%20cancelado%20automaticamente%20pela%20Shopee%3F): geralmente até 2 dias úteis após pagamento para produtos comuns, com condições específicas para encomendas.
- O monitor **não calcula um prazo fixo de dois dias**: usa `ship_by_date` retornado pelo detalhe oficial do pedido/pacote, considera o mais próximo de múltiplos pacotes.
- `get_order_list` para localização de pedidos; `get_order_detail` para `ship_by_date`, `pay_time`, `pickup_done_time` e status. Apenas IDs, status e timestamps são persistidos.
- `SHIPPED`, `TO_CONFIRM_RECEIVE` e `COMPLETED` representam pedido já enviado. `PROCESSED` não é tratado como prova de postagem.

## Módulo instalado
- Aba **Monitor de envios** com pedidos pendentes ordenados por risco.
- Alertas de nova venda paga, cancelamento, confirmação de envio e prazos em 48h, 24h, 6h, 2h e vencido.
- Sem `ship_by_date`: alerta **Conferir prazo**, sem inventar data.
- Prioridades recalculadas a cada consulta, mesmo se o pedido não tiver atualização recente.
- Sincronização periódica a cada 5 minutos **enquanto o serviço Render estiver ativo**; botão de verificação imediata.
- Histórico persistido por loja e pedido em tabelas novas `shopee_order_watch` e `shopee_order_alerts` do Supabase; chaves únicas para evitar alertas duplicados.
- Projeção mínima, sem dados pessoais dos compradores.
- Botão para ativar notificação deste navegador enquanto a página estiver aberta.

## Configuração de Telegram — opcional, necessária para avisos fora do navegador
No Environment **apenas** de `redeachados-shopee`:
- `SHOPEE_ALERT_TELEGRAM_BOT_TOKEN`: token privado do bot criado pelo próprio titular via BotFather.
- `SHOPEE_ALERT_TELEGRAM_CHAT_ID`: identificador privado do chat autorizado.
- Nunca enviar credenciais por chat ou print.
- `SHOPEE_ORDER_MONITOR_ENABLED=false` pode suspender verificações se necessário. Sem a variável, o monitor inicia com autenticação Shopee Live + Supabase configurados.

## Limitações e operação
- A versão atual usa polling (não webhooks Shopee); notificações podem demorar aproximadamente 5 minutos além do tempo necessário para resposta da API.
- Instâncias **gratuitas** ou que entram em suspensão não executam timers enquanto inativas. Para garantia real de 24/7, requeremos hospedagem que não suspenda o serviço ou scheduler independente; avaliar custo antes de ativar.
- A leitura de `ship_by_date` pode variar por modalidade. Não se deve usar prazo calculado com calendário local como garantia oficial.
- Caso Telegram não esteja configurado, os alertas ficam disponíveis no painel, e o navegador pode notificar enquanto o painel estiver aberto.
- Não marca o pedido como enviado; isso depende do retorno oficial da Shopee. Não agenda retirada, gera etiqueta nem altera pedidos automaticamente.
- Em caso de falha da consulta, o painel exibe o último erro; nada é marcado como entregue. Se Telegram falhar, o histórico ainda registra o aviso e erro de entrega.
- Ao iniciar pela primeira vez, pedidos históricos não geram alertas falsos de **nova venda** (salvo vendas da última hora), mas continuam sujeitos a avisos de prazo.
- Não toca no serviço Mercado Livre.

## Validação
1. Conferir `/api/health` (versão 1.3.0).
2. Abrir **Monitor de envios** e clicar em **Verificar pedidos agora**.
3. Verificar horário da última consulta, pedidos pendentes e avisos de prazo.
4. Comparar o prazo de 1 ou 2 pedidos com o Seller Center Shopee.
5. Testar transição real de um novo pedido e, quando houver, de envio. Alertas históricos não são reemitidos.
6. Configurar o canal de Telegram caso sejam desejadas notificações fora do navegador e executar um teste controlado.

## Validação de continuidade (versão 1.3.1)

- O monitor persiste no Supabase a **última tentativa, última execução bem-sucedida e último erro** na tabela `shopee_monitor_runs`. Esses dados sobrevivem a reinícios e suspensões do Render.
- O painel sinaliza verde se sincronizou há no máximo cerca de 12 minutos, e destaque de alerta se a última sincronização está atrasada ou a última tentativa falhou.
- Uma tela verde **não significa garantia de próximos alertas**: ela prova somente a última sincronização. O plano Render Free pode hibernar após inatividade e suspender o processo.
- Para acompanhar um pedido real, abra **Monitor de envios** e use **Verificar pedidos agora**. Cheque o prazo contra a Central do Vendedor.
- Sem upgrade ou scheduler externo, não alegar atendimento garantido 24/7.
- **Canal externo desabilitado por padrão:** somente envia Telegram se `SHOPEE_ALERT_CHANNEL=telegram` for configurado expressamente. Sem essa variável (ou com `panel`), os alertas são somente painel/browser e nenhuma mensagem externa é enviada.
- O navegador necessita permissão e página aberta para avisos; com navegador fechado ou computador desligado, os eventos ficam registrados no painel para consulta posterior.
