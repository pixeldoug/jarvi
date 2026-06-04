'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent as ReactFormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from '@phosphor-icons/react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Logo, PasswordInput } from '../../components/ui';
import { useForceTheme } from '../../hooks/useForceTheme';
import styles from './CriarConta.module.css';

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// CONSTANTS
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^\+?\d{10,15}$/;
const BASE_FORM_STEPS = 9;

const STEP_NAMES: Record<number, string> = {
  0: 'name',
  1: 'email',
  2: 'areas',
  3: 'task_origins',
  4: 'tracking_methods',
  5: 'pain_points',
  6: 'desired_capabilities',
  7: 'ideal_outcome',
  8: 'interview_availability',
  9: 'broadcast_updates',
};

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

// ============================================================================
// HELPERS
// ============================================================================

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

function getLabelsFromSelection(options: Option[], selected: string[], otherText: string): string[] {
  const labels = options
    .filter((o) => selected.includes(o.value) && o.value !== 'other')
    .map((o) => o.label);
  if (selected.includes('other') && otherText.trim()) labels.push(otherText.trim());
  return labels;
}

function buildMemorySeed(data: OnboardingFormData): string {
  const lines: string[] = [];
  if (data.name.trim()) lines.push(`Você se chama ${data.name.trim()}.`);
  const areas = getLabelsFromSelection(AREA_OPTIONS, data.areas, data.areasOther);
  if (areas.length) lines.push(`Você quer organizar melhor: ${formatList(areas)}.`);
  const origins = getLabelsFromSelection(TASK_ORIGIN_OPTIONS, data.taskOrigins, data.taskOriginsOther);
  if (origins.length) lines.push(`Suas tarefas costumam aparecer por: ${formatList(origins)}.`);
  const tracking = getLabelsFromSelection(TRACKING_METHOD_OPTIONS, data.trackingMethods, data.trackingMethodsOther);
  if (tracking.length) lines.push(`Hoje você registra tarefas usando: ${formatList(tracking)}.`);
  const pain = getLabelsFromSelection(PAIN_POINT_OPTIONS, data.painPoints, data.painPointsOther);
  if (pain.length) lines.push(`Os principais desafios atuais são: ${formatList(pain)}.`);
  const caps = getLabelsFromSelection(DESIRED_CAPABILITY_OPTIONS, data.desiredCapabilities, data.desiredCapabilitiesOther);
  if (caps.length) lines.push(`Você espera que a Jarvi ajude com: ${formatList(caps)}.`);
  if (data.idealOutcomeText.trim()) lines.push(`Resultado ideal para você: ${data.idealOutcomeText.trim()}`);
  return lines.length > 0 ? lines.join('\n') : 'Conte um pouco sobre sua rotina para a Jarvi te ajudar melhor.';
}

function getStepError(step: StepIndex, data: OnboardingFormData): StepValidationError | null {
  if (step === 0) {
    if (!data.name.trim()) return { field: 'name', message: 'Digite como você prefere ser chamado.' };
    return null;
  }
  if (step === 1) {
    const email = normalizeEmail(data.email);
    if (!email) return { field: 'email', message: 'Digite seu email.' };
    if (!EMAIL_REGEX.test(email)) return { field: 'email', message: 'Digite um email válido.' };
    return null;
  }
  if (step === 2) {
    if (!data.areas.length) return { field: 'areas', message: 'Selecione ao menos uma área.' };
    if (data.areas.includes('other') && !data.areasOther.trim()) return { field: 'areasOther', message: 'Descreva o que entra em "Outros".' };
    return null;
  }
  if (step === 3) {
    if (!data.taskOrigins.length) return { field: 'taskOrigins', message: 'Selecione ao menos uma opção.' };
    if (data.taskOrigins.includes('other') && !data.taskOriginsOther.trim()) return { field: 'taskOriginsOther', message: 'Descreva o que entra em "Outros".' };
    return null;
  }
  if (step === 4) {
    if (!data.trackingMethods.length) return { field: 'trackingMethods', message: 'Selecione ao menos uma opção.' };
    if (data.trackingMethods.includes('other') && !data.trackingMethodsOther.trim()) return { field: 'trackingMethodsOther', message: 'Descreva o que entra em "Outros".' };
    return null;
  }
  if (step === 5) {
    if (!data.painPoints.length) return { field: 'painPoints', message: 'Selecione ao menos um desafio.' };
    if (data.painPoints.includes('other') && !data.painPointsOther.trim()) return { field: 'painPointsOther', message: 'Descreva o que entra em "Outros".' };
    return null;
  }
  if (step === 6) {
    if (!data.desiredCapabilities.length) return { field: 'desiredCapabilities', message: 'Selecione ao menos uma opção.' };
    if (data.desiredCapabilities.includes('other') && !data.desiredCapabilitiesOther.trim()) return { field: 'desiredCapabilitiesOther', message: 'Descreva o que entra em "Outra coisa".' };
    return null;
  }
  if (step === 8) {
    if (!data.interviewAvailability) return { field: 'interviewAvailability', message: 'Escolha uma opção para seguir.' };
    if (data.interviewAvailability === 'yes') {
      if (!data.contactValue.trim()) return { field: 'contactValue', message: 'Informe um WhatsApp ou email para contato.' };
      const isValid = EMAIL_REGEX.test(normalizeEmail(data.contactValue)) || WHATSAPP_REGEX.test(normalizeWhatsapp(data.contactValue));
      if (!isValid) return { field: 'contactValue', message: 'Use um WhatsApp com DDI ou email válido.' };
    }
    return null;
  }
  return null;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SelectionChipsProps {
  options: Option[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  maxSelections?: number;
  compact?: boolean;
}

function SelectionChips({ options, selectedValues, onToggle, maxSelections, compact = false }: SelectionChipsProps) {
  const otherRef = useRef<HTMLButtonElement | null>(null);
  const hasOther = selectedValues.includes('other');
  useEffect(() => {
    if (!hasOther) return;
    otherRef.current?.scrollIntoView({ block: 'nearest' });
  }, [hasOther, compact]);

  return (
    <div className={styles.optionsScrollFrame}>
      <div className={compact ? `${styles.optionsScrollArea} ${styles.optionsScrollAreaCompact}` : styles.optionsScrollArea}>
        <div className={styles.chipContainer}>
          {options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            const isDisabled = !isSelected && typeof maxSelections === 'number' && selectedValues.length >= maxSelections;
            return (
              <button
                key={opt.value}
                type="button"
                ref={opt.value === 'other' ? otherRef : undefined}
                className={[isSelected ? styles.chipActive : styles.chip, opt.value === 'other' ? styles.otherOptionAnchor : ''].filter(Boolean).join(' ')}
                onClick={() => onToggle(opt.value)}
                disabled={isDisabled}
                aria-pressed={isSelected}
              >
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.optionsScrollFade} aria-hidden="true" />
    </div>
  );
}

interface SelectionChecklistProps {
  options: Option[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  compact?: boolean;
}

function SelectionChecklist({ options, selectedValues, onToggle, compact = false }: SelectionChecklistProps) {
  const otherRef = useRef<HTMLButtonElement | null>(null);
  const hasOther = selectedValues.includes('other');
  useEffect(() => {
    if (!hasOther) return;
    otherRef.current?.scrollIntoView({ block: 'nearest' });
  }, [hasOther, compact]);

  return (
    <div className={styles.optionsScrollFrame}>
      <div className={compact ? `${styles.optionsScrollArea} ${styles.optionsScrollAreaCompact}` : styles.optionsScrollArea}>
        <div className={styles.checklist}>
          {options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                ref={opt.value === 'other' ? otherRef : undefined}
                className={[styles.checklistItem, opt.value === 'other' ? styles.otherOptionAnchor : ''].filter(Boolean).join(' ')}
                onClick={() => onToggle(opt.value)}
                aria-pressed={isSelected}
              >
                <span className={isSelected ? styles.checkboxActive : styles.checkbox} aria-hidden="true">
                  {isSelected ? <Check size={14} weight="bold" /> : null}
                </span>
                <span className={styles.checklistLabel}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.optionsScrollFade} aria-hidden="true" />
    </div>
  );
}

interface StepperDotsProps {
  totalSteps: number;
  currentStep: number;
}

function StepperDots({ totalSteps, currentStep }: StepperDotsProps) {
  if (totalSteps === 0) return null;
  const safe = Math.min(Math.max(currentStep, 0), totalSteps - 1);
  return (
    <div className={styles.stepper} role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={safe + 1} aria-label="Progresso das etapas">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <span key={i} className={i === safe ? styles.stepActive : styles.step} aria-hidden="true" />
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function CriarConta() {
  useForceTheme('light');

  const navigate = useNavigate();
  const { register } = useAuth();

  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState<StepIndex>(0);
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_DATA);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ValidationErrorField | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Account creation state (step 10)
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordStrength, setAccountPasswordStrength] = useState(0);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const showAccountStep = step === 10;

  const normalizedWhatsappContact = normalizeWhatsapp(formData.contactValue);
  const shouldShowBroadcastStep =
    formData.interviewAvailability === 'yes' && WHATSAPP_REGEX.test(normalizedWhatsappContact);
  const isFinalStep = step === (shouldShowBroadcastStep ? 9 : 8);
  const totalFormSteps = shouldShowBroadcastStep ? BASE_FORM_STEPS + 1 : BASE_FORM_STEPS;

  const generatedMemory = useMemo(
    () => buildMemorySeed(formData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      formData.name, formData.areas, formData.areasOther, formData.taskOrigins,
      formData.taskOriginsOther, formData.trackingMethods, formData.trackingMethodsOther,
      formData.painPoints, formData.painPointsOther, formData.desiredCapabilities,
      formData.desiredCapabilitiesOther, formData.idealOutcomeText,
    ]
  );

  const hasError = (field: ValidationErrorField) => errorField === field && !!errorMessage;
  const getInputClass = (field: ValidationErrorField) =>
    hasError(field) ? `${styles.input} ${styles.inputError}` : styles.input;
  const getTextareaClass = (field: ValidationErrorField) =>
    hasError(field) ? `${styles.textarea} ${styles.textareaError}` : styles.textarea;

  const updateField = <T extends keyof OnboardingFormData>(field: T, value: OnboardingFormData[T]) => {
    if (errorField && errorField !== 'form') { setErrorMessage(null); setErrorField(null); }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleSelection = (field: SelectionField, value: string, maxSelections?: number) => {
    if (errorField && errorField !== 'form') { setErrorMessage(null); setErrorField(null); }
    setFormData((prev) => {
      const current = prev[field];
      const has = current.includes(value);
      let next: string[];
      if (has) {
        next = current.filter((v) => v !== value);
      } else if (typeof maxSelections === 'number' && current.length >= maxSelections) {
        return prev;
      } else {
        next = [...current, value];
      }
      const nextState: OnboardingFormData = { ...prev, [field]: next };
      if (value !== 'other' || next.includes('other')) return nextState;
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
      const normalizedEmailContact = normalizeEmail(normalizedContact);
      const normalizedWhatsapp = normalizeWhatsapp(normalizedContact);
      const contactType = EMAIL_REGEX.test(normalizedEmailContact)
        ? 'email'
        : WHATSAPP_REGEX.test(normalizedWhatsapp)
          ? 'whatsapp'
          : null;

      const payload = {
        flowVersion: 'web-onboarding-v1',
        source: 'web-onboarding',
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

      const response = await fetch(`${API_URL}/api/early-access`, {
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
    } catch {
      setErrorMessage('Não foi possível enviar sua solicitação agora.');
      setErrorField('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    if (accountPasswordStrength < 2) {
      setAccountError('Por favor, escolha uma senha mais forte.');
      return;
    }
    setAccountError(null);
    setIsCreatingAccount(true);
    try {
      const result = await register(
        normalizeEmail(formData.email),
        formData.name.trim(),
        accountPassword,
      );
      if (result.pendingVerification) {
        navigate('/verify-pending', { state: { email: result.email } });
      } else {
        navigate('/');
      }
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Não foi possível criar sua conta agora.');
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
    if (isFinalStep) {
      await submitOnboarding();
      return;
    }
    setStep((prev) => (prev + 1) as StepIndex);
  };

  const handleFormSubmit = (e: ReactFormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void handleContinue();
  };

  const handleFormKeyDown = (e: ReactKeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.repeat) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'A') return;
    e.preventDefault();
    formRef.current?.requestSubmit();
  };

  // ============================================================================
  // RENDER STEPS
  // ============================================================================

  const renderStep = () => {
    if (showAccountStep) {
      const firstName = formData.name.trim().split(/\s+/)[0] ?? '';
      const displayFirstName = capitalizeFirstLetter(firstName);
      return (
        <div className={styles.accountStep}>
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
            <PasswordInput
              id="account-password"
              name="password"
              label=""
              autoComplete="new-password"
              required
              value={accountPassword}
              onChange={(e) => {
                setAccountPassword(e.target.value);
                if (accountError) setAccountError(null);
              }}
              placeholder="Mínimo de 8 caracteres"
              showStrengthMeter
              minStrength={2}
              onStrengthChange={setAccountPasswordStrength}
              userInputs={[normalizeEmail(formData.email), formData.name]}
              helperText="Mínimo de 8 caracteres"
            />
          </div>

          {accountError && <p className={styles.errorMessage}>{accountError}</p>}

          <Button
            type="button"
            variant="primary"
            size="medium"
            fullWidth
            disabled={isCreatingAccount}
            loading={isCreatingAccount}
            onClick={() => { void handleCreateAccount(); }}
          >
            Criar conta
          </Button>

          <div className={styles.footer}>
            <span>Já tem uma conta?</span>
            <button type="button" className={styles.footerLink} onClick={() => navigate('/login')}>
              Entrar
            </button>
          </div>
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
              className={getInputClass('name')}
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Digite aqui..."
              autoComplete="name"
              autoFocus
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
              {displayFirstName ? `Olá, ${displayFirstName}! 👋` : 'Olá! 👋'}
              <br />
              Qual seu email?
            </h1>
          </div>
          <div className={styles.fieldBlock}>
            {hasError('email') && errorMessage && (
              <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
            )}
            <input
              className={getInputClass('email')}
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
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
            {hasError('areas') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
          </div>
          <SelectionChips
            options={AREA_OPTIONS}
            selectedValues={formData.areas}
            onToggle={(v) => toggleSelection('areas', v)}
            compact={formData.areas.includes('other')}
          />
          {formData.areas.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('areasOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClass('areasOther')}
                value={formData.areasOther}
                onChange={(e) => updateField('areasOther', e.target.value)}
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
            {hasError('taskOrigins') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
          </div>
          <SelectionChips
            options={TASK_ORIGIN_OPTIONS}
            selectedValues={formData.taskOrigins}
            onToggle={(v) => toggleSelection('taskOrigins', v)}
            compact={formData.taskOrigins.includes('other')}
          />
          {formData.taskOrigins.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('taskOriginsOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClass('taskOriginsOther')}
                value={formData.taskOriginsOther}
                onChange={(e) => updateField('taskOriginsOther', e.target.value)}
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
            {hasError('trackingMethods') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
          </div>
          <SelectionChips
            options={TRACKING_METHOD_OPTIONS}
            selectedValues={formData.trackingMethods}
            onToggle={(v) => toggleSelection('trackingMethods', v)}
            compact={formData.trackingMethods.includes('other')}
          />
          {formData.trackingMethods.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('trackingMethodsOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClass('trackingMethodsOther')}
                value={formData.trackingMethodsOther}
                onChange={(e) => updateField('trackingMethodsOther', e.target.value)}
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
            <h1>Quais desses problemas você se identifica?</h1>
            {hasError('painPoints') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
          </div>
          <SelectionChecklist
            options={PAIN_POINT_OPTIONS}
            selectedValues={formData.painPoints}
            onToggle={(v) => toggleSelection('painPoints', v)}
            compact={formData.painPoints.includes('other')}
          />
          {formData.painPoints.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('painPointsOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClass('painPointsOther')}
                value={formData.painPointsOther}
                onChange={(e) => updateField('painPointsOther', e.target.value)}
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
            <h1>Quais dessas opções você gostaria que a Jarvi fizesse?</h1>
            {hasError('desiredCapabilities') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
          </div>
          <SelectionChecklist
            options={DESIRED_CAPABILITY_OPTIONS}
            selectedValues={formData.desiredCapabilities}
            onToggle={(v) => toggleSelection('desiredCapabilities', v)}
            compact={formData.desiredCapabilities.includes('other')}
          />
          {formData.desiredCapabilities.includes('other') && (
            <div className={styles.fieldBlock}>
              {hasError('desiredCapabilitiesOther') && errorMessage && (
                <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
              )}
              <input
                className={getInputClass('desiredCapabilitiesOther')}
                value={formData.desiredCapabilitiesOther}
                onChange={(e) => updateField('desiredCapabilitiesOther', e.target.value)}
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
            <h1>Como seria a Jarvi ideal para você no dia a dia?</h1>
          </div>
          <div className={styles.fieldBlock}>
            {hasError('idealOutcomeText') && errorMessage && (
              <label className={`${styles.label} ${styles.labelError}`}>{errorMessage}</label>
            )}
            <textarea
              className={getTextareaClass('idealOutcomeText')}
              value={formData.idealOutcomeText}
              onChange={(e) => updateField('idealOutcomeText', e.target.value)}
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
            <h1>Topa conversar com a gente para melhorar o app?</h1>
            {hasError('interviewAvailability') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
          </div>
          <div className={styles.chipContainer}>
            {INTERVIEW_OPTIONS.map((opt) => {
              const isSelected = formData.interviewAvailability === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={isSelected ? styles.chipActive : styles.chip}
                  onClick={() => updateField('interviewAvailability', opt.value as InterviewAvailability)}
                  aria-pressed={isSelected}
                >
                  <span>{opt.label}</span>
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
                className={getInputClass('contactValue')}
                value={formData.contactValue}
                onChange={(e) => updateField('contactValue', e.target.value)}
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
            <h1>Último passo antes de criar sua conta</h1>
            <p>Quer receber novidades e melhorias da Jarvi no WhatsApp? Sem spam. Só o que importa.</p>
          </div>
          <button
            type="button"
            className={styles.checkboxRow}
            onClick={() => updateField('wantsBroadcastUpdates', !formData.wantsBroadcastUpdates)}
            aria-pressed={formData.wantsBroadcastUpdates}
          >
            <span className={formData.wantsBroadcastUpdates ? styles.checkboxActive : styles.checkbox} aria-hidden="true">
              {formData.wantsBroadcastUpdates ? <Check size={14} weight="bold" /> : null}
            </span>
            <span className={styles.checkboxRowText}>Sim, receber atualizações no WhatsApp</span>
          </button>
        </>
      );
    }

    return null;
  };

  const STEP_NAMES_KEYS = STEP_NAMES;
  void STEP_NAMES_KEYS;

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        <Logo className={styles.logo} />

        {!showAccountStep ? (
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
              size="medium"
              fullWidth
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Enviando...' : 'Continuar'}
            </Button>
            {isFinalStep && (
              <p className={styles.termsCopy}>
                Ao concluir, você concorda com nossos{' '}
                <a href="https://jarvi.life/termos-de-uso" target="_blank" rel="noreferrer">
                  Termos de Uso
                </a>{' '}
                &{' '}
                <a href="https://jarvi.life/politica-de-privacidade" target="_blank" rel="noreferrer">
                  Política de Privacidade
                </a>
                .
              </p>
            )}
            <StepperDots totalSteps={totalFormSteps} currentStep={step} />
          </form>
        ) : (
          renderStep()
        )}
      </div>
    </div>
  );
}

export default CriarConta;
