import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { noteSections, noteTimeLabel } from '@/features/notes/note-text';
import { useCreateNote, useDeleteNote, useNotes, useSetNotePinned } from '@/features/notes/use-notes';
import { useLocale } from '@/i18n';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { MicrophoneIcon, NoteIcon, PlusIcon, PushPinIcon, SparkleIcon } from '@/ui/icons';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import type { NoteListItem } from '@/types/notes';

export default function NotesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation(['notes', 'common']);
  const locale = useLocale();
  const notes = useNotes();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const setPinned = useSetNotePinned();
  const toast = useToast();
  const today = useToday();
  const [refreshing, setRefreshing] = useState(false);

  // useToday() changes at midnight, which regroups the list.
  const sections = useMemo(() => noteSections(notes.data ?? [], today), [notes.data, today]);

  const create = () => {
    createNote.mutate(undefined, {
      onSuccess: (note) => router.push({ pathname: '/nota/[id]', params: { id: note.id } }),
      onError: (error) => toast({ message: errorMessage(error, t('toast.createFailed')) }),
    });
  };

  const confirmDelete = (note: NoteListItem) => {
    Alert.alert(t('deleteDialog.title'), t('deleteDialog.description'), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      {
        text: t('common:actions.delete'),
        style: 'destructive',
        onPress: () =>
          deleteNote.mutate(note.id, {
            onError: (error) => toast({ message: errorMessage(error, t('toast.deleteFailed')) }),
          }),
      },
    ]);
  };

  const showActions = (note: NoteListItem) => {
    Alert.alert(note.title || t('untitled'), undefined, [
      {
        text: note.pinned_at ? t('menu.unpin') : t('menu.pin'),
        onPress: () =>
          setPinned.mutate(
            { id: note.id, pinned: !note.pinned_at },
            { onError: () => toast({ message: note.pinned_at ? t('toast.unpinFailed') : t('toast.pinFailed') }) },
          ),
      },
      ...(note.is_owner
        ? [{ text: t('common:actions.delete'), style: 'destructive' as const, onPress: () => confirmDelete(note) }]
        : []),
      { text: t('common:actions.cancel'), style: 'cancel' },
    ]);
  };

  const refresh = async () => {
    setRefreshing(true);
    await notes.refetch();
    setRefreshing(false);
  };

  const header = (
    <View style={styles.titleRow}>
      <Text variant="heading-lg" style={styles.title}>
        {t('list.title')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('list.newNote')}
        accessibilityState={{ busy: createNote.isPending }}
        hitSlop={8}
        disabled={createNote.isPending}
        onPress={create}
        style={({ pressed }) => [styles.addButton, { backgroundColor: colors.surfaceAccent, opacity: pressed ? 0.8 : 1 }]}
      >
        {createNote.isPending ? (
          <ActivityIndicator color={colors.contentOnAccent} />
        ) : (
          <PlusIcon size={20} color={colors.contentOnAccent} weight="bold" />
        )}
      </Pressable>
    </View>
  );

  let body;
  if (notes.isPending) {
    body = <LoadingState />;
  } else if (notes.isError && !notes.data) {
    body = <ErrorState message={errorMessage(notes.error)} onRetry={() => void notes.refetch()} />;
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(note) => note.id}
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            time={noteTimeLabel(item, today, { locale })}
            onOpen={() => router.push({ pathname: '/nota/[id]', params: { id: item.id } })}
            onLongPress={() => showActions(item)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.surfacePrimary }]}>
            {section.key === 'pinned' ? <PushPinIcon size={14} color={colors.contentSecondary} weight="fill" /> : null}
            <Text variant="label-md">{t(`list.groups.${section.key}`)}</Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon={<NoteIcon size={32} color={colors.contentInfo} />}
            title={t('list.empty.title')}
            description={t('list.empty.description')}
            actionLabel={t('list.newNote')}
            onAction={create}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.contentInfo} />}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      {header}
      {body}
    </SafeAreaView>
  );
}

function NoteRow({
  note,
  time,
  onOpen,
  onLongPress,
}: {
  note: NoteListItem;
  time: string;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation('notes');
  const title = note.title.trim() || t('untitled');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, note.preview, time].filter(Boolean).join(', ')}
      accessibilityHint={t('list.rowHint')}
      onPress={onOpen}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}
    >
      <View style={styles.rowText}>
        <Text variant="label-md" numberOfLines={1} color={note.title.trim() ? 'contentPrimary' : 'contentSecondary'}>
          {title}
        </Text>
        {note.preview ? (
          <Text variant="body-sm" color="contentSecondary" numberOfLines={2}>
            {note.preview}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowMeta}>
        {time ? (
          <Text variant="label-sm" color="contentTertiary">
            {time}
          </Text>
        ) : null}
        <View style={styles.badges}>
          {note.has_transcript ? <MicrophoneIcon size={14} color={colors.contentTertiary} /> : null}
          {note.has_summary ? <SparkleIcon size={14} color={colors.contentTertiary} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  title: {
    flex: 1,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xxl * 2,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
