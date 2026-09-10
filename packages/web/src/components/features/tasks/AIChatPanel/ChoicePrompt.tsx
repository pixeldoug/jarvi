import { Fragment, useRef, useState, type ReactNode } from 'react';
import { CaretDown, CaretUp, X } from '@phosphor-icons/react';
import { Chip } from '../../../ui';
import { TaskDatePicker } from '../TaskDatePicker';
import { ReminderCustomTimePicker } from '../ReminderPicker/ReminderCustomTimePicker';
import type { ChatChoiceField } from '../../../../hooks/useChatStream';
import {
  choiceChipsForPrompt,
  isPickDateChoice,
  isPickTimeChoice,
} from '../../../../lib/choiceUiInstrumentation';
import { TaskMention } from './TaskMention';
import styles from './AIChatPanel.module.css';

interface ChoicePromptProps {
  question?: string;
  choices: string[];
  /** Field the backend's question is about; picks the date or time picker chip. */
  field?: ChatChoiceField;
  taskTitle?: string;
  onTaskClick?: () => void;
  disabled?: boolean;
  onSelect: (text: string) => void;
  onDismiss: () => void;
  children: ReactNode;
}

function formatPickedDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ChoicePrompt({
  question,
  choices,
  field,
  taskTitle,
  onTaskClick,
  disabled = false,
  onSelect,
  onDismiss,
  children,
}: ChoicePromptProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const dateChipRef = useRef<HTMLDivElement>(null);
  const timeChipRef = useRef<HTMLDivElement>(null);
  const chips = choiceChipsForPrompt(choices, field);

  const closePickers = () => {
    setDatePickerOpen(false);
    setTimePickerOpen(false);
  };

  const handleChip = (choice: string) => {
    if (isPickDateChoice(choice)) {
      setDatePickerOpen(true);
      return;
    }
    if (isPickTimeChoice(choice)) {
      setTimePickerOpen(true);
      return;
    }
    onSelect(choice);
  };

  return (
    <div className={styles.choiceArtifact}>
      <div className={styles.choiceArtifactHeader}>
        {taskTitle ? (
          <TaskMention title={taskTitle} size="header" onClick={onTaskClick} />
        ) : (
          <span className={styles.choiceArtifactHeaderSpacer} />
        )}
        <div className={styles.choiceArtifactActions}>
          <button
            type="button"
            className={styles.choiceArtifactIconButton}
            aria-label={collapsed ? 'Mostrar opções' : 'Recolher opções'}
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed((value) => {
                if (!value) closePickers();
                return !value;
              });
            }}
          >
            {collapsed ? <CaretDown size={12} weight="bold" /> : <CaretUp size={12} weight="bold" />}
          </button>
          <button
            type="button"
            className={styles.choiceArtifactIconButton}
            aria-label="Dispensar opções"
            onClick={onDismiss}
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      </div>

      <div className={styles.choiceArtifactBody}>
        {!collapsed && (
          <div className={styles.choiceArtifactPrompt}>
            {question ? <p className={styles.choiceArtifactQuestion}>{question}</p> : null}
            <div
              className={styles.choiceArtifactChips}
              role="group"
              aria-label={question || 'Opções'}
            >
              {chips.map((choice) => {
                const isDate = isPickDateChoice(choice);
                const isTime = isPickTimeChoice(choice);
                const chip = (
                  <Chip
                    label={choice}
                    size="medium"
                    interactive
                    disabled={disabled}
                    onClick={() => handleChip(choice)}
                  />
                );
                if (isDate || isTime) {
                  return (
                    <div
                      key={choice}
                      ref={isDate ? dateChipRef : timeChipRef}
                      className={styles.choiceArtifactDateChip}
                    >
                      {chip}
                    </div>
                  );
                }
                return <Fragment key={choice}>{chip}</Fragment>;
              })}
            </div>
          </div>
        )}
        {children}
      </div>

      <TaskDatePicker
        isOpen={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        onDateSelect={(date) => {
          if (!date) return;
          setDatePickerOpen(false);
          onSelect(formatPickedDate(date));
        }}
        anchorRef={dateChipRef}
      />
      <ReminderCustomTimePicker
        isOpen={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        onTimeSelect={(time) => {
          setTimePickerOpen(false);
          onSelect(`às ${time}`);
        }}
        anchorRef={timeChipRef}
      />
    </div>
  );
}
