import Anthropic from '@anthropic-ai/sdk';
import { GmailEmail } from './gmailService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailTaskSuggestion {
  isActionable: boolean;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  category: string | null;
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

const getAnthropicClient = (): Anthropic => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um assistente de produtividade que analisa emails e decide se precisam virar tarefas.

REGRA PRINCIPAL: Em caso de dúvida, crie a tarefa. É melhor sugerir uma tarefa desnecessária do que perder algo importante.

ACIONÁVEL (isActionable: true):
- Pedidos diretos de ação de qualquer pessoa ("pode fazer X?", "precisa comprar", "responda até...")
- Prazos ou deadlines com consequência (conta encerrada, multa, expiração)
- Problemas que exigem resolução (armazenamento cheio, pagamento pendente, documento vencendo)
- Solicitações de reunião, aprovação ou revisão
- Qualquer email onde NÃO responder ou agir causa algum prejuízo

NÃO ACIONÁVEL (isActionable: false) — SOMENTE:
- Newsletters e digests de conteúdo sem pedido de ação
- Recibos/confirmações de compras já realizadas (apenas informativos)
- Notificações de redes sociais (curtidas, seguidores, comentários)
- Extratos bancários de movimentações já concluídas

EXEMPLOS:

Remetente: Aureliah Milagres | Assunto: Compras
Corpo: "Douglas, precisa comprar um VALE lá no Dr. Augusto pra fazer colageno e botox. URGENTE!"
→ {"isActionable":true,"title":"Comprar vale no Dr. Augusto (colageno e botox)","priority":"high","category":"Pessoal"}

Remetente: no-reply@dlocal.com | Assunto: Pedido Facebook_Direct_BR efetuado, finalize seu pagamento com PIX
Corpo: "Seu pedido está aguardando pagamento via PIX. Finalize para não perder."
→ {"isActionable":true,"title":"Finalizar pagamento PIX - Facebook Ads","priority":"high","category":"Financeiro"}

Remetente: iCloud | Assunto: Your iCloud storage is full
Corpo: "Your iCloud storage is full. Upgrade your plan or free up space."
→ {"isActionable":true,"title":"Resolver armazenamento iCloud cheio","priority":"medium","category":"Pessoal"}

Remetente: Avenue | Assunto: Mantenha sua Conta corrente ativa
Corpo: "Lembrete: aceite nossos termos até 27/04. Caso você não confirme, sua conta será encerrada."
→ {"isActionable":true,"title":"Aceitar termos da Avenue até 27/04","priority":"high","due_date":"2026-04-27","category":"Financeiro"}

Remetente: Meta for Business | Assunto: Seu recibo de fundos da Meta
Corpo: "Você adicionou R$88,78 à sua conta de anúncios."
→ {"isActionable":false}

Remetente: ben's bites | Assunto: Big lab leaks - Headless software
Corpo: "Newsletter semanal sobre IA..."
→ {"isActionable":false}

Prioridade:
- high: urgente, tem prazo próximo ou causa prejuízo se ignorado
- medium: importante, pode esperar alguns dias
- low: pode esperar mais de uma semana

Responda APENAS com JSON válido, sem texto adicional.`;

// ---------------------------------------------------------------------------
// Analysis function
// ---------------------------------------------------------------------------

export const analyzeEmail = async (
  email: GmailEmail,
  today: string,
): Promise<EmailTaskSuggestion> => {
  const client = getAnthropicClient();

  const userMessage = `Data de hoje: ${today}

Remetente: ${email.from}
Assunto: ${email.subject}
Data do email: ${email.date}

Conteúdo:
${email.body || email.snippet}

Responda com JSON no formato:
{
  "isActionable": boolean,
  "title": "título curto e objetivo da tarefa (se acionável)",
  "description": "descrição com contexto do email (se acionável)",
  "priority": "low" | "medium" | "high",
  "due_date": "YYYY-MM-DD ou null",
  "category": "categoria ou null"
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    return buildNonActionable();
  }

  try {
    const jsonText = content.text.trim();
    const cleaned = jsonText.startsWith('```')
      ? jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      : jsonText;

    const parsed = JSON.parse(cleaned) as Partial<EmailTaskSuggestion>;

    const result = {
      isActionable: Boolean(parsed.isActionable),
      title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      priority: (['low', 'medium', 'high'] as const).includes(
        parsed.priority as 'low' | 'medium' | 'high',
      )
        ? (parsed.priority as 'low' | 'medium' | 'high')
        : 'medium',
      due_date: typeof parsed.due_date === 'string' && parsed.due_date !== 'null'
        ? parsed.due_date
        : null,
      category: typeof parsed.category === 'string' && parsed.category !== 'null'
        ? parsed.category
        : null,
    };

    console.log(`[gmailAnalysis] "${email.subject.slice(0, 60)}" → actionable=${result.isActionable} priority=${result.priority}`);
    return result;
  } catch (err) {
    console.error('[gmailAnalysisService] Failed to parse AI response:', err, content.text);
    return buildNonActionable();
  }
};

const buildNonActionable = (): EmailTaskSuggestion => ({
  isActionable: false,
  title: '',
  description: '',
  priority: 'low',
  due_date: null,
  category: null,
});

// ---------------------------------------------------------------------------
// Batch analysis
// ---------------------------------------------------------------------------

export const analyzeEmails = async (
  emails: GmailEmail[],
): Promise<Array<{ email: GmailEmail; suggestion: EmailTaskSuggestion; analyzed: boolean }>> => {
  const today = new Date().toISOString().split('T')[0];
  const results: Array<{ email: GmailEmail; suggestion: EmailTaskSuggestion; analyzed: boolean }> = [];

  for (const email of emails) {
    try {
      const suggestion = await analyzeEmail(email, today);
      results.push({ email, suggestion, analyzed: true });
    } catch (err) {
      console.error(`[gmailAnalysisService] Failed to analyze email ${email.id}:`, err);
      results.push({ email, suggestion: buildNonActionable(), analyzed: false });
    }
  }

  return results;
};
