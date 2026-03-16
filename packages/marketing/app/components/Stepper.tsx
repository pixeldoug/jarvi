import styles from './Stepper.module.css';

interface StepperProps {
  totalSteps: number;
  currentStep: number;
  className?: string;
  ariaLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function Stepper({
  totalSteps,
  currentStep,
  className = '',
  ariaLabel = 'Progresso das etapas',
}: StepperProps) {
  const safeTotalSteps = Math.max(0, Math.floor(totalSteps));

  if (safeTotalSteps === 0) {
    return null;
  }

  const safeCurrentStep = clamp(Math.floor(currentStep), 0, safeTotalSteps - 1);
  const classes = [styles.stepper, className].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={1}
      aria-valuemax={safeTotalSteps}
      aria-valuenow={safeCurrentStep + 1}
    >
      {Array.from({ length: safeTotalSteps }).map((_, index) => (
        <span
          key={`step-${index + 1}`}
          className={index === safeCurrentStep ? styles.stepActive : styles.step}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
