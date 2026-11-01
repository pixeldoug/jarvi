/**
 * FeedbackDialog — dialog for bug reports and ideas.
 */

import { useEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Button, Dialog, TextArea, toast } from '../../ui';
import {
  captureFeedbackDismissed,
  captureFeedbackSent,
  captureFeedbackShown,
  FEEDBACK_SURVEYS,
  type FeedbackKind,
} from '../../../lib/posthogFeedback';
import styles from './FeedbackDialog.module.css';

export interface FeedbackDialogProps {
  kind: FeedbackKind | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ kind, isOpen, onClose }: FeedbackDialogProps) {
  const posthog = usePostHog();
  const config = kind ? FEEDBACK_SURVEYS[kind] : null;
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [didSubmit, setDidSubmit] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPrimary('');
      setSecondary('');
      setIsSaving(false);
      setDidSubmit(false);
      return;
    }
    if (config) captureFeedbackShown(posthog, config);
  }, [isOpen, config?.surveyId]);

  if (!isOpen || !config) return null;

  const canSubmit = primary.trim().length > 0 && !isSaving;

  const handleClose = () => {
    if (!didSubmit && config) {
      captureFeedbackDismissed(posthog, config);
    }
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    captureFeedbackSent(posthog, config, [primary.trim(), secondary.trim()]);
    setDidSubmit(true);
    toast.success(config.successToast);
    setIsSaving(false);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      width="lg"
      className={styles.dialog}
      contentClassName={styles.dialogContent}
      forceTheme="dark"
      showCloseButton
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{config.title}</h3>
        <p className={styles.subtitle}>{config.subtitle}</p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formBody}>
          <div className={styles.field}>
            <TextArea
              id={`feedback-${config.kind}-primary`}
              label={config.questions[0].label}
              value={primary}
              onChange={(event) => setPrimary(event.target.value)}
              placeholder={config.questions[0].placeholder}
              disabled={isSaving}
              required
            />
          </div>
          <div className={styles.field}>
            <TextArea
              id={`feedback-${config.kind}-secondary`}
              label={config.questions[1].label}
              value={secondary}
              onChange={(event) => setSecondary(event.target.value)}
              placeholder={config.questions[1].placeholder}
              disabled={isSaving}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerActions}>
            <Button
              type="button"
              variant="ghost"
              size="medium"
              onClick={handleClose}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="medium"
              disabled={!canSubmit}
              loading={isSaving}
            >
              {config.submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
