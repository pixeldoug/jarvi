'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { posthog as posthogClient } from '../lib/posthog';
import { Check, Eye, EyeSlash } from '@phosphor-icons/react';
import { Button } from '../components/Button';
import { Stepper } from '../components/Stepper';
import styles from './OnboardingWizard.module.css';

const STEP_NAMES: Record<number, string> = {
  0: 'name',
  1: 'email',
  2: 'tracking_methods',
  3: 'pain_points',
  4: 'desired_capabilities',
  5: 'ideal_outcome',
  6: 'interview_availability',
  7: 'broadcast_updates',
};

type InterviewAvailability = 'yes' | 'no' | 'later' | null;
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type SelectionField =
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
const BASE_FORM_STEPS = 7;

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
  { value: 'hard-prioritization', label: 'Tenho dificuldade em decidir o que é mais importante' },
  { value: 'overwhelmed-many-tasks', label: 'Me sinto sobrecarregado(a) com tudo que tenho pra fazer' },
  { value: 'procrastinate-important', label: 'Procrastino tarefas importantes' },
  { value: 'dont-know-start', label: 'Não sei por onde começar' },
  { value: 'other', label: 'Outros' },
];

const DESIRED_CAPABILITY_OPTIONS: Option[] = [
  { value: 'organize-fast', label: 'Organizar tudo que eu preciso fazer em segundos' },
  { value: 'give-clarity', label: 'Me ajudar a dar mais clareza ao que preciso fazer' },
  { value: 'auto-organize-week', label: 'Organizar minha semana automaticamente' },
  { value: 'decide-what-first', label: 'Me ajudar a priorizar o que fazer primeiro' },
  { value: 'ideas-to-plan', label: 'Transformar ideias e projetos em planos claros' },
  { value: 'suggest-next-steps', label: 'Sugerir próximos passos' },
  { value: 'extract-from-email-notes', label: 'Extrair tarefas de ferramentas externas' },
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
    if (data.trackingMethods.length === 0) {
      return { field: 'trackingMethods', message: 'Selecione ao menos uma opção.' };
    }
    if (data.trackingMethods.includes('other') && !data.trackingMethodsOther.trim()) {
      return { field: 'trackingMethodsOther', message: 'Descreva o que entra em "Outros".' };
    }
    return null;
  }

  if (step === 3) {
    if (data.painPoints.length === 0) {
      return { field: 'painPoints', message: 'Selecione ao menos um desafio.' };
    }
    if (data.painPoints.includes('other') && !data.painPointsOther.trim()) {
      return { field: 'painPointsOther', message: 'Descreva o que entra em "Outros".' };
    }
    return null;
  }

  if (step === 4) {
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

  if (step === 5) {
    return null;
  }

  if (step === 6) {
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
  const posthog = posthogClient;
  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState<StepIndex>(0);
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_DATA);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ValidationErrorField | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordVisible, setAccountPasswordVisible] = useState(false);
  const [accountPasswordError, setAccountPasswordError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  useEffect(() => {
    posthog?.capture('onboarding_started', { step: 0, step_name: STEP_NAMES[0] });
  }, []);

  useEffect(() => {
    if (step === 0 || step === 8) return;
    posthog?.capture('onboarding_step_viewed', {
      step,
      step_name: STEP_NAMES[step] ?? `step_${step}`,
    });
  }, [step]);

  const generatedMemory = useMemo(
    () => buildMemorySeed(formData),
    [
      formData.name,
      formData.trackingMethods,
      formData.trackingMethodsOther,
      formData.painPoints,
      formData.painPointsOther,
      formData.desiredCapabilities,
      formData.desiredCapabilitiesOther,
      formData.idealOutcomeText,
    ]
  );

  const showSuccessState = step === 8;
  const normalizedWhatsappContact = normalizeWhatsapp(formData.contactValue);
  const shouldShowBroadcastStep =
    formData.interviewAvailability === 'yes' && WHATSAPP_REGEX.test(normalizedWhatsappContact);
  const isFinalStep = step === (shouldShowBroadcastStep ? 7 : 6);
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
        trackingMethods: formData.trackingMethods,
        painPoints: formData.painPoints,
        desiredCapabilities: formData.desiredCapabilities,
        otherDetails: {
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
        posthog?.capture('onboarding_submit_failed', {
          reason: data.error ?? 'api_error',
          status_code: response.status,
        });
        setErrorMessage(data.error || 'Não foi possível enviar sua solicitação agora.');
        setErrorField('form');
        return;
      }

      posthog?.capture('onboarding_completed', {
        pain_points: formData.painPoints,
        desired_capabilities: formData.desiredCapabilities,
        interview_availability: formData.interviewAvailability,
        wants_broadcast_updates: formData.wantsBroadcastUpdates,
        total_steps_completed: shouldShowBroadcastStep ? 8 : 7,
      });
      setStep(8);
    } catch (error) {
      console.error('Onboarding submit error:', error);
      posthog?.capture('onboarding_submit_failed', { reason: 'network_error' });
      setErrorMessage('Não foi possível enviar sua solicitação agora.');
      setErrorField('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    if (accountPassword.length < 8) {
      setAccountPasswordError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setAccountPasswordError(null);
    setIsCreatingAccount(true);
    try {
      const response = await fetch('https://app.jarvi.life/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: normalizeEmail(formData.email),
          password: accountPassword,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setAccountPasswordError(data.error || 'Não foi possível criar sua conta agora.');
        return;
      }
      posthog?.capture('account_created', { email: normalizeEmail(formData.email) });
      window.location.href = 'https://app.jarvi.life/';
    } catch {
      setAccountPasswordError('Não foi possível criar sua conta agora.');
    } finally {
      setIsCreatingAccount(false);
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

    posthog?.capture('onboarding_step_completed', {
      step,
      step_name: STEP_NAMES[step] ?? `step_${step}`,
    });

    if (step === 1) {
      const email = normalizeEmail(formData.email);
      posthog?.identify(email, { name: formData.name.trim(), email });
    }

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
      const firstName = formData.name.trim().split(/\s+/)[0] ?? '';
      const displayFirstName = capitalizeFirstLetter(firstName);
      return (
        <div className={styles.accountFormContent}>
          <div className={styles.questionBlock}>
            <h1>
              {displayFirstName ? `Quase lá, ${displayFirstName}!` : 'Quase lá!'}
              <br />
              Crie sua senha.
            </h1>
          </div>
          <div className={styles.fieldBlock}>
            <input
              className={styles.input}
              value={normalizeEmail(formData.email)}
              readOnly
              autoComplete="email"
              inputMode="email"
              aria-label="Email"
            />
          </div>
          <div className={styles.fieldBlock}>
            {accountPasswordError && (
              <label className={`${styles.label} ${styles.labelError}`}>
                {accountPasswordError}
              </label>
            )}
            <div className={styles.passwordWrapper}>
              <input
                className={`${styles.input} ${accountPasswordError ? styles.inputError : ''} ${styles.inputWithIcon}`}
                type={accountPasswordVisible ? 'text' : 'password'}
                value={accountPassword}
                onChange={(event) => {
                  setAccountPassword(event.target.value);
                  if (accountPasswordError) setAccountPasswordError(null);
                }}
                placeholder="Mínimo de 8 caracteres"
                autoComplete="new-password"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setAccountPasswordVisible((v) => !v)}
                aria-label={accountPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {accountPasswordVisible
                  ? <EyeSlash size={20} weight="regular" aria-hidden="true" />
                  : <Eye size={20} weight="regular" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className={`${styles.actionButton} ${isCreatingAccount ? styles.actionButtonDisabled : ''}`}
            disabled={isCreatingAccount}
            onClick={() => { void handleCreateAccount(); }}
          >
            {isCreatingAccount ? 'Criando conta...' : 'Criar conta'}
          </Button>
          <p className={styles.alreadyHaveAccount}>
            Já tem uma conta?{' '}
            <a href="https://app.jarvi.life/" target="_blank" rel="noreferrer">
              Entrar
            </a>
          </p>
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
            <h1>Como você cria e lembra das suas tarefas?</h1>
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

    if (step === 3) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Você lida com algumas das opções abaixo?</h1>
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

    if (step === 4) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Quais dessas opções você gostaria que a Jarvi fizesse?</h1>
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

    if (step === 5) {
      return (
        <>
          <div className={styles.questionBlock}>
            <h1>Como seria a Jarvi ideal para você no dia a dia?</h1>
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

    if (step === 6) {
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

    if (step === 7) {
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
                  Ao concluir, você concorda com nossos{' '}
                  <a href="/termos-de-uso" target="_blank" rel="noreferrer">
                    Termos de Uso
                  </a>{' '}
                  &{' '}
                  <a href="/politica-de-privacidade" target="_blank" rel="noreferrer">
                    Política de Privacidade
                  </a>
                  .
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

