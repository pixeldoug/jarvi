'use client';

import { useMemo, useRef, useState } from 'react';
import type {
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Button } from '../components/Button';
import { Stepper } from '../components/Stepper';
import styles from './OnboardingWizard.module.css';

type InterviewAvailability = 'yes' | 'no' | 'later' | null;
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10;
type SelectionField =
  | 'areas'
  | 'taskOrigins'
  | 'trackingMethods'
  | 'painPoints'
  | 'desiredCapabilities';

interface Option {
  value: string;
  label: string;
}

interface OnboardingFormData {
  name: string;
  email: string;
  areas: string[];
  areasOther: string;
  taskOrigins: string[];
  taskOriginsOther: string;
  trackingMethods: string[];
  trackingMethodsOther: string;
  painPoints: string[];
  painPointsOther: string;
  desiredCapabilities: string[];
  desiredCapabilitiesOther: string;
  idealOutcomeText: string;
  interviewAvailability: InterviewAvailability;
  contactValue: string;
  wantsBroadcastUpdates: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^\+?\d{10,15}$/;
const TOTAL_FORM_STEPS = 9;
const LAST_FORM_STEP_INDEX = 8;

const AREA_OPTIONS: Option[] = [
  { value: 'work', label: 'Trabalho' },
  { value: 'personal-projects', label: 'Projetos pessoais' },
  { value: 'finances', label: 'Finanças' },
  { value: 'studies', label: 'Estudos' },
  { value: 'family', label: 'Família' },
  { value: 'health', label: 'Saúde' },
  { value: 'routine', label: 'Rotina do dia a dia' },
  { value: 'other', label: 'Outros' },
];

const TASK_ORIGIN_OPTIONS: Option[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'meetings', label: 'Reuniões' },
  { value: 'thoughts', label: 'Surgem na minha cabeça durante o dia' },
  { value: 'slack-teams', label: 'Slack, Teams e etc' },
  { value: 'calendar', label: 'Calendário' },
  { value: 'in-person', label: 'Alguém me pede algo pessoalmente' },
  { value: 'other', label: 'Outros' },
];

const TRACKING_METHOD_OPTIONS: Option[] = [
  { value: 'mobile-notes', label: 'Anotações no celular' },
  { value: 'paper-notebook', label: 'Papel & caderno' },
  { value: 'self-whatsapp', label: 'WhatsApp comigo mesmo' },
  { value: 'agenda-calendar', label: 'Agenda & Calendário' },
  { value: 'spreadsheets', label: 'Planilhas' },
  { value: 'productivity-apps', label: 'Apps de produtividade (Notion, ClickUp, etc)' },
  { value: 'memory-only', label: 'Tento lembrar de cabeça' },
  { value: 'no-system', label: 'Não tenho um sistema para isso' },
  { value: 'other', label: 'Outros' },
];

const PAIN_POINT_OPTIONS: Option[] = [
  { value: 'forget-fast-capture', label: 'Esqueço o que preciso fazer se não registrar rápido' },
  { value: 'no-single-source', label: 'Não tenho um lugar único para registrar minhas tarefas' },
  { value: 'multiple-channels', label: 'Minhas tarefas surgem em vários lugares diferentes' },
  { value: 'context-too-slow', label: 'Adicionar contexto às tarefas leva tempo demais' },
  { value: 'dont-know-context', label: 'Não sei bem o que escrever no contexto das tarefas' },
  { value: 'hard-project-breakdown', label: 'É difícil organizar projetos com muitas tarefas' },
  { value: 'dont-know-start', label: 'Quando tenho muitas tarefas, acabo sem saber por onde começar' },
  { value: 'other', label: 'Outros' },
];

const DESIRED_CAPABILITY_OPTIONS: Option[] = [
  { value: 'chat-prompts', label: 'Criar tarefas usando prompts em formato de chat' },
  { value: 'weekly-summary', label: 'Resumir sua semana & ajudar a planejar a próxima' },
  { value: 'history-suggestions', label: 'Sugerir tarefas com base no seu histórico e hábitos' },
  { value: 'next-actions', label: 'Sugerir próximas ações após criar ou concluir tarefas' },
  { value: 'goal-prioritization', label: 'Ajudar a priorizar tarefas com base nos seus objetivos' },
  {
    value: 'whatsapp-to-task',
    label: 'Transformar mensagens, documentos & áudios do WhatsApp em tarefas',
  },
  {
    value: 'auto-writing',
    label: 'Corrigir automaticamente o texto para que você foque apenas na ideia da tarefa',
  },
  { value: 'other', label: 'Outra coisa' },
];

const INTERVIEW_OPTIONS: Option[] = [
  { value: 'yes', label: 'Sim' },
  { value: 'no', label: 'Não' },
  { value: 'later', label: 'Talvez mais tarde' },
];

const INITIAL_DATA: OnboardingFormData = {
  name: '',
  email: '',
  areas: [],
  areasOther: '',
  taskOrigins: [],
  taskOriginsOther: '',
  trackingMethods: [],
  trackingMethodsOther: '',
  painPoints: [],
  painPointsOther: '',
  desiredCapabilities: [],
  desiredCapabilitiesOther: '',
  idealOutcomeText: '',
  interviewAvailability: null,
  contactValue: '',
  wantsBroadcastUpdates: false,
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeWhatsapp(value: string): string {
  return value.trim().replace(/[^\d+]/g, '');
}

function formatList(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function getLabelsFromSelection(
  options: Option[],
  selected: string[],
  otherText: string
): string[] {
  const labels = options
    .filter((option) => selected.includes(option.value) && option.value !== 'other')
    .map((option) => option.label);

  if (selected.includes('other') && otherText.trim()) {
    labels.push(otherText.trim());
  }

  return labels;
}

function buildMemorySeed(data: OnboardingFormData): string {
  const areaLabels = getLabelsFromSelection(AREA_OPTIONS, data.areas, data.areasOther);
  const taskOriginLabels = getLabelsFromSelection(
    TASK_ORIGIN_OPTIONS,
    data.taskOrigins,
    data.taskOriginsOther
  );
  const trackingMethodLabels = getLabelsFromSelection(
    TRACKING_METHOD_OPTIONS,
    data.trackingMethods,
    data.trackingMethodsOther
  );
  const painPointLabels = getLabelsFromSelection(
    PAIN_POINT_OPTIONS,
    data.painPoints,
    data.painPointsOther
  );
  const desiredCapabilityLabels = getLabelsFromSelection(
    DESIRED_CAPABILITY_OPTIONS,
    data.desiredCapabilities,
    data.desiredCapabilitiesOther
  );

  const lines: string[] = [];

  if (data.name.trim()) {
    lines.push(`Você se chama ${data.name.trim()}.`);
  }
  if (areaLabels.length > 0) {
    lines.push(`Você quer organizar melhor: ${formatList(areaLabels)}.`);
  }
  if (taskOriginLabels.length > 0) {
    lines.push(`Suas tarefas costumam aparecer por: ${formatList(taskOriginLabels)}.`);
  }
  if (trackingMethodLabels.length > 0) {
    lines.push(`Hoje você registra tarefas usando: ${formatList(trackingMethodLabels)}.`);
  }
  if (painPointLabels.length > 0) {
    lines.push(`Os principais desafios atuais são: ${formatList(painPointLabels)}.`);
  }
  if (desiredCapabilityLabels.length > 0) {
    lines.push(`Você espera que a Jarvi ajude com: ${formatList(desiredCapabilityLabels)}.`);
  }
  if (data.idealOutcomeText.trim()) {
    lines.push(`Resultado ideal para você: ${data.idealOutcomeText.trim()}`);
  }

  if (lines.length === 0) {
    return 'Conte um pouco sobre sua rotina para a Jarvi te ajudar melhor.';
  }

  return lines.join('\n');
}

function getStepError(step: StepIndex, data: OnboardingFormData): string | null {
  if (step === 0) {
    if (!data.name.trim()) return 'Digite como você prefere ser chamado.';
    return null;
  }

  if (step === 1) {
    const normalizedEmail = normalizeEmail(data.email);
    if (!normalizedEmail) return 'Digite seu email.';
    if (!EMAIL_REGEX.test(normalizedEmail)) return 'Digite um email válido.';
    return null;
  }

  if (step === 2) {
    if (data.areas.length === 0) return 'Selecione ao menos uma área.';
    if (data.areas.includes('other') && !data.areasOther.trim()) {
      return 'Descreva o que entra em "Outros".';
    }
    return null;
  }

  if (step === 3) {
    if (data.taskOrigins.length === 0) return 'Selecione ao menos uma opção.';
    if (data.taskOrigins.length > 3) return 'Escolha no máximo 3 opções.';
    if (data.taskOrigins.includes('other') && !data.taskOriginsOther.trim()) {
      return 'Descreva o que entra em "Outros".';
    }
    return null;
  }

  if (step === 4) {
    if (data.trackingMethods.length === 0) return 'Selecione ao menos uma opção.';
    if (data.trackingMethods.includes('other') && !data.trackingMethodsOther.trim()) {
      return 'Descreva o que entra em "Outros".';
    }
    return null;
  }

  if (step === 5) {
    if (data.painPoints.length === 0) return 'Selecione ao menos um desafio.';
    if (data.painPoints.includes('other') && !data.painPointsOther.trim()) {
      return 'Descreva o que entra em "Outros".';
    }
    return null;
  }

  if (step === 6) {
    if (data.desiredCapabilities.length === 0) return 'Selecione ao menos uma opção.';
    if (data.desiredCapabilities.includes('other') && !data.desiredCapabilitiesOther.trim()) {
      return 'Descreva o que entra em "Outra coisa".';
    }
    return null;
  }

  if (step === 7) {
    if (!data.idealOutcomeText.trim()) {
      return 'Conte em uma ou duas frases o que seria ideal para você.';
    }
    return null;
  }

  if (step === 8) {
    if (!data.interviewAvailability) return 'Escolha uma opção para seguir.';
    if (data.interviewAvailability === 'yes') {
      if (!data.contactValue.trim()) return 'Informe um WhatsApp ou email para contato.';
      const normalizedEmail = normalizeEmail(data.contactValue);
      const normalizedWhatsapp = normalizeWhatsapp(data.contactValue);
      const isValidContact =
        EMAIL_REGEX.test(normalizedEmail) || WHATSAPP_REGEX.test(normalizedWhatsapp);
      if (!isValidContact) return 'Use um WhatsApp com DDI ou email válido.';
    }
    return null;
  }

  return null;
}

interface SelectionChipsProps {
  options: Option[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  maxSelections?: number;
}

function SelectionChips({
  options,
  selectedValues,
  onToggle,
  maxSelections,
}: SelectionChipsProps) {
  return (
    <div className={styles.chipContainer}>
      {options.map((option) => {
        const isSelected = selectedValues.includes(option.value);
        const isDisabled =
          !isSelected && typeof maxSelections === 'number' && selectedValues.length >= maxSelections;
        return (
          <button
            key={option.value}
            type="button"
            className={isSelected ? styles.chipActive : styles.chip}
            onClick={() => onToggle(option.value)}
            disabled={isDisabled}
            aria-pressed={isSelected}
          >
            <span>{option.label}</span>
            {isSelected && <span className={styles.chipClose}>×</span>}
          </button>
        );
      })}
    </div>
  );
}

interface SelectionChecklistProps {
  options: Option[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}

function SelectionChecklist({ options, selectedValues, onToggle }: SelectionChecklistProps) {
  return (
    <div className={styles.checklist}>
      {options.map((option) => {
        const isSelected = selectedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={styles.checklistItem}
            onClick={() => onToggle(option.value)}
            aria-pressed={isSelected}
          >
            <span className={isSelected ? styles.checkboxActive : styles.checkbox} aria-hidden="true">
              {isSelected ? '✓' : ''}
            </span>
            <span className={styles.checklistLabel}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OnboardingWizard() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState<StepIndex>(0);
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_DATA);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const generatedMemory = useMemo(
    () => buildMemorySeed(formData),
    [
      formData.name,
      formData.areas,
      formData.areasOther,
      formData.taskOrigins,
      formData.taskOriginsOther,
      formData.trackingMethods,
      formData.trackingMethodsOther,
      formData.painPoints,
      formData.painPointsOther,
      formData.desiredCapabilities,
      formData.desiredCapabilitiesOther,
      formData.idealOutcomeText,
    ]
  );

  const showSuccessState = step === 10;
  const isFinalStep = step === LAST_FORM_STEP_INDEX;

  const updateField = <T extends keyof OnboardingFormData>(field: T, value: OnboardingFormData[T]) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const toggleSelection = (
    field: SelectionField,
    value: string,
    maxSelections?: number
  ) => {
    setFormData((previous) => {
      const currentValues = previous[field];
      const hasValue = currentValues.includes(value);
      let nextValues: string[];

      if (hasValue) {
        nextValues = currentValues.filter((item) => item !== value);
      } else if (typeof maxSelections === 'number' && currentValues.length >= maxSelections) {
        return previous;
      } else {
        nextValues = [...currentValues, value];
      }

      const nextState: OnboardingFormData = { ...previous, [field]: nextValues };
      if (value !== 'other' || nextValues.includes('other')) return nextState;

      if (field === 'areas') nextState.areasOther = '';
      if (field === 'taskOrigins') nextState.taskOriginsOther = '';
      if (field === 'trackingMethods') nextState.trackingMethodsOther = '';
      if (field === 'painPoints') nextState.painPointsOther = '';
      if (field === 'desiredCapabilities') nextState.desiredCapabilitiesOther = '';

      return nextState;
    });
  };

  const submitOnboarding = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const normalizedContact = formData.contactValue.trim();
      const normalizedEmail = normalizeEmail(normalizedContact);
      const normalizedWhatsapp = normalizeWhatsapp(normalizedContact);
      const contactType = EMAIL_REGEX.test(normalizedEmail)
        ? 'email'
        : WHATSAPP_REGEX.test(normalizedWhatsapp)
          ? 'whatsapp'
          : null;

      const payload = {
        flowVersion: 'figma-onboarding-v1',
        source: 'marketing-onboarding',
        name: formData.name.trim(),
        email: normalizeEmail(formData.email),
        areas: formData.areas,
        taskOrigins: formData.taskOrigins,
        trackingMethods: formData.trackingMethods,
        painPoints: formData.painPoints,
        desiredCapabilities: formData.desiredCapabilities,
        otherDetails: {
          areas: formData.areasOther.trim() || undefined,
          taskOrigins: formData.taskOriginsOther.trim() || undefined,
          trackingMethods: formData.trackingMethodsOther.trim() || undefined,
          painPoints: formData.painPointsOther.trim() || undefined,
          desiredCapabilities: formData.desiredCapabilitiesOther.trim() || undefined,
        },
        idealOutcomeText: formData.idealOutcomeText.trim(),
        interviewAvailability: formData.interviewAvailability,
        contactValue: formData.interviewAvailability === 'yes' ? normalizedContact : '',
        contactType: formData.interviewAvailability === 'yes' ? contactType : null,
        wantsBroadcastUpdates: formData.wantsBroadcastUpdates,
        memorySeedText: generatedMemory,
      };

      const response = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setErrorMessage(data.error || 'Não foi possível enviar sua solicitação agora.');
        return;
      }

      setStep(10);
    } catch (error) {
      console.error('Onboarding submit error:', error);
      setErrorMessage('Não foi possível enviar sua solicitação agora.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (isSubmitting) return;

    const validationError = getStepError(step, formData);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    if (isFinalStep) {
      await submitOnboarding();
      return;
    }

    setStep((previous) => (previous + 1) as StepIndex);
  };

  const handleFormSubmit = (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleContinue();
  };

  const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.repeat) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'A') return;

    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  const renderStep = () => {
    if (showSuccessState) {
      return (
        <div className={styles.successContent}>
          <div className={styles.successLogo}>
            <img
              src="/assets/icons/logo-icon.svg"
              alt=""
              aria-hidden="true"
            />
          </div>
          <h1>Solicitação enviada! Obrigado por se inscrever.</h1>
          <p>
            Em breve enviaremos um email com instruções para você ser uma das primeiras pessoas a
            experimentar a Jarvi.
          </p>
          <a href="/" className={styles.backToHome}>
            <span aria-hidden="true">←</span>
            Voltar para página principal
          </a>
        </div>
      );
    }

    if (step === 0) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Como você prefere ser chamado?</h1>
          </div>
          <div className={styles.fieldBlock}>
            <input
              className={styles.input}
              value={formData.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="Digite aqui..."
              autoComplete="name"
            />
          </div>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Digite seu email</h1>
          </div>
          <div className={styles.fieldBlock}>
            <input
              className={styles.input}
              value={formData.email}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder="Digite aqui..."
              autoComplete="email"
              inputMode="email"
            />
          </div>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Quais áreas da sua vida você gostaria que a Jarvi te ajudasse a organizar?</h1>
            <p>Você pode escolher mais de uma.</p>
          </div>
          <SelectionChips
            options={AREA_OPTIONS}
            selectedValues={formData.areas}
            onToggle={(value) => toggleSelection('areas', value)}
          />
          {formData.areas.includes('other') && (
            <div className={styles.fieldBlock}>
              <input
                className={styles.input}
                value={formData.areasOther}
                onChange={(event) => updateField('areasOther', event.target.value)}
                placeholder="Ex: viagens, hobbies, casa, pets..."
              />
            </div>
          )}
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Como as tarefas aparecem no seu dia a dia?</h1>
            <p>Você pode escolher até 3 opções</p>
          </div>
          <SelectionChips
            options={TASK_ORIGIN_OPTIONS}
            selectedValues={formData.taskOrigins}
            onToggle={(value) => toggleSelection('taskOrigins', value, 3)}
            maxSelections={3}
          />
          {formData.taskOrigins.includes('other') && (
            <div className={styles.fieldBlock}>
              <input
                className={styles.input}
                value={formData.taskOriginsOther}
                onChange={(event) => updateField('taskOriginsOther', event.target.value)}
                placeholder="Conte de onde essas tarefas também surgem..."
              />
            </div>
          )}
        </>
      );
    }

    if (step === 4) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Como você costuma registrar e acompanhar as suas tarefas?</h1>
          </div>
          <SelectionChips
            options={TRACKING_METHOD_OPTIONS}
            selectedValues={formData.trackingMethods}
            onToggle={(value) => toggleSelection('trackingMethods', value)}
          />
          {formData.trackingMethods.includes('other') && (
            <div className={styles.fieldBlock}>
              <input
                className={styles.input}
                value={formData.trackingMethodsOther}
                onChange={(event) => updateField('trackingMethodsOther', event.target.value)}
                placeholder="Descreva seu método atual..."
              />
            </div>
          )}
        </>
      );
    }

    if (step === 5) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>O que mais te atrapalha na organização delas hoje?</h1>
          </div>
          <SelectionChecklist
            options={PAIN_POINT_OPTIONS}
            selectedValues={formData.painPoints}
            onToggle={(value) => toggleSelection('painPoints', value)}
          />
          {formData.painPoints.includes('other') && (
            <div className={styles.fieldBlock}>
              <input
                className={styles.input}
                value={formData.painPointsOther}
                onChange={(event) => updateField('painPointsOther', event.target.value)}
                placeholder="Conte mais sobre esse desafio..."
              />
            </div>
          )}
        </>
      );
    }

    if (step === 6) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Quais dessas coisas você gostaria que a Jarvi fizesse?</h1>
          </div>
          <SelectionChecklist
            options={DESIRED_CAPABILITY_OPTIONS}
            selectedValues={formData.desiredCapabilities}
            onToggle={(value) => toggleSelection('desiredCapabilities', value)}
          />
          {formData.desiredCapabilities.includes('other') && (
            <div className={styles.fieldBlock}>
              <input
                className={styles.input}
                value={formData.desiredCapabilitiesOther}
                onChange={(event) => updateField('desiredCapabilitiesOther', event.target.value)}
                placeholder="Descreva o que você espera..."
              />
            </div>
          )}
        </>
      );
    }

    if (step === 7) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Se a Jarvi funcionasse perfeitamente para você, o que ela resolveria?</h1>
          </div>
          <div className={styles.fieldBlock}>
            <textarea
              className={styles.textarea}
              value={formData.idealOutcomeText}
              onChange={(event) => updateField('idealOutcomeText', event.target.value)}
              placeholder="Conte em uma ou duas frases. Sua resposta ajuda muito a melhorar o produto."
            />
          </div>
        </>
      );
    }

    if (step === 8) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Você estaria disposto a conversar com a gente para ajudar a melhorar o produto?</h1>
          </div>
          <div className={styles.chipContainer}>
            {INTERVIEW_OPTIONS.map((option) => {
              const isSelected = formData.interviewAvailability === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={isSelected ? styles.chipActive : styles.chip}
                  onClick={() =>
                    updateField('interviewAvailability', option.value as InterviewAvailability)
                  }
                  aria-pressed={isSelected}
                >
                  <span>{option.label}</span>
                  {isSelected && <span className={styles.chipClose}>×</span>}
                </button>
              );
            })}
          </div>

          {formData.interviewAvailability === 'yes' && (
            <div className={styles.fieldBlock}>
              <label className={styles.label} htmlFor="contactInput">
                Qual é o seu WhatsApp ou email para entrarmos em contato?
              </label>
              <input
                id="contactInput"
                className={styles.input}
                value={formData.contactValue}
                onChange={(event) => updateField('contactValue', event.target.value)}
                placeholder="Digite aqui..."
                autoComplete="tel"
              />
            </div>
          )}

          <button
            type="button"
            className={styles.checkboxRow}
            onClick={() => updateField('wantsBroadcastUpdates', !formData.wantsBroadcastUpdates)}
            aria-pressed={formData.wantsBroadcastUpdates}
          >
            <span
              className={formData.wantsBroadcastUpdates ? styles.checkboxActive : styles.checkbox}
              aria-hidden="true"
            >
              {formData.wantsBroadcastUpdates ? '✓' : ''}
            </span>
            <span className={styles.checkboxRowText}>
              Quero receber atualizações da Jarvi no WhatsApp
            </span>
          </button>
          <p className={styles.microcopy}>Fique tranquilo, nós também não gostamos de spam.</p>
        </>
      );
    }

    return null;
  };

  const actionLabel = isSubmitting ? 'Enviando...' : 'Continuar';

  return (
    <main className={styles.page}>
      <img
        src="/assets/images/onboarding-bg.png"
        alt=""
        aria-hidden="true"
        className={styles.bgImage}
      />
      <div className={styles.bgOverlay} />

      <div className={styles.content}>
        <section className={styles.panel}>
          {!showSuccessState && (
            <div className={styles.logo}>
              <img
                src="/assets/icons/logo-icon.svg"
                alt=""
                aria-hidden="true"
                width={28}
                height={33}
              />
            </div>
          )}

          {!showSuccessState ? (
            <form
              ref={formRef}
              className={styles.form}
              onKeyDown={handleFormKeyDown}
              onSubmit={handleFormSubmit}
            >
              <div className={styles.stepContent}>{renderStep()}</div>
              {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
              <Button
                type="submit"
                variant={isFinalStep ? 'primary' : 'secondary'}
                size="lg"
                className={`${styles.actionButton} ${isSubmitting ? styles.actionButtonDisabled : ''}`}
                disabled={isSubmitting}
              >
                {actionLabel}
              </Button>
              {isFinalStep && (
                <p className={styles.termsCopy}>
                  Ao concluir, você concorda com nossos <a href="#">Termos de Uso</a> &{' '}
                  <a href="#">Política de Privacidade</a>.
                </p>
              )}
              <Stepper
                totalSteps={TOTAL_FORM_STEPS}
                currentStep={step}
                className={styles.progress}
              />
            </form>
          ) : (
            renderStep()
          )}
        </section>
      </div>
    </main>
  );
}

