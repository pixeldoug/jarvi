import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, errorMessage } from '@/api/client';
import { DocView } from '@/features/notes/doc-view';
import { NoteSummary } from '@/features/notes/note-summary';
import { noteDay } from '@/features/notes/note-text';
import { NoteTranscript } from '@/features/notes/note-transcript';
import { scheduleAutoSummary } from '@/features/notes/summary-generation';
import { transcriptionQueue } from '@/features/notes/transcription-queue';
import { useNoteAutosave } from '@/features/notes/use-note-autosave';
import { formatElapsed, useNoteRecorder } from '@/features/notes/use-note-recorder';
import { notesKeys, useDeleteNote, useNote, useSetNotePinned } from '@/features/notes/use-notes';
import { useFormat } from '@/i18n';
import { parseDescription, serializeDescription } from '@/lib/description';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { CaretLeftIcon, ChatCircleIcon, DotsThreeIcon, MicrophoneIcon, PushPinIcon, StopIcon } from '@/ui/icons';
import { SegmentedControl } from '@/ui/segmented-control';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import type { NoteDetail } from '@/types/notes';

type NoteTab = 'notes' | 'transcript' | 'summary';

/** Ids only; labels are `notes:tabs.<id>`, resolved at render time. */
const TABS: readonly NoteTab[] = ['notes', 'transcript', 'summary'];

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation('notes');
  const note = useNote(id);

  if (note.isPending) return <LoadingState />;
  if (!note.data) {
    // New backend: 404 + code NOT_FOUND (localized text). Old backend: { error: 'not_found' }.
    const notFound =
      note.error instanceof ApiError &&
      (note.error.status === 404 || note.error.code === 'NOT_FOUND' || note.error.message === 'not_found');
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
        <TopBar />
        {note.isError && !notFound ? (
          <ErrorState message={errorMessage(note.error)} onRetry={() => void note.refetch()} />
        ) : (
          <EmptyState title={t('detail.notFound.title')} description={t('detail.notFound.description')} />
        )}
      </SafeAreaView>
    );
  }
  // Drafts start from the server once per note and are never overwritten while editing.
  return <NoteEditor key={note.data.id} note={note.data} />;
}

function TopBar({ children }: { children?: ReactNode }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('actions.back')} hitSlop={8} onPress={() => router.back()}>
        <CaretLeftIcon size={24} color={colors.contentPrimary} />
      </Pressable>
      <View style={styles.topActions}>{children}</View>
    </View>
  );
}

function NoteEditor({ note }: { note: NoteDetail }) {
  const { colors } = useTheme();
  const { t } = useTranslation(['notes', 'common']);
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();
  const toast = useToast();
  const deleteNote = useDeleteNote();
  const setPinned = useSetNotePinned();
  const canEdit = note.access_level !== 'read';

  const [tab, setTab] = useState<NoteTab>(note.summary ? 'summary' : 'notes');
  const [initial] = useState(() => parseDescription(note.content));
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(initial.text);
  // The summary fills an empty title with the AI's suggestion; show it unless the user typed one.
  const [serverTitle, setServerTitle] = useState(note.title);
  if (note.title !== serverTitle) {
    setServerTitle(note.title);
    if (!title.trim()) setTitle(note.title);
  }
  const autosave = useNoteAutosave(note.id);

  const recorder = useNoteRecorder(note.id, () => {
    void scheduleAutoSummary(queryClient, note.id).then((result) => {
      if (result === 'ok') toast({ message: t('toast.summaryReady'), actionLabel: t('toast.view'), onAction: () => setTab('summary') });
      else if (result === 'failed') toast({ message: t('summary.failed') });
    });
  });
  const isRecording = recorder.state === 'recording' || recorder.state === 'stopping';

  const startRecording = async () => {
    const result = await recorder.start();
    if (result === 'started') setTab('transcript');
    else if (result === 'denied') {
      Alert.alert(t('record.denied.title'), t('record.denied.message'), [
        { text: t('record.denied.notNow'), style: 'cancel' },
        { text: t('record.denied.openSettings'), onPress: () => void Linking.openSettings() },
      ]);
    } else toast({ message: t('record.startFailed') });
  };

  // Leaving while recording asks first; what was said is still transcribed.
  const [allowLeave, setAllowLeave] = useState(false);
  usePreventRemove(isRecording && !allowLeave, ({ repeat }) => {
    Alert.alert(t('record.leave.title'), t('record.leave.message'), [
      { text: t('record.leave.keepRecording'), style: 'cancel' },
      {
        text: t('record.leave.stopAndLeave'),
        onPress: () => {
          setAllowLeave(true);
          void recorder.stop().then(repeat);
        },
      },
    ]);
  });

  // An empty note is deleted on the way out, like on the web.
  const latest = useRef({ title, text });
  useEffect(() => {
    latest.current = { title, text };
  }, [title, text]);
  const { mutate: removeNote } = deleteNote;
  useEffect(
    () => () => {
      const cached = queryClient.getQueryData<NoteDetail>(notesKeys.detail(note.id));
      const queue = transcriptionQueue.snapshot(note.id);
      const empty =
        cached?.access_level === 'owner' &&
        !latest.current.title.trim() &&
        !latest.current.text.trim() &&
        initial.editable &&
        cached.segments.length === 0 &&
        !cached.summary &&
        queue.pending + queue.failed === 0;
      if (empty) removeNote(note.id);
    },
    [queryClient, note.id, initial.editable, removeNote],
  );

  const changeTitle = (value: string) => {
    setTitle(value);
    autosave.setTitle(value);
  };

  const changeText = (value: string) => {
    setText(value);
    autosave.setContent(serializeDescription(value));
  };

  const togglePinned = () =>
    setPinned.mutate(
      { id: note.id, pinned: !note.pinned_at },
      { onError: () => toast({ message: note.pinned_at ? t('toast.unpinFailed') : t('toast.pinFailed') }) },
    );

  const confirmDelete = () => {
    Alert.alert(t('deleteDialog.title'), t('deleteDialog.description'), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      {
        text: t('common:actions.delete'),
        style: 'destructive',
        onPress: () =>
          deleteNote.mutate(note.id, {
            onSuccess: () => {
              setAllowLeave(true);
              router.back();
            },
            onError: (error) => toast({ message: errorMessage(error, t('toast.deleteFailed')) }),
          }),
      },
    ]);
  };

  const showMore = () =>
    Alert.alert(title.trim() || t('untitled'), undefined, [
      { text: note.pinned_at ? t('menu.unpin') : t('menu.pin'), onPress: togglePinned },
      ...(note.access_level === 'owner'
        ? [{ text: t('common:actions.delete'), style: 'destructive' as const, onPress: confirmDelete }]
        : []),
      { text: t('common:actions.cancel'), style: 'cancel' },
    ]);

  const openChat = async () => {
    // The chat reads the note from the server.
    await autosave.flush().catch(() => undefined);
    router.push({ pathname: '/nota/[id]/chat', params: { id: note.id } });
  };

  const day = useMemo(() => (note.date_removed ? null : noteDay(note)), [note]);
  const tabs = TABS.map((value) => ({ value, label: t(`tabs.${value}`) }));

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      <TopBar>
        {note.pinned_at ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('menu.unpin')} hitSlop={8} onPress={togglePinned}>
            <PushPinIcon size={22} color={colors.contentSecondary} weight="fill" />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('menu.askJarvi')} hitSlop={8} onPress={() => void openChat()}>
          <ChatCircleIcon size={24} color={colors.contentPrimary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('menu.more')} hitSlop={8} onPress={showMore}>
          <DotsThreeIcon size={24} color={colors.contentPrimary} weight="bold" />
        </Pressable>
      </TopBar>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={spacing.xl}
      >
        <TextInput
          value={title}
          onChangeText={changeTitle}
          onBlur={() => void autosave.flush().catch(() => undefined)}
          editable={canEdit}
          placeholder={t('untitled')}
          placeholderTextColor={colors.contentTertiary}
          accessibilityLabel={t('detail.titleLabel')}
          multiline
          scrollEnabled={false}
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          style={[typography['heading-lg'], styles.title, { color: colors.contentPrimary }]}
        />
        {day ? (
          <Text variant="body-sm" color="contentSecondary">
            {formatDate(day, 'dayMonthAuto')}
          </Text>
        ) : null}
        {autosave.saveFailed ? (
          <Text variant="body-sm" color="contentNegative">
            {t('detail.saveFailed')}
          </Text>
        ) : null}

        <SegmentedControl options={tabs} value={tab} onChange={setTab} />

        {tab === 'notes' ? (
          initial.editable && canEdit ? (
            <TextInput
              value={text}
              onChangeText={changeText}
              onBlur={() => void autosave.flush().catch(() => undefined)}
              placeholder={t('detail.notesPlaceholder')}
              placeholderTextColor={colors.contentTertiary}
              accessibilityLabel={t('detail.notesLabel')}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={[typography['body-md'], styles.notes, { color: colors.contentPrimary }]}
            />
          ) : (
            <View style={styles.readOnly}>
              {initial.text ? <DocView raw={note.content} /> : null}
              {canEdit ? (
                <Text variant="body-sm" color="contentTertiary">
                  {t('detail.webFormatting')}
                </Text>
              ) : null}
            </View>
          )
        ) : tab === 'transcript' ? (
          <NoteTranscript noteId={note.id} segments={note.segments} isRecording={isRecording} />
        ) : (
          <NoteSummary note={note} canEdit={canEdit} />
        )}
      </KeyboardAwareScrollView>

      {canEdit ? (
        <SafeAreaView edges={['bottom']} style={[styles.recordBar, { borderTopColor: colors.borderPrimary }]}>
          {isRecording ? (
            <>
              <View style={[styles.dot, { backgroundColor: colors.contentNegative }]} />
              <Text variant="label-md" style={styles.elapsed} accessibilityLabel={t('record.elapsedLabel', { elapsed: formatElapsed(recorder.elapsedMs) })}>
                {formatElapsed(recorder.elapsedMs)}
              </Text>
              <Button
                label={t('record.stop')}
                variant="secondary"
                size="sm"
                loading={recorder.state === 'stopping'}
                icon={<StopIcon size={14} color={colors.contentPrimary} weight="fill" />}
                onPress={() => void recorder.stop()}
              />
            </>
          ) : (
            <Button
              label={t('record.start')}
              size="sm"
              style={styles.recordButton}
              loading={recorder.state === 'starting'}
              icon={<MicrophoneIcon size={16} color={colors.contentOnAccent} weight="fill" />}
              onPress={() => void startRecording()}
            />
          )}
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.md,
  },
  title: {
    padding: 0,
  },
  notes: {
    minHeight: 240,
    padding: 0,
  },
  readOnly: {
    gap: spacing.lg,
  },
  recordBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recordButton: {
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.round,
  },
  elapsed: {
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
});
