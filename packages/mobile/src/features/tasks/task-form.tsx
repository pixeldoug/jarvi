import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { categoriesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
import { addDays, formatDueLabel, nextMonday, parseDateKey, timeToDate, toDateKey, toTimeString } from '@/lib/dates';
import { formatRecurrence, REPEAT_OPTION_LABELS_PT, REPEAT_OPTIONS } from '@/lib/recurrence';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { DateTimeField } from '@/ui/date-time-field';
import { CalendarBlankIcon, CheckIcon, ClockIcon, FireSimpleIcon, HashIcon, RepeatIcon } from '@/ui/icons';
import { ListGroup, ListRow } from '@/ui/list-group';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import type { TaskPriority } from '@/types/models';
import { RemindersEditor } from './reminders-editor';
import { applyDraftPatch, withRecurrence, type TaskDraft } from './task-draft';
import { queryKeys, useCategoryNames } from './use-tasks';

type Field = 'date' | 'time' | 'repeat' | 'category' | 'priority';

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

interface TaskFormProps {
  draft: TaskDraft;
  onChange: (draft: TaskDraft) => void;
  autoFocusTitle?: boolean;
  /** Shown left of the title (the completion checkbox when editing). */
  leading?: ReactNode;
}

/**
 * Title, notes and every task property. Choices expand inline under their
 * row, so the editor never stacks a second sheet over itself.
 */
export function TaskForm({ draft, onChange, autoFocusTitle = false, leading }: TaskFormProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const categories = useCategoryNames();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<Field | null>(null);
  const [newCategory, setNewCategory] = useState('');

  const set = (patch: Partial<TaskDraft>) => onChange(applyDraftPatch(draft, patch));
  const toggle = (field: Field) => setOpen((current) => (current === field ? null : field));
  const iconColor = colors.contentSecondary;
  const today = new Date();
  const dateShortcuts = [
    { label: 'Hoje', key: toDateKey(today) },
    { label: 'Amanhã', key: toDateKey(addDays(today, 1)) },
    { label: 'Próxima semana', key: toDateKey(nextMonday(today)) },
  ];
  const recurrenceLabel = formatRecurrence(draft.recurrenceType, draft.recurrenceConfig);
  const hasWhatsApp = !!(user?.whatsappVerified || user?.whatsappPhone);

  const createCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      await categoriesApi.create(name);
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      set({ category: name });
      setNewCategory('');
      setOpen(null);
    } catch (error) {
      toast({ message: errorMessage(error, 'Não foi possível criar a categoria.') });
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        {leading}
        <TextInput
          value={draft.title}
          onChangeText={(title) => set({ title })}
          placeholder="O que precisa ser feito?"
          placeholderTextColor={colors.contentTertiary}
          autoFocus={autoFocusTitle}
          multiline
          submitBehavior="blurAndSubmit"
          accessibilityLabel="Título da tarefa"
          style={[typography['heading-sm'], styles.title, { color: colors.contentPrimary }]}
        />
      </View>

      {draft.descriptionEditable ? (
        <TextInput
          value={draft.description}
          onChangeText={(description) => set({ description })}
          placeholder="Adicionar notas"
          placeholderTextColor={colors.contentTertiary}
          multiline
          accessibilityLabel="Notas da tarefa"
          style={[typography['body-md'], styles.notes, { color: colors.contentPrimary }]}
        />
      ) : (
        <View style={[styles.readOnlyNotes, { backgroundColor: colors.surfaceSecondary }]}>
          <Text variant="body-md">{draft.description || 'Sem notas'}</Text>
          <Text variant="body-sm" color="contentTertiary">
            Estas notas têm formatação ou anexos. Edite pela web.
          </Text>
        </View>
      )}

      <ListGroup>
        <ListRow
          label="Data"
          icon={<CalendarBlankIcon size={18} color={iconColor} />}
          value={formatDueLabel(draft.dueDate) ?? 'Sem data'}
          onPress={() => toggle('date')}
        />
        {open === 'date' ? (
          <Expanded>
            <View style={styles.chips}>
              {dateShortcuts.map((shortcut) => (
                <Chip
                  key={shortcut.label}
                  label={shortcut.label}
                  selected={draft.dueDate === shortcut.key}
                  onPress={() => set({ dueDate: shortcut.key })}
                />
              ))}
              <Chip
                label="Sem data"
                selected={!draft.dueDate}
                onPress={() => set({ dueDate: null, time: null, recurrenceType: 'none', recurrenceConfig: null })}
              />
            </View>
            <View style={styles.pickerRow}>
              <Text variant="body-md" color="contentSecondary">
                Outra data
              </Text>
              <DateTimeField
                mode="date"
                value={parseDateKey(draft.dueDate) ?? today}
                onChange={(date) => set({ dueDate: toDateKey(date) })}
                accessibilityLabel="Escolher data"
              />
            </View>
          </Expanded>
        ) : null}

        {draft.dueDate ? (
          <>
            <ListRow
              label="Horário"
              icon={<ClockIcon size={18} color={iconColor} />}
              value={draft.time ?? 'Sem horário'}
              onPress={() => toggle('time')}
            />
            {open === 'time' ? (
              <Expanded>
                <View style={styles.pickerRow}>
                  <DateTimeField
                    mode="time"
                    value={timeToDate(draft.time)}
                    onChange={(date) => set({ time: toTimeString(date) })}
                    accessibilityLabel="Escolher horário"
                  />
                  <Chip label="Sem horário" selected={!draft.time} onPress={() => set({ time: null })} />
                </View>
              </Expanded>
            ) : null}
          </>
        ) : null}

        <ListRow
          label="Repetir"
          icon={<RepeatIcon size={18} color={iconColor} />}
          value={recurrenceLabel ?? 'Não repetir'}
          onPress={() => toggle('repeat')}
        />
        {open === 'repeat' ? (
          <Expanded>
            {[...REPEAT_OPTIONS, ...(REPEAT_OPTIONS.includes(draft.recurrenceType) ? [] : [draft.recurrenceType])].map((type) => {
              const selected = draft.recurrenceType === type;
              const label =
                type === draft.recurrenceType && !REPEAT_OPTIONS.includes(type)
                  ? (recurrenceLabel ?? REPEAT_OPTION_LABELS_PT[type])
                  : REPEAT_OPTION_LABELS_PT[type];
              return (
                <Pressable
                  key={type}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (!selected) onChange(withRecurrence(draft, type));
                    setOpen(null);
                  }}
                  style={styles.option}
                >
                  <Text variant="body-md" color={selected ? 'contentInfo' : 'contentPrimary'}>
                    {label}
                  </Text>
                  {selected ? <CheckIcon size={16} color={colors.contentInfo} weight="bold" /> : null}
                </Pressable>
              );
            })}
          </Expanded>
        ) : null}

        <ListRow
          label="Categoria"
          icon={<HashIcon size={18} color={iconColor} />}
          value={draft.category ?? 'Sem categoria'}
          onPress={() => toggle('category')}
        />
        {open === 'category' ? (
          <Expanded>
            <View style={styles.chips}>
              <Chip label="Sem categoria" selected={!draft.category} onPress={() => set({ category: null })} />
              {categories.map((name) => (
                <Chip key={name} label={name} selected={draft.category === name} onPress={() => set({ category: name })} />
              ))}
            </View>
            <TextInput
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="Nova categoria"
              placeholderTextColor={colors.contentTertiary}
              returnKeyType="done"
              onSubmitEditing={() => void createCategory()}
              accessibilityLabel="Nome da nova categoria"
              style={[typography['body-md'], styles.inlineInput, { color: colors.contentPrimary, borderColor: colors.borderPrimary }]}
            />
          </Expanded>
        ) : null}

        <ListRow
          label="Prioridade"
          icon={<FireSimpleIcon size={18} color={iconColor} />}
          value={draft.priority ? PRIORITY_LABELS[draft.priority] : 'Nenhuma'}
          onPress={() => toggle('priority')}
          last={open !== 'priority'}
        />
        {open === 'priority' ? (
          <Expanded last>
            <View style={styles.chips}>
              <Chip label="Nenhuma" selected={!draft.priority} onPress={() => set({ priority: null })} />
              {(['low', 'medium', 'high'] as const).map((priority) => (
                <Chip
                  key={priority}
                  label={PRIORITY_LABELS[priority]}
                  selected={draft.priority === priority}
                  onPress={() => set({ priority })}
                />
              ))}
            </View>
          </Expanded>
        ) : null}
      </ListGroup>

      <RemindersEditor
        reminders={draft.reminders}
        hasTime={!!draft.dueDate && !!draft.time}
        hasWhatsApp={hasWhatsApp}
        onChange={(reminders) => set({ reminders })}
      />
    </View>
  );
}

function Expanded({ children, last = false }: { children: ReactNode; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.expanded,
        { backgroundColor: colors.surfaceGrouped },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    paddingTop: 0,
  },
  notes: {
    minHeight: 44,
    textAlignVertical: 'top',
  },
  readOnlyNotes: {
    padding: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  expanded: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  inlineInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
