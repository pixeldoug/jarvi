/**
 * NoteSummaryTab — AI summary: empty / generating / editable summary.
 *
 * The "Próximos passos" section is not edited as text: it is shown after the
 * editor as task rows (NextStepsList, the task lists' TaskItem). Steps stay in
 * the note until the user adds them to the task list ("Sincronizar com tarefas",
 * next to the section title). A step that may repeat one with a task waits
 * for the user's answer ("Já é tarefa?"), and a line above the summary counts
 * them.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowsClockwise, Sparkle } from '@phosphor-icons/react';
import { Button, SkeletonText } from '../../ui';
import { RichTextEditor } from '../../ui/RichTextEditor/RichTextEditor';
import { NoteEmptyState, type NoteEmptyStateIllustration } from './NoteEmptyState';
import { NextStepsList } from './NextStepsList';
import { parseSectionSteps, splitNextStepsSection, type SummaryStepPatch } from './summaryTasks';
import { formatRelativeTime } from './noteText';
import summaryIllustration from '../../../assets/illustrations/summary.webp';
import summaryIllustration2x from '../../../assets/illustrations/summary@2x.webp';
import styles from './NoteSummaryTab.module.css';

// Same painted texture as the transcript tab's microphone
const SUMMARY_ILLUSTRATION: NoteEmptyStateIllustration = {
  src: summaryIllustration,
  src2x: summaryIllustration2x,
  width: 80,
  height: 96,
};

/**
 * The summary's next steps: `none` (no task item with text), `available`
 * (some not converted yet) or `converted` (all of them are tasks).
 */
export type SummaryNextStepsState = 'none' | 'available' | 'converted';

export interface NoteSummaryTabProps {
  /** Summary doc JSON to show (local draft or server value) */
  summary: string | null;
  /** summary_updated_at — shown as "Gerado há X" */
  summaryVersion: string | null;
  /** Remounts the editor when it changes (new summary, converted items) */
  editorKey: string;
  isGenerating: boolean;
  canEdit: boolean;
  /** The note has notes text or a transcript to summarize */
  hasSource: boolean;
  /** What changed since this summary was generated: the notes, new transcript segments */
  newSince: { notes: boolean; transcript: boolean };
  nextSteps: SummaryNextStepsState;
  /**
   * Applied once when the editor mounts (linked items take their task's
   * completion); a changed result is reported through `onSummaryChange`.
   */
  prepareContent?: (json: string) => string;
  onGenerate: () => void;
  /** "Sincronizar com tarefas": pick the steps that go to the task list */
  onCreateTasks: () => void;
  /** A change made on a step that is not a task yet (its row in the list) */
  onUpdateStep: (stepId: string, patch: SummaryStepPatch) => void;
  onRemoveStep: (stepId: string) => void;
  onOpenTask: (taskId: string) => void;
  /** Steps that may repeat one with a task, waiting for the user's answer */
  reviewCount: number;
  /** Opens the review of a step (the first one when omitted) */
  onReviewStep: (stepId?: string) => void;
  /** The editor's text (the summary without "Próximos passos": the caller puts the section back) */
  onSummaryChange: (json: string) => void;
  onSummaryBlur: () => void;
}

/**
 * Whether (x, y) is on an item's marker ("Tarefa", "Já é tarefa?"): the
 * item's ::after box, last in its flex row (flush right, on the first line).
 */
function isOnTaskMarker(item: HTMLLIElement, x: number, y: number): boolean {
  const marker = window.getComputedStyle(item, '::after');
  const px = (value: string) => Number.parseFloat(value) || 0;
  const contentBox = marker.boxSizing !== 'border-box';
  const width = px(marker.width) + (contentBox ? px(marker.paddingLeft) + px(marker.paddingRight) : 0);
  const height = px(marker.height) + (contentBox ? px(marker.paddingTop) + px(marker.paddingBottom) : 0);
  if (width <= 0 || height <= 0) return false;
  const row = item.getBoundingClientRect();
  const top = row.top + px(marker.marginTop);
  return x >= row.right - width && x <= row.right && y >= top && y <= top + height;
}

/** Re-renders every minute so "Gerado há X" stays current. */
function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

export function NoteSummaryTab({
  summary,
  summaryVersion,
  editorKey,
  isGenerating,
  canEdit,
  hasSource,
  newSince,
  nextSteps,
  prepareContent,
  onGenerate,
  onCreateTasks,
  onUpdateStep,
  onRemoveStep,
  onOpenTask,
  reviewCount,
  onReviewStep,
  onSummaryChange,
  onSummaryBlur,
}: NoteSummaryTabProps) {
  const now = useMinuteTick();
  // The editor shows the summary without "Próximos passos"; the list shows that section.
  const parts = useMemo(() => splitNextStepsSection(summary), [summary]);
  const steps = useMemo(() => parseSectionSteps(parts?.section ?? []), [parts]);

  // First summary: the same skeleton as "Gerar novamente", under the meta line.
  if (!summary && isGenerating) {
    return (
      <div className={styles.summary}>
        <div className={styles.metaRow}>
          <p className={styles.meta}>Gerando resumo…</p>
        </div>
        <SummarySkeleton />
      </div>
    );
  }

  if (!summary) {
    return (
      <NoteEmptyState
        compact
        icon={Sparkle}
        illustration={SUMMARY_ILLUSTRATION}
        title="Nenhum resumo"
        description="O Jarvi gera um resumo a partir das suas notas e da transcrição."
        action={
          canEdit ? (
            <Button
              variant="primary"
              icon={Sparkle}
              iconPosition="left"
              disabled={!hasSource}
              onClick={onGenerate}
            >
              Gerar resumo
            </Button>
          ) : undefined
        }
        helper={canEdit && !hasSource ? 'Escreva algumas notas ou grave um áudio primeiro.' : undefined}
      />
    );
  }

  const staleMessage =
    newSince.notes && newSince.transcript
      ? 'Suas notas e a transcrição têm informações novas que ainda não estão no resumo.'
      : newSince.notes
        ? 'Suas notas têm informações novas que ainda não estão no resumo.'
        : newSince.transcript
          ? 'A transcrição tem trechos novos que ainda não estão no resumo.'
          : null;

  return (
    <div className={styles.summary}>
      <div className={styles.metaRow}>
        <p className={styles.meta}>
          {summaryVersion ? `Gerado ${formatRelativeTime(summaryVersion, now)}` : 'Resumo'}
        </p>
        {canEdit && (
          <div className={styles.metaActions}>
            <Button
              variant="secondary"
              size="small"
              icon={ArrowsClockwise}
              iconPosition="left"
              loading={isGenerating}
              disabled={!hasSource}
              onClick={onGenerate}
            >
              Gerar novamente
            </Button>
          </div>
        )}
      </div>

      {staleMessage && !isGenerating && (
        canEdit ? (
          <div className={styles.actionHint} role="status">
            <p className={styles.actionHintText}>{staleMessage}</p>
            <Button
              variant="secondary"
              size="small"
              icon={ArrowsClockwise}
              iconPosition="left"
              disabled={!hasSource}
              onClick={onGenerate}
            >
              Atualizar resumo
            </Button>
          </div>
        ) : (
          <p className={styles.staleHint}>{staleMessage}</p>
        )
      )}

      {canEdit && !isGenerating && reviewCount > 0 && (
        <div className={styles.actionHint}>
          <p className={styles.actionHintText}>
            {reviewCount === 1
              ? 'Um passo pode repetir uma tarefa que você já criou.'
              : `${reviewCount} passos podem repetir tarefas que você já criou.`}
          </p>
          <Button variant="secondary" size="small" onClick={() => onReviewStep()}>
            Revisar
          </Button>
        </div>
      )}

      {isGenerating ? (
        <SummarySkeleton />
      ) : (
        <>
          <SummaryEditor
            key={editorKey}
            summary={parts?.body ?? summary}
            prepareContent={prepareContent}
            onChange={onSummaryChange}
            onBlur={onSummaryBlur}
            readOnly={!canEdit}
            onOpenTask={onOpenTask}
          />
          <NextStepsList
            steps={steps}
            canEdit={canEdit}
            onReviewStep={onReviewStep}
            onUpdateStep={onUpdateStep}
            onRemoveStep={onRemoveStep}
            onAddToTasks={nextSteps === 'available' ? onCreateTasks : undefined}
          />
        </>
      )}
    </div>
  );
}

/** The summary's shape (sections of a heading and lines) while it is written or rewritten. */
function SummarySkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Gerando resumo…">
      {[
        ['92%', '100%', '64%'],
        ['84%', '72%', '58%'],
        ['76%', '48%'],
      ].map((widths, section) => (
        <div key={section} className={styles.skeletonSection}>
          <SkeletonText variant="heading" lines={1} widths={[section === 0 ? '22%' : '34%']} />
          <SkeletonText lines={widths.length} widths={widths} />
        </div>
      ))}
    </div>
  );
}

interface SummaryEditorProps {
  summary: string;
  prepareContent?: (json: string) => string;
  onChange: (json: string) => void;
  onBlur: () => void;
  readOnly: boolean;
  onOpenTask: (taskId: string) => void;
}

/**
 * One editor mount. Content prepared at mount is never pushed into a mounted
 * editor: it is the mount content, then reported once as a change (so it
 * becomes the draft and gets saved).
 */
function SummaryEditor({
  summary,
  prepareContent,
  onChange,
  onBlur,
  readOnly,
  onOpenTask,
}: SummaryEditorProps) {
  const [mount] = useState(() => {
    const content = prepareContent ? prepareContent(summary) : summary;
    return { content, changed: content !== summary };
  });
  const isMountRenderRef = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    isMountRenderRef.current = false;
    if (mount.changed) onChangeRef.current(mount.content);
  }, [mount]);

  // The "Tarefa" marker is the item's ::after box, after its text. It acts
  // only on a plain click on it: pressed and released on the
  // marker, no text selected (a drag that ends there is a text selection, and
  // the browser reports its click on the <li>).
  const pressRef = useRef<{ target: EventTarget | null; x: number; y: number } | null>(null);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    pressRef.current = { target: event.target, x: event.clientX, y: event.clientY };
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    pressRef.current = null;
    const target = event.target;
    if (!(target instanceof HTMLLIElement) || press?.target !== target) return;
    const taskId = target.dataset.taskId;
    if (!taskId || window.getSelection()?.isCollapsed === false) return;
    if (!isOnTaskMarker(target, press.x, press.y) || !isOnTaskMarker(target, event.clientX, event.clientY)) {
      return;
    }
    event.preventDefault();
    onOpenTask(taskId);
  };

  return (
    <div className={styles.editor} onMouseDown={handleMouseDown} onClick={handleClick}>
      <RichTextEditor
        content={isMountRenderRef.current ? mount.content : summary}
        onChange={onChange}
        onBlur={onBlur}
        readOnly={readOnly}
        variant="document"
        ariaLabel="Resumo"
      />
    </div>
  );
}
