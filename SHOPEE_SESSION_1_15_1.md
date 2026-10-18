# Shopee Manager 1.15.1 — continuidade da sessão

O login usava o MemoryStore do express-session. Ao suspender ou reiniciar o serviço Render, o cookie do navegador continuava válido, mas a sessão desaparecia do servidor.

As sessões agora ficam em uma tabela privada do Supabase, com acesso exclusivo do backend. A chave persistida é um HMAC do identificador da sessão e dos segredos do aplicativo. Não são armazenadas senhas nem credenciais da Shopee. A alteração de APP_PASSWORD invalida as sessões anteriores. O prazo do cookie continua em 12 horas.

O login regenera o identificador e confirma a gravação antes de responder. O logout remove a sessão; uma atualização concorrente não pode recriá-la. Falhas no armazenamento não liberam o acesso. A migração `supabase/shopee_app_sessions.sql` deve ser aplicada antes do deploy. Sessões perdidas pela versão anterior exigem um novo login.

Validação: testes de reinicialização do armazenamento, expiração, troca de senha, logout concorrente, indisponibilidade e autenticação HTTP entre duas instâncias, além da pré-execução autenticada da Shopee.
