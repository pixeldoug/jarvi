import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { categoriesApi } from '@/api/endpoints';
import { categoryLabel } from '@/features/tasks/category-label';
import { useLocale } from '@/i18n';
import { queryKeys, useCategories } from '@/features/tasks/use-tasks';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { HashIcon, TrashIcon } from '@/ui/icons';
import { ListGroup } from '@/ui/list-group';
import { Screen } from '@/ui/screen';
import { EmptyState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useToast } from '@/ui/toast';
import type { Category } from '@/types/models';

interface CategoryRowProps {
  category: Category;
  last: boolean;
  onRename: (name: string) => void;
  onToggleVisible: (visible: boolean) => void;
  onDelete: () => void;
}

/** Tap the name to rename in place; the switch hides it from filters. */
function CategoryRow({ category, last, onRename, onToggleVisible, onDelete }: CategoryRowProps) {
  const { t } = useTranslation('settings');
  const locale = useLocale();
  const { colors } = useTheme();
  // Default names ("Trabalho") show translated; the stored name stays as is
  // unless the person actually types a different one.
  const label = categoryLabel(category.name, { locale });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const visible = category.visible !== false;

  const startEditing = () => {
    setValue(label);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== label && next !== category.name) onRename(next);
    else setValue(label);
  };

  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
    >
      <HashIcon size={16} color={colors.contentSecondary} />
      {editing ? (
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={commit}
          onBlur={commit}
          accessibilityLabel={t('categories.renameLabel', { name: label })}
          style={[typography['body-md'], styles.name, { color: colors.contentPrimary }]}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('categories.renameHint')}
          onPress={startEditing}
          style={styles.name}
        >
          <Text variant="body-md" color={visible ? 'contentPrimary' : 'contentTertiary'} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      )}
      <Switch
        value={visible}
        onValueChange={onToggleVisible}
        trackColor={{ true: colors.contentInfo }}
        accessibilityLabel={t('categories.showInFilters', { name: label })}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={t('categories.deleteLabel', { name: label })} hitSlop={8} onPress={onDelete}>
        <TrashIcon size={18} color={colors.contentTertiary} />
      </Pressable>
    </View>
  );
}

export default function CategoriesScreen() {
  const { t } = useTranslation(['settings', 'common']);
  const locale = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const [name, setName] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    // Renames and deletes also rewrite the tasks that used the category.
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
  };
  const onError = (error: unknown) => toast({ message: errorMessage(error) });

  const create = useMutation({
    mutationFn: (value: string) => categoriesApi.create(value),
    onSuccess: () => {
      setName('');
      refresh();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; visible?: boolean } }) =>
      categoriesApi.update(id, input),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: (id: string) => categoriesApi.remove(id), onSuccess: refresh, onError });

  const confirmDelete = (category: Category) =>
    Alert.alert(t('categories.deleteTitle', { name: categoryLabel(category.name, { locale }) }), t('categories.deleteMessage'), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      { text: t('common:actions.delete'), style: 'destructive', onPress: () => remove.mutate(category.id) },
    ]);

  if (categories.isPending) return <LoadingState />;
  const list = categories.data ?? [];
  const submit = () => {
    if (name.trim()) create.mutate(name.trim());
  };

  return (
    <Screen grouped scroll edges={['bottom']}>
      <View style={styles.add}>
        <View style={styles.flex}>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={t('categories.newPlaceholder')}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>
        <Button label={t('categories.create')} size="sm" onPress={submit} disabled={!name.trim()} loading={create.isPending} />
      </View>

      {list.length === 0 ? (
        <EmptyState title={t('categories.emptyTitle')} description={t('categories.emptyDescription')} />
      ) : (
        <ListGroup footer={t('categories.footer')}>
          {list.map((category, index) => (
            <CategoryRow
              key={category.id}
              category={category}
              last={index === list.length - 1}
              onRename={(value) => update.mutate({ id: category.id, input: { name: value } })}
              onToggleVisible={(visible) => update.mutate({ id: category.id, input: { visible } })}
              onDelete={() => confirmDelete(category)}
            />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  name: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
});
