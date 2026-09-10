'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent as ReactFormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CaretDown, Check, Plus, X } from '@phosphor-icons/react';
import posthog from 'posthog-js';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Logo } from '../../components/ui';
import { WhatsAppPhoneAuth } from '../../components/features/auth/WhatsAppPhoneAuth';
import { useForceTheme } from '../../hooks/useForceTheme';
import { trackPixel } from '../../lib/metaPixel';
import { captureProductEvent } from '../../lib/productAnalytics';
import { attributionForLead } from '../../lib/attribution';
import {
  TRACKING_METHOD_OPTIONS,
  PAIN_POINT_OPTIONS,
  FIRST_TASK_TOPICS,
  formatList,
  getLabelsFromSelection,
  type OnboardingOption,
} from './onboardingOptions';
import {
  ONBOARDING_CHAT_CONSUMED_KEY,
  ONBOARDING_CHAT_STORAGE_KEY,
  storeOnboardingChatSeed,
  type OnboardingChatSeed,
  type OnboardingCreatedTask,
} from '../../lib/onboardingChatSeed';
import { useQueryClient } from '@tanstack/react-query';
import { OnboardingPreparing } from './OnboardingPreparing';
import {
  OnboardingTaskComposer,
  createDraftTask,
  serializeDraftTasks,
  type OnboardingDraftTask,
} from './OnboardingTaskComposer';
import styles from './CriarConta.module.css';

// ============================================================================
// TYPES
// ============================================================================

type StepId = 'whatsapp' | 'interview';
type InterviewTurn = 'name' | 'tracking' | 'pain' | 'open' | 'first_tasks';
type SelectionField = 'trackingMethods' | 'painPoints';
const SHOW_FIRST_TASK_IDEAS = true;
type PreparingStatus = 'idle' | 'pending' | 'ready' | 'error';

interface OnboardingFormData {
  name: string;
  email: string;
  trackingMethods: string[];
  trackingMethodsOther: string;
  painPoints: string[];
  painPointsOther: string;
  idealOutcomeText: string;
  firstTasksText: string;
}

type ValidationErrorField =
  | 'name'
  | 'trackingMethods'
  | 'trackingMethodsOther'
  | 'painPoints'
  | 'painPointsOther'
  | 'firstTasksText'
  | 'form';

interface StepValidationError {
  field: ValidationErrorField;
  message: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const INITIAL_DATA: OnboardingFormData = {
  name: '',
  email: '',
  trackingMethods: [],
  trackingMethodsOther: '',
  painPoints: [],
  painPointsOther: '',
  idealOutcomeText: '',
  firstTasksText: '',
};

const INTERVIEW_PROMPTS: Record<InterviewTurn, string> = {
  name: 'Como você prefere ser chamado?',
  tracking: 'Como você cria e lembra das suas tarefas?',
  pain: 'Você lida com algumas das opções abaixo?',
  open: 'Como seria a Jarvi ideal para você no dia a dia?',
  first_tasks: 'Vamos criar suas primeiras tarefas',
};

const INTERVIEW_TURNS: InterviewTurn[] = ['name', 'tracking', 'pain', 'open', 'first_tasks'];
const FLOW_STEPS = ['whatsapp', ...INTERVIEW_TURNS] as const;

function startsAtInterview(user: {
  authProvider?: 'email' | 'google' | 'whatsapp';
  whatsappVerified?: boolean;
} | null): boolean {
  if (!user) return false;
  if (user.whatsappVerified) return true;
  return user.authProvider === 'email' || user.authProvider === 'google';
}

// ============================================================================
// HELPERS
// ============================================================================

interface TrafficAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referringDomain: string | null;
}

function getTrafficAttribution(): TrafficAttribution {
  const read = (key: string): string | null => {
    try {
      const value = posthog.get_property(key);
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  };

  const cookie = attributionForLead();

  return {
    utmSource: read('$initial_utm_source') ?? cookie.utmSource,
    utmMedium: read('$initial_utm_medium') ?? cookie.utmMedium,
    utmCampaign: read('$initial_utm_campaign') ?? cookie.utmCampaign,
    referringDomain: read('$initial_referring_domain'),
  };
}

function buildMemorySeed(data: OnboardingFormData): string {
  const lines: string[] = [];
  if (data.name.trim() && data.name.trim() !== 'Você') {
    lines.push(`Você se chama ${data.name.trim()}.`);
  }
  const tracking = getLabelsFromSelection(
    TRACKING_METHOD_OPTIONS,
    data.trackingMethods,
    data.trackingMethodsOther,
  );
  if (tracking.length) lines.push(`Hoje você registra tarefas usando: ${formatList(tracking)}.`);
  const pain = getLabelsFromSelection(PAIN_POINT_OPTIONS, data.painPoints, data.painPointsOther);
  if (pain.length) lines.push(`Os principais desafios atuais são: ${formatList(pain)}.`);
  if (data.idealOutcomeText.trim()) {
    lines.push(`A Jarvi ideal no dia a dia: ${data.idealOutcomeText.trim()}`);
  }
  return lines.length > 0
    ? lines.join('\n')
    : 'Conte um pouco sobre sua rotina para a Jarvi te ajudar melhor.';
}

function captureStep(step: string) {
  captureProductEvent('onboarding_step_completed', { step });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SelectionChipsProps {
  options: OnboardingOption[];
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
            const isDisabled =
              !isSelected && typeof maxSelections === 'number' && selectedValues.length >= maxSelections;
            return (
              <button
                key={opt.value}
                type="button"
                ref={opt.value === 'other' ? otherRef : undefined}
                className={[
                  isSelected ? styles.chipActive : styles.chip,
                  opt.value === 'other' ? styles.otherOptionAnchor : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
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
  options: OnboardingOption[];
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
                className={[styles.checklistItem, opt.value === 'other' ? styles.otherOptionAnchor : '']
                  .filter(Boolean)
                  .join(' ')}
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
    <div
      className={styles.stepper}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={safe + 1}
      aria-label="Progresso das etapas"
    >
      {Array.from({ length: totalSteps }).map((_, i) => (
        <span key={i} className={i === safe ? styles.stepActive : styles.step} aria-hidden="true" />
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PREPARING_PREVIEW_BACKEND_MS = {
  fast: 600,
  default: 3200,
  slow: 8000,
} as const;

function getPreparingPreviewPace(value: string | null): keyof typeof PREPARING_PREVIEW_BACKEND_MS {
  if (value === 'fast' || value === 'slow') return value;
  return 'default';
}

export function CriarConta() {
  useForceTheme('light');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewKind = import.meta.env.DEV ? searchParams.get('preview') : null;
  const isPreparingPreview = previewKind === 'preparing' || previewKind === 'preparing-page';
  const previewPace = getPreparingPreviewPace(searchParams.get('pace'));
  const queryClient = useQueryClient();
  const { user, token, isLoading: authLoading, updateUser } = useAuth();

  const formRef = useRef<HTMLFormElement | null>(null);
  const resumeAppliedRef = useRef(false);
  const reconstructAttemptedRef = useRef(false);
  const completeOnboardingRef = useRef<() => Promise<void>>(async () => undefined);

  const [step, setStep] = useState<StepId>('whatsapp');
  const [includeWhatsappStep, setIncludeWhatsappStep] = useState(true);
  const [interviewTurn, setInterviewTurn] = useState<InterviewTurn>('name');
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_DATA);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ValidationErrorField | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [openTaskTopic, setOpenTaskTopic] = useState<string | null>(null);

  const closeFirstTaskIdeas = useCallback(() => {
    setIdeasOpen(false);
    setOpenTaskTopic(null);
  }, []);

  const openFirstTaskIdeas = useCallback(() => {
    setIdeasOpen(true);
    setOpenTaskTopic(FIRST_TASK_TOPICS[0].id);
  }, []);
  const [draftTasks, setDraftTasks] = useState<OnboardingDraftTask[]>([]);

  const [preparingStatus, setPreparingStatus] = useState<PreparingStatus>('idle');
  const [isExiting, setIsExiting] = useState(false);
  const [authReady, setAuthReady] = useState(!authLoading);
  const enterSeedRef = useRef<OnboardingChatSeed | null>(null);
  const enterUserPatchRef = useRef<{ onboardingCompletedAt: string; name?: string } | null>(null);
  const enteringAppRef = useRef(false);
  const isPreparingPreviewRef = useRef(isPreparingPreview);
  isPreparingPreviewRef.current = isPreparingPreview;
  const [previewCycle, setPreviewCycle] = useState(0);
  const isPreparing = preparingStatus === 'pending' || preparingStatus === 'ready';

  useEffect(() => {
    trackPixel('InitiateCheckout');
  }, []);

  useEffect(() => {
    if (!ideasOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFirstTaskIdeas();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ideasOpen, closeFirstTaskIdeas]);

  useEffect(() => {
    if (!authLoading) setAuthReady(true);
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    if (user?.onboardingCompletedAt && preparingStatus === 'idle' && !isExiting && !isPreparingPreview) {
      const hasSeed = Boolean(sessionStorage.getItem(ONBOARDING_CHAT_STORAGE_KEY));
      const consumed = sessionStorage.getItem(ONBOARDING_CHAT_CONSUMED_KEY) === '1';
      if (hasSeed || consumed) {
        navigate('/', { replace: true });
        return;
      }
      if (!token || reconstructAttemptedRef.current) return;
      reconstructAttemptedRef.current = true;
      void completeOnboardingRef.current();
      return;
    }
    if (!user || resumeAppliedRef.current) return;
    resumeAppliedRef.current = true;
    setFormData((prev) =>
      prev.name.trim() || !user.name || user.name === 'Você'
        ? prev
        : { ...prev, name: user.name, email: user.email || '' },
    );
    if (startsAtInterview(user)) {
      setIncludeWhatsappStep(false);
      setInterviewTurn('name');
      setStep('interview');
    } else {
      setIncludeWhatsappStep(true);
      setStep('whatsapp');
    }
  }, [authLoading, user, token, navigate, preparingStatus, isExiting, isPreparingPreview]);

  useEffect(() => {
    if (!isPreparingPreview) return;
    setPreparingStatus('pending');
    const timer = window.setTimeout(() => {
      setPreparingStatus('ready');
    }, PREPARING_PREVIEW_BACKEND_MS[previewPace]);
    return () => window.clearTimeout(timer);
  }, [isPreparingPreview, previewPace, previewCycle]);

  const generatedMemory = useMemo(
    () => buildMemorySeed(formData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      formData.name,
      formData.trackingMethods,
      formData.trackingMethodsOther,
      formData.painPoints,
      formData.painPointsOther,
      formData.idealOutcomeText,
    ],
  );

  const hasError = (field: ValidationErrorField) => errorField === field && !!errorMessage;
  const getInputClass = (field: ValidationErrorField) =>
    hasError(field) ? `${styles.input} ${styles.inputError}` : styles.input;
  const updateField = <T extends keyof OnboardingFormData>(field: T, value: OnboardingFormData[T]) => {
    if (errorField && errorField !== 'form') {
      setErrorMessage(null);
      setErrorField(null);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const syncDraftTasks = (next: OnboardingDraftTask[]) => {
    setDraftTasks(next);
    updateField('firstTasksText', serializeDraftTasks(next));
  };

  const appendFirstTaskExample = (example: string) => {
    const title = example.trim();
    if (!title) return;
    const alreadyInDrafts = draftTasks.some(
      (task) => task.title.trim().toLowerCase() === title.toLowerCase(),
    );
    const alreadyInText = formData.firstTasksText
      .split('\n')
      .some((line) => line.trim().toLowerCase() === title.toLowerCase());
    if (alreadyInDrafts && alreadyInText) return;

    if (!alreadyInDrafts) {
      syncDraftTasks([...draftTasks.filter((task) => task.title.trim()), createDraftTask(title)]);
      return;
    }
    updateField(
      'firstTasksText',
      formData.firstTasksText.trim() ? `${formData.firstTasksText.trim()}\n${title}` : title,
    );
  };

  const toggleSelection = (field: SelectionField, value: string, maxSelections?: number) => {
    if (errorField && errorField !== 'form') {
      setErrorMessage(null);
      setErrorField(null);
    }
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
      if (field === 'trackingMethods') nextState.trackingMethodsOther = '';
      if (field === 'painPoints') nextState.painPointsOther = '';
      return nextState;
    });
  };

  const getInterviewError = (): StepValidationError | null => {
    if (interviewTurn === 'name') {
      const preferred = formData.name.trim();
      if (!preferred || preferred === 'Você') {
        return { field: 'name', message: 'Diga como você prefere ser chamado.' };
      }
    }
    if (interviewTurn === 'tracking') {
      if (!formData.trackingMethods.length) {
        return { field: 'trackingMethods', message: 'Selecione ao menos uma opção.' };
      }
      if (formData.trackingMethods.includes('other') && !formData.trackingMethodsOther.trim()) {
        return { field: 'trackingMethodsOther', message: 'Descreva o que entra em "Outros".' };
      }
    }
    if (interviewTurn === 'pain') {
      if (!formData.painPoints.length) return { field: 'painPoints', message: 'Selecione ao menos um desafio.' };
      if (formData.painPoints.includes('other') && !formData.painPointsOther.trim()) {
        return { field: 'painPointsOther', message: 'Descreva o que entra em "Outros".' };
      }
    }
    if (interviewTurn === 'first_tasks') {
      const hasDraftTasks = draftTasks.some((task) => task.title.trim());
      if (!hasDraftTasks) {
        return { field: 'firstTasksText', message: 'Conte pelo menos uma coisa que você precisa fazer.' };
      }
    }
    return null;
  };

  const handleWhatsappAuthenticated = (nextUser: { onboardingCompletedAt?: string | null }) => {
    resumeAppliedRef.current = true;
    if (nextUser.onboardingCompletedAt) {
      navigate('/', { replace: true });
      return;
    }
    setInterviewTurn('name');
    setStep('interview');
  };

  const enterApp = useCallback(() => {
    if (enteringAppRef.current) return;
    enteringAppRef.current = true;

    if (isPreparingPreviewRef.current) {
      const restart = () => {
        enteringAppRef.current = false;
        setIsExiting(false);
        setPreparingStatus('pending');
        setPreviewCycle((cycle) => cycle + 1);
      };
      const reduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        restart();
        return;
      }
      setIsExiting(true);
      window.setTimeout(restart, 400);
      return;
    }

    const patch = enterUserPatchRef.current;
    if (patch) {
      updateUser({
        onboardingCompletedAt: patch.onboardingCompletedAt,
        name: patch.name,
        preferred_name: patch.name,
      });
    }

    const go = () => {
      const seed = enterSeedRef.current;
      if (seed) {
        navigate('/', { replace: true, state: { onboardingChat: seed } });
        return;
      }
      navigate('/', { replace: true });
    };

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      go();
      return;
    }

    setIsExiting(true);
    window.setTimeout(go, 400);
  }, [navigate, updateUser]);

  const handleCompleteOnboarding = async () => {
    if (!token) {
      setErrorMessage('Sessão expirada. Recarregue a página.');
      setErrorField('form');
      return;
    }
    setErrorMessage(null);
    setErrorField(null);
    setPreparingStatus('pending');
    try {
      const response = await fetch(`${API_URL}/api/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          trackingMethods: formData.trackingMethods,
          painPoints: formData.painPoints,
          trackingMethodsOther: formData.trackingMethodsOther.trim(),
          painPointsOther: formData.painPointsOther.trim(),
          idealOutcomeText: formData.idealOutcomeText.trim(),
          firstTasksText: formData.firstTasksText.trim(),
          firstTasks: draftTasks
            .filter((task) => task.title.trim())
            .map((task) => ({
              title: task.title.trim(),
              dueDate: task.dueDate,
              time: task.time,
            })),
          memorySeedText: generatedMemory,
          ...getTrafficAttribution(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        alreadyCompleted?: boolean;
        onboardingCompletedAt?: string;
        taskCount?: number;
        d1ReminderScheduled?: boolean;
        followUpMessage?: string;
        followUp?: {
          ack: string;
          question: string;
          choices: string[];
          taskTitle?: string;
          taskId?: string;
          field?: 'due_date' | 'time' | 'reminders';
          settled?: boolean;
        };
        createdTasks?: OnboardingCreatedTask[];
        firstName?: string;
      };
      if (!response.ok) {
        if (user?.onboardingCompletedAt) {
          navigate('/', { replace: true });
          return;
        }
        setErrorMessage(data.error || 'Não foi possível concluir agora.');
        setErrorField('form');
        setPreparingStatus('error');
        return;
      }
      if (!data.alreadyCompleted) {
        captureStep('first_tasks');
        captureProductEvent('onboarding_completed', {
          task_count: data.taskCount ?? 0,
          d1_reminder_scheduled: Boolean(data.d1ReminderScheduled),
        });
      }
      const savedName = formData.name.trim() || user?.name;
      enterUserPatchRef.current = {
        onboardingCompletedAt: data.onboardingCompletedAt || new Date().toISOString(),
        name: savedName,
      };
      const firstTasksText = formData.firstTasksText.trim();
      const followUp = data.followUp;
      const followUpMessage = data.followUpMessage || followUp?.question || '';
      if (followUpMessage || followUp) {
        const firstName =
          formData.name.trim().split(/\s+/)[0] ||
          data.firstName?.trim() ||
          user?.name?.trim().split(/\s+/)[0] ||
          undefined;
        const seed = {
          userText: firstTasksText,
          followUpMessage,
          followUp,
          createdTasks: data.createdTasks ?? [],
          firstName,
        };
        enterSeedRef.current = seed;
        storeOnboardingChatSeed(seed);
      } else {
        enterSeedRef.current = null;
      }
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setPreparingStatus('ready');
    } catch {
      if (user?.onboardingCompletedAt) {
        navigate('/', { replace: true });
        return;
      }
      setErrorMessage('Não foi possível concluir agora.');
      setErrorField('form');
      setPreparingStatus('error');
    }
  };
  completeOnboardingRef.current = handleCompleteOnboarding;

  const handleContinue = async () => {
    if (step !== 'interview' || isPreparing) return;

    const validationError = getInterviewError();
    if (validationError) {
      setErrorMessage(validationError.message);
      setErrorField(validationError.field);
      return;
    }
    setErrorMessage(null);
    setErrorField(null);

    if (interviewTurn === 'name') {
      captureStep('name');
      const preferredName = formData.name.trim();
      updateUser({ name: preferredName, preferred_name: preferredName });
      setInterviewTurn('tracking');
      return;
    }
    if (interviewTurn === 'tracking') {
      captureStep('tracking');
      setInterviewTurn('pain');
      return;
    }
    if (interviewTurn === 'pain') {
      captureStep('pain');
      setInterviewTurn('open');
      return;
    }
    if (interviewTurn === 'open') {
      captureStep('open');
      setInterviewTurn('first_tasks');
      return;
    }

    await handleCompleteOnboarding();
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
    if (target.closest('[data-skip-form-enter]')) return;
    e.preventDefault();
    formRef.current?.requestSubmit();
  };

  const flowSteps = includeWhatsappStep ? FLOW_STEPS : INTERVIEW_TURNS;
  const currentStepIndex = includeWhatsappStep
    ? step === 'whatsapp'
      ? 0
      : 1 + Math.max(0, INTERVIEW_TURNS.indexOf(interviewTurn))
    : Math.max(0, INTERVIEW_TURNS.indexOf(interviewTurn));

  const renderWhatsappStep = () => (
    <WhatsAppPhoneAuth source="onboarding" onSuccess={handleWhatsappAuthenticated}>
      <div className={styles.footer}>
        <span>Já tem uma conta?</span>
        <button type="button" className={styles.footerLink} onClick={() => navigate('/login')}>
          Entrar
        </button>
      </div>
    </WhatsAppPhoneAuth>
  );

  const renderInterviewArtifacts = () => {
    if (interviewTurn === 'name') {
      return (
        <div className={styles.fieldBlock}>
          {hasError('name') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
          <input
            className={getInputClass('name')}
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Digite aqui..."
            autoComplete="nickname"
            autoFocus
          />
        </div>
      );
    }

    if (interviewTurn === 'tracking') {
      return (
        <>
          {hasError('trackingMethods') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
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

    if (interviewTurn === 'pain') {
      return (
        <>
          {hasError('painPoints') && errorMessage && <p className={styles.questionError}>{errorMessage}</p>}
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

    if (interviewTurn === 'open') {
      return (
        <div className={styles.fieldBlock}>
          <textarea
            className={styles.textarea}
            value={formData.idealOutcomeText}
            onChange={(e) => updateField('idealOutcomeText', e.target.value)}
            placeholder="Conte em uma ou duas frases. Sua resposta ajuda muito a melhorar o produto."
          />
        </div>
      );
    }

    return (
      <div className={`${styles.fieldBlock} ${styles.fieldBlockFill} ${styles.firstTasksFields}`}>
        {hasError('firstTasksText') && errorMessage && (
          <p className={styles.questionError}>{errorMessage}</p>
        )}
        <div className={styles.composerShell}>
          <OnboardingTaskComposer tasks={draftTasks} onChange={syncDraftTasks} mode="idea" />
        </div>
        {SHOW_FIRST_TASK_IDEAS && (
        <div className={styles.suggestionBlock}>
          <button
            type="button"
            className={styles.suggestionToggle}
            aria-expanded={ideasOpen}
            aria-controls="first-task-ideas-sheet"
            onClick={() => {
              if (ideasOpen) {
                closeFirstTaskIdeas();
                return;
              }
              openFirstTaskIdeas();
            }}
          >
            <span>Precisa de ideias?</span>
            <CaretDown
              size={12}
              weight="bold"
              className={styles.suggestionChevron}
              aria-hidden
            />
          </button>
        </div>
        )}
      </div>
    );
  };

  const renderInterviewStep = () => (
    <>
      <div
        className={
          interviewTurn === 'first_tasks'
            ? `${styles.questionBlock} ${styles.questionBlockInset}`
            : styles.questionBlock
        }
      >
        <h1>
          {interviewTurn === 'first_tasks' ? (
            <>
              Vamos criar
              <br />
              suas primeiras tarefas
            </>
          ) : (
            INTERVIEW_PROMPTS[interviewTurn]
          )}
        </h1>
        {interviewTurn === 'first_tasks' && (
          <p>
            Adicione algumas coisas que você precisa fazer ou lembrar.
          </p>
        )}
      </div>
      {renderInterviewArtifacts()}
      {hasError('form') && errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
    </>
  );

  const showFormChrome = step === 'interview';

  if (!authReady && !isPreparingPreview) {
    return (
      <div className={styles.container}>
        <div className={styles.panel}>
          <Logo className={styles.logo} />
          <p className={styles.stepSubtitle}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (isPreparing) {
    return (
      <div className={isExiting ? `${styles.preparingPage} ${styles.containerExiting}` : styles.preparingPage}>
        {isPreparingPreview && (
          <p className={styles.preparingPreviewBadge}>Preview · recarrega em loop</p>
        )}
        <div className={styles.preparingPageInner}>
          <div className={styles.preparingPageLogoWrap} data-theme="dark">
            <Logo className={styles.preparingPageLogo} />
          </div>
          <OnboardingPreparing
            key={previewCycle}
            isBackendReady={preparingStatus === 'ready'}
            onReady={enterApp}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        <Logo className={styles.logo} />
        {SHOW_FIRST_TASK_IDEAS && showFormChrome && interviewTurn === 'first_tasks' && ideasOpen && (
          <div
            className={styles.ideasSheetOverlay}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeFirstTaskIdeas();
            }}
          >
            <div
              id="first-task-ideas-sheet"
              className={styles.ideasSheet}
              role="dialog"
              aria-modal="true"
              aria-label="Algumas ideias para você"
              data-skip-form-enter="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.ideasSheetHeader}>
                <p className={styles.ideasSheetTitle}>Algumas ideias para você</p>
                <button
                  type="button"
                  className={styles.ideasSheetClose}
                  onClick={closeFirstTaskIdeas}
                  aria-label="Fechar"
                >
                  <X size={20} weight="regular" />
                </button>
              </div>
              <div className={styles.ideasPanel}>
                <div className={styles.ideaTabs} role="tablist" aria-label="Categorias de ideias">
                  {FIRST_TASK_TOPICS.map((topic) => {
                    const isOpen = openTaskTopic === topic.id;
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        role="tab"
                        aria-selected={isOpen}
                        className={isOpen ? styles.ideaTabActive : styles.ideaTab}
                        onClick={() => setOpenTaskTopic(isOpen ? null : topic.id)}
                      >
                        {topic.title}
                      </button>
                    );
                  })}
                </div>
                {FIRST_TASK_TOPICS.map((topic) => {
                  if (openTaskTopic !== topic.id) return null;
                  return (
                    <div
                      key={topic.id}
                      id={`first-task-topic-${topic.id}`}
                      className={styles.ideaList}
                      role="tabpanel"
                    >
                      {topic.examples.map((example) => (
                        <button
                          key={example}
                          type="button"
                          className={styles.ideaRow}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            appendFirstTaskExample(example);
                            closeFirstTaskIdeas();
                          }}
                        >
                          <span>{example}</span>
                          <Plus size={14} weight="bold" aria-hidden />
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {showFormChrome ? (
          <form
            ref={formRef}
            className={styles.form}
            onKeyDown={handleFormKeyDown}
            onSubmit={handleFormSubmit}
          >
            <div className={styles.stepContent}>{renderInterviewStep()}</div>
            <Button
              type="submit"
              variant={
                interviewTurn === 'name' || interviewTurn === 'tracking' || interviewTurn === 'pain'
                  ? 'secondary'
                  : 'primary'
              }
              size="medium"
              fullWidth
              className={styles.formSubmit}
            >
              {interviewTurn === 'first_tasks' ? 'Criar minhas tarefas' : 'Continuar'}
            </Button>
            <StepperDots totalSteps={flowSteps.length} currentStep={currentStepIndex} />
          </form>
        ) : (
          <div className={styles.form}>
            <div className={styles.stepContent}>{renderWhatsappStep()}</div>
            <StepperDots totalSteps={flowSteps.length} currentStep={currentStepIndex} />
          </div>
        )}
      </div>
    </div>
  );
}

export default CriarConta;
