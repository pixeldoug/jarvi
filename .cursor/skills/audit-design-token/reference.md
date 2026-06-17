# Snapshot visual de tokens (Estágio B)

Estágio B da auditoria: gerar PNGs de onde um token aparece, em **web e marketing**, com um comando.

Diferente da abordagem antiga (Storybook + storycap, que só cobria o `packages/web`), o capturador usa **Playwright contra os apps rodando**, então cobre os dois pacotes de forma idêntica. Ele consome a saída `--json` do Estágio A e descobre, via DOM, onde cada seletor do token realmente aparece em cada rota — sem mapeamento frágil de CSS→rota.

## 1. Pré-requisitos

- Playwright + chromium:

```bash
npm install -D playwright && npx playwright install chromium
```

- Servidores rodando (o capturador checa e pula o que estiver offline):

```bash
npm run dev:marketing   # http://localhost:3002
npm run dev:web         # http://localhost:3000  (precisa também do dev:backend)
```

- Para rotas **autenticadas** do web, um JWT válido (ver passo 3).

## 2. Rodar a captura

```bash
node .cursor/skills/audit-design-token/scripts/capture-snapshots.mjs display-lg --scope=web,marketing
# ou via npm:
npm run audit:snap -- display-lg --scope=web,marketing
```

Saída em `.audit-snapshots/<token>/`:
- `marketing__root.png`, `web__tasks.png`, … (1 PNG por rota onde o token aparece, full-page, com os elementos destacados — contorno sólido magenta = match direto/hardcoded; tracejado âmbar = match parcial)
- `index.md` — resumo dos arquivos e seletores capturados.

Flags: `--scope=web,marketing`, `--jwt=<token>`, `--out=<dir>` (default `.audit-snapshots`).

## 3. Autenticação do web

Rotas marcadas com `"auth": true` no manifesto precisam de sessão. O capturador injeta o JWT no `localStorage` (chave `jarvi_token`) antes de navegar. Passe via `--jwt=<token>` ou env `JARVI_AUDIT_TOKEN`. Sem JWT, as rotas autenticadas são puladas com aviso (o marketing e as rotas públicas seguem normalmente).

Para obter um JWT em dev (ver `AGENTS.md`): registre via `POST /api/auth/register`, marque `email_verified = 1` no SQLite, e faça `POST /api/auth/login`.

## 4. Manifesto de rotas

`audit.capture.json` (na raiz da skill) lista as rotas visitadas por pacote. O runner **não** mapeia CSS→rota: ele visita cada rota e detecta os seletores via DOM. Ao auditar um token que aparece numa página nova, adicione a rota ao manifesto. Campos por rota: `path` (obrigatório), `auth` (bool), `waitFor` (seletor opcional para aguardar antes da foto).

## Como os seletores são resolvidos (CSS Modules)

Ambos os pacotes usam CSS Modules, então `.heroTitle` vira uma classe com hash no browser. O runner converte o seletor do Estágio A para uma forma robusta por substring: `.heroTitle` → `[class*="heroTitle"]`, `.ctaCard h2` → `[class*="ctaCard"] h2`, e lida com grupos separados por vírgula.

## Limites

- **Estados específicos**: elementos que só renderizam em certos estados (lista vazia, modal aberto) podem não aparecer numa visita simples. Adicione `waitFor` ou evolua o manifesto com passos de interação por rota.
- **Cobertura = manifesto**: um uso numa rota não listada não é capturado. O `index.md` ajuda a cruzar com o Estágio A para achar lacunas.
- **Inline em `.tsx`**: matches sem seletor CSS não são fotografados (não há seletor para localizar).
