import type { PostHog } from 'posthog-js';

export const POSTHOG_SURVEY_REPORT_PROBLEM = '01a01cc5-ac23-0000-6eec-2a9f49fd77f1';
export const POSTHOG_SURVEY_SUGGEST_IDEAS = '01a01cc5-ac8c-0000-4aa9-8bad04a47643';

export type FeedbackKind = 'report' | 'ideas';

export interface FeedbackSurveyQuestion {
  id: string;
  question: string;
}

export interface FeedbackSurveyConfig {
  kind: FeedbackKind;
  surveyId: string;
  title: string;
  subtitle: string;
  submitLabel: string;
  successToast: string;
  questions: [
    FeedbackSurveyQuestion & { label: string; placeholder: string; optional: false },
    FeedbackSurveyQuestion & { label: string; placeholder: string; optional: true },
  ];
}

export const FEEDBACK_SURVEYS: Record<FeedbackKind, FeedbackSurveyConfig> = {
  report: {
    kind: 'report',
    surveyId: POSTHOG_SURVEY_REPORT_PROBLEM,
    title: 'Reportar problema',
    subtitle: 'Conte o que aconteceu. Vamos analisar com o contexto da sua sessão.',
    submitLabel: 'Enviar',
    successToast: 'Problema enviado. Obrigado!',
    questions: [
      {
        id: 'e5caaf5b-331f-4a79-bd7a-ada7141ad215',
        question: 'O que deu errado?',
        label: 'O que deu errado?',
        placeholder: 'Descreva o que aconteceu...',
        optional: false,
      },
      {
        id: '7d6a736b-f78c-41b3-9caf-84cbc957a450',
        question: 'Em qual tela ou ação isso aconteceu?',
        label: 'Em qual tela ou ação isso aconteceu?',
        placeholder: 'Ex: lista de tarefas, calendário, ao criar uma nota',
        optional: true,
      },
    ],
  },
  ideas: {
    kind: 'ideas',
    surveyId: POSTHOG_SURVEY_SUGGEST_IDEAS,
    title: 'Sugerir ideias',
    subtitle: 'Pode ser um recurso novo ou uma melhoria em algo que já existe.',
    submitLabel: 'Enviar',
    successToast: 'Ideia enviada. Obrigado!',
    questions: [
      {
        id: '2abecab1-19b1-4090-9cbe-6ecaf83017b3',
        question: 'Qual ideia você gostaria de ver no Jarvi?',
        label: 'Qual ideia você gostaria de ver no Jarvi?',
        placeholder: 'Conte a ideia...',
        optional: false,
      },
      {
        id: 'a9d8844b-c373-4e95-86b6-cc626f3fd5e6',
        question: 'Por que isso seria útil pra você?',
        label: 'Por que isso seria útil pra você?',
        placeholder: 'Opcional — ajuda a priorizar',
        optional: true,
      },
    ],
  },
};

function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function captureFeedbackShown(posthog: PostHog | undefined, config: FeedbackSurveyConfig): void {
  posthog?.capture('survey shown', {
    $survey_id: config.surveyId,
    $survey_name: config.title,
  });
}

export function captureFeedbackDismissed(
  posthog: PostHog | undefined,
  config: FeedbackSurveyConfig
): void {
  posthog?.capture('survey dismissed', {
    $survey_id: config.surveyId,
    $survey_name: config.title,
  });
}

export function captureFeedbackSent(
  posthog: PostHog | undefined,
  config: FeedbackSurveyConfig,
  answers: [string, string]
): void {
  const [primary, secondary] = answers;
  const properties: Record<string, unknown> = {
    $survey_id: config.surveyId,
    $survey_name: config.title,
    $survey_completed: true,
    $survey_submission_id: newSubmissionId(),
    $survey_questions: config.questions.map(({ id, question }) => ({ id, question })),
    $survey_response: primary,
    [`$survey_response_${config.questions[0].id}`]: primary,
  };

  if (secondary.trim()) {
    properties[`$survey_response_${config.questions[1].id}`] = secondary.trim();
  }

  posthog?.capture('survey sent', properties);
}
