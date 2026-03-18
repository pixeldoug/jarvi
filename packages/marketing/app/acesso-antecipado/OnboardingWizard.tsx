'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Check } from '@phosphor-icons/react';
import { Button } from '../components/Button';
import { Stepper } from '../components/Stepper';
import styles from './OnboardingWizard.module.css';

type InterviewAvailability = 'yes' | 'no' | 'later' | null;
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
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

type ValidationErrorField =
  | 'name'
  | 'email'
  | 'areas'
  | 'areasOther'
  | 'taskOrigins'
  | 'taskOriginsOther'
  | 'trackingMethods'
  | 'trackingMethodsOther'
  | 'painPoints'
  | 'painPointsOther'
  | 'desiredCapabilities'
  | 'desiredCapabilitiesOther'
  | 'idealOutcomeText'
  | 'interviewAvailability'
  | 'contactValue'
  | 'form';

interface StepValidationError {
  field: ValidationErrorField;
  message: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^\+?\d{10,15}$/;
const BASE_FORM_STEPS = 9;

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
  { value: 'forget-fast-capture', label: 'Esqueço tarefas se não anoto na hora' },
  { value: 'no-single-source', label: 'Não tenho um lugar único para registrar tarefas' },
  { value: 'multiple-channels', label: 'Minhas tarefas ficam espalhadas' },
  { value: 'hard-project-breakdown', label: 'Tenho dificuldade em organizar projetos' },
  { value: 'dont-know-context', label: 'Não sei como descrever minhas tarefas' },
  { value: 'context-too-slow', label: 'Adicionar contexto leva tempo demais' },
  { value: 'dont-know-start', label: 'Quando tenho muitas tarefas, não sei por onde começar' },
  { value: 'hard-prioritization', label: 'Tenho dificuldade em priorizar o que é mais importante' },
  { value: 'overwhelmed-many-tasks', label: 'Me sinto sobrecarregado(a) com tantas tarefas' },
  { value: 'procrastinate-important', label: 'Procrastino tarefas importantes' },
  {
    value: 'tools-dont-work',
    label: 'Já uso ferramentas, mas elas não funcionam bem para mim',
  },
  { value: 'other', label: 'Outros' },
];

const DESIRED_CAPABILITY_OPTIONS: Option[] = [
  { value: 'auto-organize-week', label: 'Organizar minha semana automaticamente' },
  { value: 'decide-what-first', label: 'Me ajudar a decidir o que fazer primeiro' },
  { value: 'project-breakdown', label: 'Quebrar um projeto em etapas simples' },
  { value: 'ideas-to-plan', label: 'Transformar ideias soltas em um plano claro' },
  { value: 'suggest-next-steps', label: 'Sugerir próximos passos' },
  { value: 'reorganize-on-delay', label: 'Reorganizar tudo quando algo atrasar' },
  { value: 'extract-from-email-notes', label: 'Extrair tarefas dos meus emails e anotações' },
  { value: 'auto-manage-calendar', label: 'Cuidar do meu calendário automaticamente' },
  { value: 'execute-tasks-when-possible', label: 'Executar tarefas pra mim quando possível' },
  { value: 'chat-to-organize-ideas', label: 'Conversar comigo pra organizar minhas ideias' },
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

function capitalizeFirstLetter(value: string): string {
  if (!value) return '';
  return value[0]!.toUpperCase() + value.slice(1);
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

function getStepError(step: StepIndex, data: OnboardingFormData): StepValidationError | null {
  if (step === 0) {
    if (!data.name.trim()) {
      return { field: 'name', message: 'Digite como você prefere ser chamado.' };
    }
    return null;
  }

  if (step === 1) {
    const normalizedEmail = normalizeEmail(data.email);
    if (!normalizedEmail) return { field: 'email', message: 'Digite seu email.' };
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return { field: 'email', message: 'Digite um email válido.' };
    }
    return null;
  }

  if (step === 2) {
    if (data.areas.length === 0) {
      return { field: 'areas', message: 'Selecione ao menos uma área.' };
    }
    if (data.areas.includes('other') && !data.areasOther.trim()) {
      return { field: 'areasOther', message: 'Descreva o que entra em "Outros".' };
    }
    return null;
  }

  if (step === 3) {
    if (data.taskOrigins.length === 0) {
      return { field: 'taskOrigins', message: 'Selecione ao menos uma opção.' };
    }
    if (data.taskOrigins.includes('other') && !data.taskOriginsOther.trim()) {
      return { field: 'taskOriginsOther', message: 'Descreva o que entra em "Outros".' };
    }
    return null;
  }

  if (step === 4) {
    if (data.trackingMethods.length === 0) {
      return { field: 'trackingMethods', message: 'Selecione ao menos uma opção.' };
    }
    if (data.trackingMethods.includes('other') && !data.trackingMethodsOther.trim()) {
      return { field: 'trackingMethodsOther', message: 'Descreva o que entra em "Outros".' };
    }
    return null;
  }

  if (step === 5) {
    if (data.painPoints.length === 0) {
      return { field: 'painPoints', message: 'Selecione ao menos um desafio.' };
    }
    if (data.painPoints.includes('other') && !data.painPointsOther.trim()) {
      return { field: 'painPointsOther', message: 'Descreva o que entra em "Outros".' };
    }
    return null;
  }

  if (step === 6) {
    if (data.desiredCapabilities.length === 0) {
      return { field: 'desiredCapabilities', message: 'Selecione ao menos uma opção.' };
    }
    if (data.desiredCapabilities.includes('other') && !data.desiredCapabilitiesOther.trim()) {
      return {
        field: 'desiredCapabilitiesOther',
        message: 'Descreva o que entra em "Outra coisa".',
      };
    }
    return null;
  }

  if (step === 7) {
    if (!data.idealOutcomeText.trim()) {
      return {
        field: 'idealOutcomeText',
        message: 'Conte em uma ou duas frases o que seria ideal para você.',
      };
    }
    return null;
  }

  if (step === 8) {
    if (!data.interviewAvailability) {
      return { field: 'interviewAvailability', message: 'Escolha uma opção para seguir.' };
    }
    if (data.interviewAvailability === 'yes') {
      if (!data.contactValue.trim()) {
        return { field: 'contactValue', message: 'Informe um WhatsApp ou email para contato.' };
      }
      const normalizedEmail = normalizeEmail(data.contactValue);
      const normalizedWhatsapp = normalizeWhatsapp(data.contactValue);
      const isValidContact =
        EMAIL_REGEX.test(normalizedEmail) || WHATSAPP_REGEX.test(normalizedWhatsapp);
      if (!isValidContact) {
        return { field: 'contactValue', message: 'Use um WhatsApp com DDI ou email válido.' };
      }
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
  compact?: boolean;
}

function SelectionChips({
  options,
  selectedValues,
  onToggle,
  maxSelections,
  compact = false,
}: SelectionChipsProps) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const otherOptionRef = useRef<HTMLButtonElement | null>(null);
  const hasOtherSelected = selectedValues.includes('other');

  useEffect(() => {
    if (!hasOtherSelected) return;
    otherOptionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [hasOtherSelected, compact]);

  const scrollAreaClassName = [
    styles.optionsScrollArea,
    compact ? styles.optionsScrollAreaCompact : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.optionsScrollFrame}>
      <div className={scrollAreaClassName} ref={scrollAreaRef}>
        <div className={styles.chipContainer}>
          {options.map((option) => {
            const isSelected = selectedValues.includes(option.value);
            const isDisabled =
              !isSelected && typeof maxSelections === 'number' && selectedValues.length >= maxSelections;
            const chipClassName = [
              isSelected ? styles.chipActive : styles.chip,
              option.value === 'other' ? styles.otherOptionAnchor : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={option.value}
                type="button"
                ref={option.value === 'other' ? otherOptionRef : undefined}
                className={chipClassName}
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
      </div>
    </div>
  );
}

interface SelectionChecklistProps {
  options: Option[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  compact?: boolean;
}

function SelectionChecklist({
  options,
  selectedValues,
  onToggle,
  compact = false,
}: SelectionChecklistProps) {
  const otherOptionRef = useRef<HTMLButtonElement | null>(null);
  const hasOtherSelected = selectedValues.includes('other');

  useEffect(() => {
    if (!hasOtherSelected) return;
    otherOptionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [hasOtherSelected, compact]);

  const scrollAreaClassName = [
    styles.optionsScrollArea,
    compact ? styles.optionsScrollAreaCompact : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.optionsScrollFrame}>
      <div className={scrollAreaClassName}>
        <div className={styles.checklist}>
          {options.map((option) => {
            const isSelected = selectedValues.includes(option.value);
            const checklistItemClassName = [
              styles.checklistItem,
              option.value === 'other' ? styles.otherOptionAnchor : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={option.value}
                type="button"
                ref={option.value === 'other' ? otherOptionRef : undefined}
                className={checklistItemClassName}
                onClick={() => onToggle(option.value)}
                aria-pressed={isSelected}
              >
                <span className={isSelected ? styles.checkboxActive : styles.checkbox} aria-hidden="true">
                  {isSelected ? <Check size={14} weight="bold" /> : null}
                </span>
                <span className={styles.checklistLabel}>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.optionsScrollFade} aria-hidden="true" />
    </div>
  );
}

export function OnboardingWizard() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState<StepIndex>(0);
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_DATA);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ValidationErrorField | null>(null);
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
  const normalizedWhatsappContact = normalizeWhatsapp(formData.contactValue);
  const shouldShowBroadcastStep =
    formData.interviewAvailability === 'yes' && WHATSAPP_REGEX.test(normalizedWhatsappContact);
  const isFinalStep = step === (shouldShowBroadcastStep ? 9 : 8);
  const totalFormSteps = shouldShowBroadcastStep ? BASE_FORM_STEPS + 1 : BASE_FORM_STEPS;

  const hasError = (field: ValidationErrorField): boolean => errorField === field && !!errorMessage;
  const getInputClassName = (field: ValidationErrorField): string =>
    hasError(field) ? `${styles.input} ${styles.inputError}` : styles.input;
  const getTextareaClassName = (field: ValidationErrorField): string =>
    hasError(field) ? `${styles.textarea} ${styles.textareaError}` : styles.textarea;

  const updateField = <T extends keyof OnboardingFormData>(field: T, value: OnboardingFormData[T]) => {
    if (errorField && errorField !== 'form') {
      setErrorMessage(null);
      setErrorField(null);
    }
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const toggleSelection = (
    field: SelectionField,
    value: string,
    maxSelections?: number
  ) => {
    if (errorField && errorField !== 'form') {
      setErrorMessage(null);
      setErrorField(null);
    }
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
    setErrorField(null);

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
        setErrorField('form');
        return;
      }

      setStep(10);
    } catch (error) {
      console.error('Onboarding submit error:', error);
      setErrorMessage('Não foi possível enviar sua solicitação agora.');
      setErrorField('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (isSubmitting) return;

    const validationError = getStepError(step, formData);
    if (validationError) {
      setErrorMessage(validationError.message);
      setErrorField(validationError.field);
      return;
    }

    setErrorMessage(null);
    setErrorField(null);
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
            {hasError('name') && errorMessage && (
              <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
            )}
            <input
              className={getInputClassName('name')}
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
      const firstName = formData.name.trim().split(/\s+/)[0] ?? '';
      const displayFirstName = capitalizeFirstLetter(firstName);
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>
              {displayFirstName ? `Olá, ${displayFirstName}! 👋` : 'Olá, 👋!'}
              <br />
              Qual seu email?
            </h1>
          </div>
          <div className={styles.fieldBlock}>
            {hasError('email') && errorMessage && (
              <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
            )}
            <input
              className={getInputClassName('email')}
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
            <h1>Quais áreas da sua vida você quer organizar?</h1>
            {hasError('areas') && errorMessage && (
              <p className={styles.questionError}>{errorMessage}</p>
            )}
          </div>
          <SelectionChips
            options={AREA_OPTIONS}
            selectedValues={formData.areas}
            onToggle={(value) => toggleSelection('areas', value)}
            compact={formData.areas.includes('other')}
          />
          {formData.areas.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('areasOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClassName('areasOther')}
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
            <h1>Como as suas tarefas aparecem no seu dia?</h1>
            {hasError('taskOrigins') && errorMessage && (
              <p className={styles.questionError}>{errorMessage}</p>
            )}
          </div>
          <SelectionChips
            options={TASK_ORIGIN_OPTIONS}
            selectedValues={formData.taskOrigins}
            onToggle={(value) => toggleSelection('taskOrigins', value)}
            compact={formData.taskOrigins.includes('other')}
          />
          {formData.taskOrigins.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('taskOriginsOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClassName('taskOriginsOther')}
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
            <h1>Como você registra e acompanha as suas tarefas?</h1>
            {hasError('trackingMethods') && errorMessage && (
              <p className={styles.questionError}>{errorMessage}</p>
            )}
          </div>
          <SelectionChips
            options={TRACKING_METHOD_OPTIONS}
            selectedValues={formData.trackingMethods}
            onToggle={(value) => toggleSelection('trackingMethods', value)}
            compact={formData.trackingMethods.includes('other')}
          />
          {formData.trackingMethods.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('trackingMethodsOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClassName('trackingMethodsOther')}
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
            <h1>O que mais dificulta você a organizar suas tarefas hoje?</h1>
            {hasError('painPoints') && errorMessage && (
              <p className={styles.questionError}>{errorMessage}</p>
            )}
          </div>
          <SelectionChecklist
            options={PAIN_POINT_OPTIONS}
            selectedValues={formData.painPoints}
            onToggle={(value) => toggleSelection('painPoints', value)}
            compact={formData.painPoints.includes('other')}
          />
          {formData.painPoints.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('painPointsOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClassName('painPointsOther')}
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
            <h1>O que você quer que a Jarvi faça?</h1>
            {hasError('desiredCapabilities') && errorMessage && (
              <p className={styles.questionError}>{errorMessage}</p>
            )}
          </div>
          <SelectionChecklist
            options={DESIRED_CAPABILITY_OPTIONS}
            selectedValues={formData.desiredCapabilities}
            onToggle={(value) => toggleSelection('desiredCapabilities', value)}
            compact={formData.desiredCapabilities.includes('other')}
          />
          {formData.desiredCapabilities.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('desiredCapabilitiesOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClassName('desiredCapabilitiesOther')}
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
            {hasError('idealOutcomeText') && errorMessage && (
              <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
            )}
            <textarea
              className={getTextareaClassName('idealOutcomeText')}
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
            <h1>Topa conversar com com a gente para melhorar o app?</h1>
            {hasError('interviewAvailability') && errorMessage && (
              <p className={styles.questionError}>{errorMessage}</p>
            )}
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
              <label
                className={`${styles.label} ${hasError('contactValue') ? styles.labelError : ''}`}
                htmlFor="contactInput"
              >
                {hasError('contactValue') && errorMessage ? errorMessage : 'Qual o seu WhatsApp?'}
              </label>
              <input
                id="contactInput"
                className={getInputClassName('contactValue')}
                value={formData.contactValue}
                onChange={(event) => updateField('contactValue', event.target.value)}
                placeholder="Digite aqui..."
                autoComplete="tel"
              />
            </div>
          )}
        </>
      );
    }

    if (step === 9) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Último passo</h1>
            <p>Quer receber novidades e melhorias da Jarvi no WhatsApp? Sem spam. Só o que importa.</p>
          </div>
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
              {formData.wantsBroadcastUpdates ? <Check size={14} weight="bold" /> : null}
            </span>
            <span className={styles.checkboxRowText}>
              Sim, receber atualizações no WhatsApp
            </span>
          </button>
        </>
      );
    }

    return null;
  };

  const actionLabel = isSubmitting ? 'Enviando...' : 'Continuar';

  return (
    <main className={styles.page}>
      <img
        src="/assets/images/hero.avif"
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
              {errorMessage && errorField === 'form' && (
                <p className={styles.errorMessage}>{errorMessage}</p>
              )}
              <div className={styles.stepContent}>{renderStep()}</div>
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
                totalSteps={totalFormSteps}
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

