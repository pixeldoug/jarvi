/**
 * CreateListPopover - Jarvi Web
 *
 * Figma: JarviDS-Web node 40000607:5926
 * Dialog for creating a custom list (saved filter) grouping categories.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Ghost, Hash, Plus, Trash } from '@phosphor-icons/react';
import { Button, Dialog, ListItem, TagInput, TextArea, TextInput, toast, type Tag } from '../../../ui';
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
  categories?: Array<{
    id: string;
    name: string;
  }>;
}

export function CreateListPopover({
  isOpen,
  onClose,
  className = '',
  mode = 'create',
  listToEdit = null,
  onDeleted,
  categories: providedCategories = [],
}: CreateListPopoverProps) {
  const { categories: contextCategories, createCategory } = useCategories();
  const { createList, updateList, deleteList } = useLists();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Tag[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [categoryDropdownView, setCategoryDropdownView] = useState<'list' | 'create'>('list');
  const [newCategoryName, setNewCategoryName] = useState('');
  const newCategoryInputRef = useRef<HTMLInputElement>(null);
  const closeCategoryDropdownRef = useRef<(() => void) | null>(null);
  const isEditMode = mode === 'edit' && Boolean(listToEdit);

  const availableCategories = useMemo(
    () =>
      providedCategories.length > 0
        ? providedCategories
        : contextCategories.map((category) => ({ id: category.id, name: category.name })),
    [providedCategories, contextCategories]
  );

  const categoryOptions = useMemo(
    () =>
      availableCategories.map((category) => ({
        id: category.id,
        label: category.name,
      })),
    [availableCategories]
  );

  const resolveCategoryTags = (categoryNames: string[]): Tag[] => {
    return categoryNames.map((categoryName) => {
      const normalizedCategoryName = categoryName.trim().toLowerCase();
      const matchedCategory = availableCategories.find(
        (category) => category.name.trim().toLowerCase() === normalizedCategoryName
      );
      return {
        id: matchedCategory?.id ?? `name:${categoryName}`,
        label: categoryName,
      };
    });
  };

  const canSubmit = name.trim().length > 0 && selectedCategories.length > 0 && !isSaving;
  const isCategoryActionsDisabled = isSaving || isCreatingCategory;

  // Initialize or reset state when dialog mode changes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setSelectedCategories([]);
      setIsSaving(false);
      setIsCreatingCategory(false);
      setIsDeleteConfirming(false);
      setCategoryDropdownView('list');
      setNewCategoryName('');
      return;
    }

    if (isEditMode && listToEdit) {
      setName(listToEdit.name);
      setDescription(listToEdit.description || '');
      setSelectedCategories(resolveCategoryTags(listToEdit.categoryNames));
      setIsSaving(false);
      setIsCreatingCategory(false);
      setIsDeleteConfirming(false);
      setCategoryDropdownView('list');
      setNewCategoryName('');
      return;
    }

    setName('');
    setDescription('');
    setSelectedCategories([]);
    setIsSaving(false);
    setIsCreatingCategory(false);
    setIsDeleteConfirming(false);
    setCategoryDropdownView('list');
    setNewCategoryName('');
  }, [isEditMode, isOpen, listToEdit?.id]);

  useEffect(() => {
    if (categoryDropdownView !== 'create') return;

    const timeoutId = setTimeout(() => {
      newCategoryInputRef.current?.focus();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [categoryDropdownView]);

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

  const handleCategoryDropdownOpenChange = (isDropdownOpen: boolean) => {
    if (isDropdownOpen) return;
    setCategoryDropdownView('list');
    setNewCategoryName('');
  };

  const handleCreateCategory = async (closeDropdown: () => void) => {
    const categoryName = newCategoryName.trim();
    if (!categoryName || isCreatingCategory) return;

    try {
      setIsCreatingCategory(true);
      const createdCategory = await createCategory({ name: categoryName });

      setSelectedCategories((previous) => {
        const alreadySelected = previous.some((tag) => tag.id === createdCategory.id);
        if (alreadySelected) return previous;

        return [
          ...previous,
          {
            id: createdCategory.id,
            label: createdCategory.name,
          },
        ];
      });

      setNewCategoryName('');
      setCategoryDropdownView('list');
      closeDropdown();
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        toast.error('Categoria já existe', { description: 'Escolha um nome diferente' });
      } else {
        toast.error('Erro ao criar categoria');
      }
    } finally {
      setIsCreatingCategory(false);
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
              onDropdownOpenChange={handleCategoryDropdownOpenChange}
              renderDropdownContent={({ options, isOptionSelected, toggleOption, closeDropdown }) => {
                closeCategoryDropdownRef.current = closeDropdown;

                return categoryDropdownView === 'create' ? (
                  <div className={styles.categoryDropdownContent}>
                    <div className={styles.categoryDropdownHeaderSimple}>
                      <p className={styles.categoryDropdownTitle}>Nome da categoria</p>
                    </div>
                    <div className={styles.categoryDropdownInputContainer}>
                      <input
                        ref={newCategoryInputRef}
                        type="text"
                        className={styles.categoryDropdownInput}
                        value={newCategoryName}
                        onChange={(event) => setNewCategoryName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && newCategoryName.trim()) {
                            event.preventDefault();
                            void handleCreateCategory(closeDropdown);
                          }
                        }}
                        placeholder="Ex: Trabalho, Casa, Saúde..."
                        disabled={isCategoryActionsDisabled}
                      />
                    </div>
                  </div>
                ) : options.length === 0 ? (
                  <div className={styles.categoryDropdownContentEmpty}>
                    <div className={styles.categoryDropdownHeaderWithIcon}>
                      <Ghost size={20} weight="regular" />
                      <p className={styles.categoryDropdownTitle}>Nada por aqui ainda</p>
                    </div>
                    <p className={styles.categoryDropdownDescription}>
                      Use categorias para filtrar, priorizar e visualizar melhor o que importa.
                    </p>
                  </div>
                ) : (
                  <div className={styles.categoryDropdownContent}>
                    <div className={styles.categoryDropdownHeaderSimple}>
                      <p className={styles.categoryDropdownTitle}>Lista de categorias</p>
                    </div>
                    <div className={styles.categoryDropdownList} role="listbox" aria-label="Categorias">
                      {options.map((option) => (
                        <ListItem
                          key={option.id}
                          label={option.label}
                          icon={Hash}
                          onClick={() => toggleOption(option)}
                          buttonProps={{
                            role: 'option',
                            'aria-selected': isOptionSelected(option.id),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              }}
              dropdownButtonSection={categoryDropdownView === 'create' ? (
                <div className={styles.categoryDropdownFooterCreate}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    className={styles.categoryDropdownCancelButton}
                    onClick={() => {
                      setCategoryDropdownView('list');
                      setNewCategoryName('');
                    }}
                    disabled={isCategoryActionsDisabled}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="small"
                    className={styles.categoryDropdownCreateButton}
                    disabled={!newCategoryName.trim() || isCategoryActionsDisabled}
                    loading={isCreatingCategory}
                    onClick={() => {
                      const closeDropdown = closeCategoryDropdownRef.current ?? (() => {});
                      void handleCreateCategory(closeDropdown);
                    }}
                  >
                    Criar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  fullWidth
                  icon={Plus}
                  iconPosition="left"
                  onClick={() => setCategoryDropdownView('create')}
                  disabled={isCategoryActionsDisabled}
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

