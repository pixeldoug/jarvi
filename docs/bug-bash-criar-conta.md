<script setup>
import BugBashTracker from './bug-bash/BugBashTracker.vue'
</script>

# Bug bash — Criar conta

Checklist para testar o fluxo de criar conta e onboarding web (`/criar-conta`). Feito contra o código atual (incluindo o complete idempotente e a recuperação do chat no reload).

Em cada item, marque **passed**, **partially passed** ou **failed**. Failed e partially passed abrem um campo de comentário. O progresso fica neste navegador.

**Fora de escopo:** login de quem já terminou o onboarding, settings, billing, WhatsApp no app depois de logado.

**Ambiente:** app web + API. Use um número/e-mail que ninguém mais esteja usando.

**Como reportar:** título curto + passos + esperado vs atual + print/vídeo + device + se era conta nova ou existente.

```
Título: [fluxo] o que quebrou
Passos:
1.
2.
Esperado:
Atual:
Conta: nova WhatsApp / nova Google / existente
Device: desktop / iPhone / Android
Anexo: print ou vídeo
```

Severidade: **P0** não cria conta / não entra / dados de outra pessoa · **P1** onboarding incompleto, tarefas duplicadas ou chat errado · **P2** validação/copy/layout · **P3** polish.

---

## Mapa do fluxo

Duas formas de nascer conta:

1. **WhatsApp (caminho principal)** — `/criar-conta` ou `/login`  
   Número → OTP → entrevista → “Preparando…” → home com chat e tarefas.
2. **Google** — `/login/email` → “Entrar com Google”  
   Conta nova **pula o WhatsApp** e cai direto na entrevista.

Não existe formulário de e-mail + senha para criar conta. Em `/login/email`, “Criar conta” abre o WhatsApp.

Quem está logado **sem** onboarding concluído é mandado para `/criar-conta`.  
Quem **já concluiu** e ainda tem o seed do chat (ou já consumiu nesta sessão) e abre `/criar-conta` vai para a home.

**Entrevista (não tem voltar):**

| Etapa | Pergunta | Obrigatório? |
|-------|----------|--------------|
| WhatsApp | Número + código | Só se a conta ainda não tem WhatsApp / não veio de e-mail ou Google |
| Nome | “Como você prefere ser chamado?” | Sim — vazio ou “Você” não vale |
| Hábitos | chips (inclui “Outros”) | Sim — pelo menos 1; “Outros” exige texto |
| Dores | checklist (inclui “Outros”) | Sim — pelo menos 1; “Outros” exige texto |
| Jarvi ideal | textarea | Não |
| Primeiras tarefas | composer + “Precisa de ideias?” | Sim — pelo menos 1 título |

O composer está em modo ideia: **sem data/hora na UI**. O backend grava os títulos como vieram (máx. 16; capitaliza o título). Extração por IA só roda se a lista estruturada vier vazia.

Depois: **Preparando tudo para você…** → home com chat aberto (boas-vindas + card da tarefa + pergunta/choices) e seção **Sem data** aberta.

---

## Tracker

<ClientOnly>
  <BugBashTracker id="criar-conta" />
</ClientOnly>
