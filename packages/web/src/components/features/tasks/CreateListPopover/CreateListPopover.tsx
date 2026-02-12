/**
 * CreateListPopover - Jarvi Web
 *
 * Figma: JarviDS-Web node 40000607:5926
 * Dialog for creating a custom list (saved filter) grouping categories.
 */

import { useEffect, useMemo, useState } from 'react';
import { Hash, Plus, Trash } from '@phosphor-icons/react';
import { Button, Dialog, TagInput, TextArea, TextInput, toast, type Tag } from '../../../ui';
import { useCategories } from '../../../../contexts/CategoryContext';
import { useLists } from '../../../../contexts/ListContext';
import styles from './CreateListPopover.module.css';

export type ListPopoverMode = 'create' | 'edit';

export interface EditableListData {
  id: string;
  name: string;
  description?: string | null;
  categoryNames: string[];
}

export interface CreateListPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  mode?: ListPopoverMode;
  listToEdit?: EditableListData | null;
  onDeleted?: (listId: string) => void;
}

export function CreateListPopover({
  isOpen,
  onClose,
  className = '',
  mode = 'create',
  listToEdit = null,
  onDeleted,
}: CreateListPopoverProps) {
  const { categories } = useCategories();
  const { createList, updateList, deleteList } = useLists();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Tag[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const isEditMode = mode === 'edit' && Boolean(listToEdit);

  const categoryOptions = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        label: c.name,
      })),
    [categories]
  );

  const resolveCategoryTags = (categoryNames: string[]): Tag[] => {
    return categoryNames.map((categoryName) => {
      const matchedCategory = categories.find((category) => category.name === categoryName);
      return {
        id: matchedCategory?.id ?? `name:${categoryName}`,
        label: categoryName,
      };
    });
  };

  const canSubmit = name.trim().length > 0 && selectedCategories.length > 0 && !isSaving;

  // Initialize or reset state when dialog mode changes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setSelectedCategories([]);
      setIsSaving(false);
      setIsDeleteConfirming(false);
      return;
    }

    if (isEditMode && listToEdit) {
      setName(listToEdit.name);
      setDescription(listToEdit.description || '');
      setSelectedCategories(resolveCategoryTags(listToEdit.categoryNames));
      setIsSaving(false);
      setIsDeleteConfirming(false);
      return;
    }

    setName('');
    setDescription('');
    setSelectedCategories([]);
    setIsSaving(false);
    setIsDeleteConfirming(false);
  }, [isEditMode, isOpen, listToEdit?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setIsSaving(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        categoryNames: selectedCategories.map((category) => category.label),
      };

      if (isEditMode && listToEdit) {
        await updateList(listToEdit.id, payload);
        toast.success('Lista atualizada');
      } else {
        await createList(payload);
        toast.success('Lista criada');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || (isEditMode ? 'Erro ao atualizar lista' : 'Erro ao criar lista'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteList = async () => {
    if (!listToEdit) return;

    try {
      setIsSaving(true);
      await deleteList(listToEdit.id);
      toast.success('Lista deletada');
      onDeleted?.(listToEdit.id);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao deletar lista');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const dialogClasses = [styles.dialog, className].filter(Boolean).join(' ');
  const footerClasses = [styles.footer, isEditMode && styles.footerWithDelete].filter(Boolean).join(' ');
  const title = isEditMode ? 'Editar Lista' : 'Criar Lista';
  const submitLabel = isEditMode ? 'Salvar' : 'Criar Lista';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      width="lg"
      className={dialogClasses}
      contentClassName={styles.dialogContent}
      forceTheme="dark"
      showCloseButton
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.subtitle}>
          Use listas para filtrar categorias e visualizar melhor o que importa.
        </p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formBody}>
          <div className={styles.field}>
            <TextInput
              id="create-list-name"
              label="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Trabalho, Estudos, Casa"
              disabled={isSaving}
            />
          </div>

          <div className={styles.field}>
            <TextArea
              id="create-list-description"
              label="Descrição"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qual o propósito desta lista?"
              disabled={isSaving}
            />
          </div>

          <div className={styles.field}>
            <TagInput
              label="Categorias"
              tags={selectedCategories}
              onTagsChange={setSelectedCategories}
              options={categoryOptions}
              placeholder="Selecionar"
              dropdownTheme="dark"
              optionIcon={Hash}
              dropdownButtonSection={(
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  fullWidth
                  icon={Plus}
                  iconPosition="left"
                >
                  Nova Categoria
                </Button>
              )}
              disabled={isSaving}
            />
          </div>
        </div>

        <div className={footerClasses}>
          {isEditMode && (
            <>
              {!isDeleteConfirming ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="medium"
                  icon={Trash}
                  iconPosition="left"
                  onClick={() => setIsDeleteConfirming(true)}
                  disabled={isSaving}
                >
                  Deletar
                </Button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <Button
                    type="button"
                    variant="destructive"
                    size="small"
                    onClick={handleDeleteList}
                    disabled={isSaving}
                  >
                    Sim, deletar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => setIsDeleteConfirming(false)}
                    disabled={isSaving}
                  >
                    Não
                  </Button>
                  <span className={styles.deleteConfirmText}>Você tem certeza disso?</span>
                </div>
              )}
            </>
          )}
          <div className={styles.footerActions}>
            <Button
              type="button"
              variant="ghost"
              size="medium"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="medium" disabled={!canSubmit} loading={isSaving}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

