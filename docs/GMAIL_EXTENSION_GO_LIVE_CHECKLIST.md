# Jarvi Gmail Assistant - Go-Live Checklist

Checklist operacional para colocar a integração Gmail -> Jarvi em produção com segurança.

## Escopo

Fluxo coberto:

- Extensão Chrome (Manifest V3) em `extension/`
- Endpoint de ingestão Gmail em `/api/gmail/ingest`
- Sugestões pendentes em `/api/pending-tasks`
- Confirmação final de task no app web

## O que já está pronto no código

- [x] CORS com allowlist para extensão em produção (`ALLOWED_EXTENSION_IDS`)
- [x] Rate limit dedicado para ingest Gmail
- [x] Idempotência forte para `gmail_message_id` (índice único)
- [x] Tratamento de concorrência para duplicados (retorno limpo, sem 500)
- [x] Truncamento de corpo de email para proteger custo/performance de IA
- [x] Permissões mínimas da extensão (`storage`)

## D-2 - Infra e backend de produção

- [ ] Provisionar PostgreSQL gerenciado (não usar SQLite em produção)
- [ ] Configurar backend com HTTPS e domínio estável
- [ ] Configurar variáveis de ambiente no provedor
- [ ] Fazer deploy do backend e validar endpoint `/health`
- [ ] Executar smoke test de autenticação e APIs principais

### Variáveis obrigatórias (backend)

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=...
OPENAI_API_KEY=...
APP_URL=https://jarvi.life
ALLOWED_EXTENSION_IDS=
```

### Variáveis recomendadas (backend)

```bash
OPENAI_TASK_MODEL=gpt-4o-mini
GMAIL_INGEST_RATE_LIMIT_MAX=12
GMAIL_INGEST_MAX_BODY_CHARS=12000
```

## D-1 - Chrome Web Store

- [ ] Empacotar extensão para publicação
- [ ] Publicar em canal controlado (testers/unlisted) primeiro
- [ ] Publicar/atualizar Política de Privacidade (dados processados do Gmail)
- [ ] Obter o `extension_id` final da Store
- [ ] Atualizar `ALLOWED_EXTENSION_IDS=<extension_id>` e fazer novo deploy do backend

## D-Day - Lançamento

- [ ] Deploy final da API com `ALLOWED_EXTENSION_IDS` ativo
- [ ] Testar fluxo ponta a ponta com usuário real:
  - [ ] Abrir email no Gmail
  - [ ] Clicar em "Add to Jarvi"
  - [ ] Ver sugestão pendente criada
  - [ ] Confirmar task no app
- [ ] Liberar extensão para público alvo
- [ ] Monitorar 2-4h pós-lançamento (erros 401/403/429, OpenAI, latência)

## D+1 / D+2 - Pós-lançamento

- [ ] Revisar taxa de sucesso do funil (ingest -> pending -> confirm)
- [ ] Ajustar rate limit se necessário
- [ ] Ajustar modelo/custo da OpenAI conforme volume
- [ ] Priorizar melhorias de UX sem quebrar o fluxo principal

## Critério de "pode lançar"

- [ ] Backend em produção estável (HTTPS + PostgreSQL)
- [ ] `ALLOWED_EXTENSION_IDS` configurado com ID final
- [ ] Política de privacidade publicada e coerente
- [ ] Fluxo ponta a ponta validado em ambiente real
- [ ] Monitoramento básico ativo

## Notas de segurança

- Nunca commitar `.env` com segredos.
- Rotacionar qualquer credencial que tenha sido exposta em ambiente local.
- Manter token JWT da extensão com ciclo de renovação claro para o usuário.
