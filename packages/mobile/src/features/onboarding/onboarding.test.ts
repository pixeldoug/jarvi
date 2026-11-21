import { i18n } from '@/i18n';
import { defaultCountryIso, validateNationalNumber } from '@/lib/phone';
import {
  buildMemorySeed,
  buildOnboardingChat,
  createDraftTask,
  serializeDraftTasks,
  stepError,
  type OnboardingAnswers,
} from './onboarding';

const answers = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  name: 'Ana',
  trackingMethods: ['mobile-notes', 'spreadsheets', 'other'],
  trackingMethodsOther: 'Post-its',
  painPoints: ['dont-know-start'],
  painPointsOther: '',
  idealOutcomeText: 'Lembrar das contas',
  tasks: [createDraftTask('Renovar CNH', '2026-01-07')],
  ...patch,
});

afterEach(() => {
  void i18n.changeLanguage('pt-BR');
});

describe('onboarding text in pt-BR (unchanged)', () => {
  it('builds the memory seed', () => {
    expect(buildMemorySeed(answers())).toBe(
      [
        'Você se chama Ana.',
        'Hoje você registra tarefas usando: Anotações no celular, Planilhas e Post-its.',
        'Os principais desafios atuais são: Não sei por onde começar.',
        'A Jarvi ideal no dia a dia: Lembrar das contas',
      ].join('\n'),
    );
    expect(
      buildMemorySeed(answers({ name: 'Você', trackingMethods: [], painPoints: [], idealOutcomeText: '' })),
    ).toBe('Conte um pouco sobre sua rotina para a Jarvi te ajudar melhor.');
  });

  it('serializes the first tasks with dates', () => {
    const tasks = [
      createDraftTask('Renovar CNH', '2026-01-07'),
      { ...createDraftTask('Pagar IPVA', '2026-10-28'), time: '09:00' },
      createDraftTask('Sem data'),
      createDraftTask('  '),
    ];
    expect(serializeDraftTasks(tasks)).toBe('Renovar CNH (7 Jan)\nPagar IPVA (28 Out, 09:00)\nSem data');
  });

  it('validates steps', () => {
    expect(stepError('name', answers({ name: 'Você' }))).toBe('Diga como você prefere ser chamado.');
    expect(stepError('tracking', answers({ trackingMethods: ['other'], trackingMethodsOther: '' }))).toBe(
      'Descreva o que entra em "Outros".',
    );
    expect(stepError('first_tasks', answers({ tasks: [createDraftTask()] }))).toBe(
      'Conte pelo menos uma coisa que você precisa fazer.',
    );
  });

  it('greets once in the first chat message', () => {
    const chat = buildOnboardingChat({ followUp: { ack: 'Pronto!', question: 'Quando?', choices: [] } }, 'Ana');
    expect(chat?.[0]?.content).toBe('Bem-vindo, Ana!\n\nPronto!');
    const greeted = buildOnboardingChat({ followUp: { ack: 'Bem-vinda, Ana!', question: 'Quando?', choices: [] } });
    expect(greeted?.[0]?.content).toBe('Bem-vinda, Ana!');
  });
});

describe('onboarding text in en-US', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en-US');
  });

  it('builds the memory seed in English', () => {
    expect(buildMemorySeed(answers({ idealOutcomeText: 'Remember my bills' }))).toBe(
      [
        'You go by Ana.',
        'Right now you keep track of tasks using: Notes on my phone, Spreadsheets, and Post-its.',
        "Your main challenges right now: I don't know where to start.",
        'What the ideal Jarvi looks like in your day: Remember my bills',
      ].join('\n'),
    );
  });

  it('serializes dates and times in English', () => {
    const tasks = [{ ...createDraftTask('Renew my passport', '2026-01-07'), time: '14:30' }];
    expect(serializeDraftTasks(tasks)).toBe('Renew my passport (Jan 7, 2:30 PM)');
  });

  it('does not greet twice when the backend already welcomes in English', () => {
    const chat = buildOnboardingChat({ followUp: { ack: 'Welcome aboard, Ana!', question: 'When?', choices: [] } }, 'Ana');
    expect(chat?.[0]?.content).toBe('Welcome aboard, Ana!');
    const plain = buildOnboardingChat({ followUpMessage: 'When?' }, 'Ana');
    expect(plain?.[0]?.content).toBe('Welcome, Ana!\n\nAll set, I created your first tasks.');
  });

  it('validates phone numbers in English', () => {
    expect(validateNationalNumber('(11) 9900', 'BR')).toBe('Enter a valid number with area code.');
    expect(validateNationalNumber('1234567', 'US')).toBe('Enter a valid number.');
  });
});

describe('default sign-in country', () => {
  it('follows the UI language', () => {
    expect(defaultCountryIso('pt-BR')).toBe('BR');
    expect(defaultCountryIso('en-US')).toBe('US');
  });
});
