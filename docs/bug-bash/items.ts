export interface BugBashSection {
  id: string;
  title: string;
  note?: string;
  items: { id: string; text: string }[];
}

export const BUG_BASH_CRIAR_CONTA: BugBashSection[] = [
  {
    id: 'happy-a',
    title: 'A. Conta nova pelo WhatsApp (`/criar-conta`)',
    items: [
      { id: 'a-phone-ui', text: 'Abre “Digite seu whatsapp”, país 🇧🇷 e placeholder (11) 99000-9900' },
      { id: 'a-footer-login', text: 'Footer “Já tem uma conta? Entrar” vai para /login' },
      { id: 'a-send-code', text: 'Número BR válido → “Continuar” envia código' },
      { id: 'a-confirm-edit', text: 'Tela “Confirme seu WhatsApp” mostra o número + “Editar”' },
      { id: 'a-otp-auto', text: 'OTP de 6 dígitos avança sozinho ao completar' },
      { id: 'a-interview', text: 'Entrevista: nome → hábitos → dores → texto livre → 2–3 tarefas → “Criar minhas tarefas”' },
      { id: 'a-preparing', text: 'Preparing: passos animam e termina em “Tudo pronto. Vamos começar.”' },
      { id: 'a-home-chat', text: 'Home: tarefas na lista; chat aberto com “Bem-vindo, {nome}!” e follow-up' },
      { id: 'a-sem-data', text: 'Seção Sem data vem aberta (tarefas sem due date visíveis)' },
      { id: 'a-reload-home', text: 'Recarregar a home não reabre o chat de onboarding' },
      { id: 'a-revisit', text: '/criar-conta de novo, na mesma sessão, vai para a home (já concluído)' },
    ],
  },
  {
    id: 'happy-b',
    title: 'B. Conta nova pelo Google (`/login/email`)',
    items: [
      { id: 'b-skip-wa', text: 'Google cria sessão e não pede WhatsApp' },
      { id: 'b-stepper', text: 'Stepper tem 5 pontos (sem etapa WhatsApp)' },
      { id: 'b-name', text: 'Nome pode vir pré-preenchido com o nome do Google (editável)' },
      { id: 'b-complete', text: 'Concluir onboarding igual ao happy path A' },
      { id: 'b-no-wa', text: 'Home + tarefas + chat; WhatsApp não precisa estar conectado' },
    ],
  },
  {
    id: 'happy-c',
    title: 'C. Marketing → app',
    items: [
      { id: 'c-cta', text: 'CTA do site abre {app}/criar-conta' },
      { id: 'c-utm', text: 'UTMs na URL não quebram a página' },
      { id: 'c-flow', text: 'Fluxo A completa normalmente' },
    ],
  },
  {
    id: 'recovery',
    title: 'Recuperação (mudou no review)',
    note: 'O complete agora é idempotente: se o backend já concluiu, um segundo request não cria tarefas de novo. Reusa pelo título (case-insensitive, pt-BR) e devolve o chat.',
    items: [
      { id: 'r-double', text: 'Clique duplo / Enter repetido em “Criar minhas tarefas”: uma lista, sem duplicatas' },
      { id: 'r-reload-preparing', text: 'Recarregar durante o Preparing (depois do request ter ido): volta ao Preparing ou entra no app; não duplica tarefas; chat de boas-vindas ainda aparece' },
      { id: 'r-reload-home', text: 'Recarregar depois de entrar na home: home normal, chat não reabre' },
      { id: 'r-reopen-tab', text: 'Fechar a aba no meio do Preparing e abrir /criar-conta de novo: recupera (Preparing → home + chat), sem tarefas novas' },
      { id: 'r-old-user', text: 'Conta já onboardada há tempo, sessão nova, abrir /criar-conta (ex.: CTA do marketing): confirme o comportamento. Hoje pode mostrar Preparing e reabrir o chat — se acontecer para usuário antigo, anote' },
      { id: 'r-fail-after', text: 'Se o complete falhar depois de já estar marcado como concluído no user: deve ir para a home, não ficar preso no form com erro' },
    ],
  },
  {
    id: 'entries',
    title: 'Entradas e contas existentes',
    items: [
      { id: 'e-new-wa', text: '/login + WhatsApp novo → entrevista (não a home vazia)' },
      { id: 'e-done-wa', text: '/login + WhatsApp já onboardado → home, sem entrevista' },
      { id: 'e-mid-wa', text: '/login + WhatsApp existente sem onboarding → entrevista, sem OTP de novo no meio' },
      { id: 'e-done-google', text: 'Google já onboardado em /login/email → home (sem flash longo de / e volta)' },
      { id: 'e-logged-out', text: 'Sem sessão, abrir / ou /settings → /login' },
      { id: 'e-incomplete', text: 'Logado sem onboarding, abrir / → /criar-conta' },
    ],
  },
  {
    id: 'otp',
    title: 'WhatsApp / OTP',
    note: 'OTP vale 10 min, 5 tentativas. Depois precisa pedir de novo.',
    items: [
      { id: 'o-short', text: 'Número BR curto (< 10 dígitos) → “Digite um número válido com DDD.”' },
      { id: 'o-empty', text: 'Campo vazio / lixo → erro, não some a tela' },
      { id: 'o-country', text: 'Países PT / US / AR: seletor fecha, DDI muda, máscara faz sentido' },
      { id: 'o-wrong', text: 'Código errado → erro, campos continuam usáveis' },
      { id: 'o-resend', text: '“Reenviar” manda de novo e não trava o botão' },
      { id: 'o-edit', text: '“Editar” volta ao número, código some' },
      { id: 'o-reload', text: 'Recarregar depois de pedir o código: número e tela de OTP voltam' },
      { id: 'o-taken', text: 'Número já ligado a outra conta → erro claro, não cria sessão errada' },
      { id: 'o-lockout', text: '5 códigos errados → pede código novo' },
      { id: 'o-double', text: 'Double-tap em Continuar / Reenviar: loading visível, sem dois OTPs órfãos na UX' },
    ],
  },
  {
    id: 'interview',
    title: 'Entrevista e composer',
    items: [
      { id: 'i-empty-name', text: 'Continuar no nome vazio → “Diga como você prefere ser chamado.”' },
      { id: 'i-voce', text: 'Nome “Você” → mesmo bloqueio' },
      { id: 'i-tracking', text: 'Hábitos sem seleção → “Selecione ao menos uma opção.”' },
      { id: 'i-other', text: 'Só “Outros” sem texto → pede descrição' },
      { id: 'i-pain', text: 'Dores: mesma lógica' },
      { id: 'i-open', text: 'Jarvi ideal vazio → deixa passar' },
      { id: 'i-enter', text: 'Enter no input de nome/outros avança; no composer não submete o form (só adiciona linha)' },
      { id: 'i-composer', text: 'Composer: várias linhas, editar título, remover (lixeira)' },
      { id: 'i-empty-tasks', text: '“Criar minhas tarefas” com lista vazia → “Conte pelo menos uma coisa…”' },
      { id: 'i-dup-title', text: 'Duas linhas com o mesmo título: no app deve aparecer uma tarefa (reuse por título)' },
      { id: 'i-caps', text: 'Título pode ser capitalizado no backend — não trate capitalização sozinha como bug' },
      { id: 'i-ideas', text: '“Precisa de ideias?” abre sheet; categorias (Saúde, Dinheiro, Casa, Documentos, Pessoas); clicar exemplo adiciona e fecha' },
      { id: 'i-esc', text: 'Esc / clique fora fecha o sheet' },
      { id: 'i-dup-idea', text: 'Exemplo repetido não duplica' },
      { id: 'i-stepper', text: 'Stepper avança a cada etapa' },
      { id: 'i-reload', text: 'Recarregar no meio da entrevista: progresso da entrevista some (esperado). WhatsApp autenticado deve voltar na entrevista, não no número' },
      { id: 'i-no-back', text: 'Não há botão Voltar entre perguntas (esperado)' },
    ],
  },
  {
    id: 'preparing',
    title: 'Preparing → home',
    items: [
      { id: 'p-error', text: 'Erro de API / rede volta ao form com mensagem, sem tela preta' },
      { id: 'p-infinite', text: 'Preparing não fica infinita se o backend falhar' },
      { id: 'p-titles', text: 'Tarefas na home batem com o que foi digitado (título reconhecível)' },
      { id: 'p-name', text: 'Chat: boas-vindas com o primeiro nome da entrevista, não “Você”' },
      { id: 'p-choices', text: 'Choices do follow-up (se aparecerem) são clicáveis e não repetem o texto da pergunta abaixo' },
      { id: 'p-card', text: 'Card de tarefa no chat abre/seleciona a tarefa certa' },
      { id: 'p-wa-welcome', text: 'Se WhatsApp estava verificado na primeira conclusão: template de boas-vindas no WhatsApp (best-effort). Falha de envio não impede entrar no app' },
      { id: 'p-no-resent', text: 'Reconstrução (reload / segundo complete) não deve mandar o WhatsApp de boas-vindas de novo' },
    ],
  },
  {
    id: 'visual',
    title: 'Visual / device',
    note: 'Testar desktop (~1280) e mobile (~390).',
    items: [
      { id: 'v-theme', text: 'Tema claro forçado (mesmo com sistema em dark)' },
      { id: 'v-keyboard', text: 'Teclado no mobile não esconde o CTA' },
      { id: 'v-scroll', text: 'Chips/checklist scrollam; fade inferior não tapa a última opção' },
      { id: 'v-sheet', text: 'Sheet de ideias não estoura a viewport' },
      { id: 'v-preparing', text: 'Preparing em tela cheia, logo legível' },
      { id: 'v-motion', text: 'prefers-reduced-motion: ainda entra no app (pode pular animação)' },
    ],
  },
];
