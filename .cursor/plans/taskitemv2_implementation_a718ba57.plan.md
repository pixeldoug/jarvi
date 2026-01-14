---
name: TaskItemV2 Implementation
overview: Criar um TaskItemV2 do zero baseado no design do Figma, mantendo apenas a edição inline do título sem focused state e removendo toda a complexidade legada.
todos:
  - id: create-folder-structure
    content: Criar estrutura de pastas TaskItemV2/ com TaskItemV2.tsx, TaskItemV2.module.css e index.ts
    status: pending
  - id: implement-base-component
    content: Implementar componente base com drag and drop usando useSortable, estrutura de layout e props interface
    status: pending
    dependencies:
      - create-folder-structure
  - id: add-checkbox-title
    content: Adicionar TaskCheckbox e título da tarefa com edição inline (sem focused state)
    status: pending
    dependencies:
      - implement-base-component
  - id: add-date-chip
    content: Adicionar chip de data sempre presente - mostra "Definir" se não houver data, ou "09:00, 7 Jan" se houver data/hora
    status: pending
    dependencies:
      - add-checkbox-title
  - id: add-category-dropdown
    content: Adicionar chip de categoria com CategoryDropdown integrado - chip se move para esquerda no hover quando botões aparecem
    status: pending
    dependencies:
      - add-date-chip
  - id: add-action-buttons
    content: Adicionar botões de ação (editar/deletar) que aparecem no hover - fazem chip de categoria se mover
    status: pending
    dependencies:
      - add-category-dropdown
  - id: add-drag-handle
    content: Adicionar drag handle que aparece no hover, posicionado à esquerda do container - garantir que não seja escondido por overflow
    status: pending
    dependencies:
      - add-action-buttons
  - id: add-insertion-line
    content: Adicionar linha de inserção para indicar posição durante drag and drop
    status: pending
    dependencies:
      - add-drag-handle
  - id: style-with-css-modules
    content: Estilizar componente usando CSS Modules e design tokens do sistema, incluindo estados hover, dragging e completed - garantir overflow adequado para drag handle
    status: pending
    dependencies:
      - add-insertion-line
  - id: export-component
    content: Criar index.ts para exportar TaskItemV2 e atualizar index.ts principal de tasks para incluir o novo componente
    status: pending
    dependencies:
      - style-with-css-modules
---

# TaskItemV2 Implementation

## Objetivo

Criar um novo componente `TaskItemV2` do zero, baseado no design do Figma, simplificando drasticamente o código legado do `TaskItem` atual.

## Estrutura do Componente

### Localização

- Criar em: `packages/web/src/components/features/tasks/TaskItemV2/`
- Arquivos:
  - `TaskItemV2.tsx` - Componente principal
  - `TaskItemV2.module.css` - Estilos usando CSS Modules e design tokens
  - `index.ts` - Export do componente

### Estrutura Visual (baseada no Figma)

1. **Container principal** (48px altura, padding horizontal 16px)
   - Background transparente, hover: `surface-secondary`
   - Border radius: `radius-sm`
   - **IMPORTANTE**: Garantir que não tenha `overflow: hidden` que esconda o drag handle

2. **Lado esquerdo** (`taskContent`)
   - Checkbox (24x24px, já existe `TaskCheckbox`)
   - **Chip de data (SEMPRE presente)**
     - Se não houver data: mostra "Definir" com ícone Calendar
     - Se houver data: mostra formato "09:00, 7 Jan" (hora primeiro, depois data) ou "7 Jan" (sem hora)
   - Título da tarefa (edição inline, sem focused state)

3. **Lado direito** (`taskMeta`)
   - Chip de categoria (com dropdown)
     - **IMPORTANTE**: Não tem posição estática - se move para esquerda no hover quando botões aparecem
   - Botões de ação (editar/deletar) - aparecem no hover
     - Quando aparecem, fazem o chip de categoria se mover para esquerda

4. **Drag handle** (aparece no hover)
   - Posicionado à esquerda do container (-24px)
   - Ícone `DotsSixVertical`
   - **IMPORTANTE**: Resolver problema de overflow que pode esconder o drag handle
     - Verificar elementos pais (Tasks.module.css, sectionContent, etc.)
     - Usar `overflow: visible` ou ajustar posicionamento se necessário

### Funcionalidades

#### Manter

- ✅ Edição inline do título (sem focused state no input)
- ✅ Drag and drop (usando `@dnd-kit/sortable`)
- ✅ Checkbox toggle
- ✅ Chip de data **SEMPRE presente** (não opcional)
  - Mostra "Definir" se não houver data
  - Mostra "09:00, 7 Jan" se houver data e hora
  - Mostra "7 Jan" se houver apenas data
- ✅ Categoria com dropdown
- ✅ Botões de ação (editar/deletar) no hover
  - Quando aparecem, fazem chip de categoria se mover para esquerda
- ✅ Linha de inserção para drag and drop

#### Remover/Simplificar

- ❌ Ícones de importante (`Fire`) e recorrência (`Repeat`) - não estão no Figma
- ❌ Lógica complexa de estado interno
- ❌ Múltiplos refs e useEffects desnecessários
- ❌ Código legado de gerenciamento de estado

### Props Interface

```typescript
interface TaskItemV2Props {
  task: Task;
  section: string;
  onToggleCompletion: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask: (taskId: string, taskData: any, showLoading?: boolean) => Promise<void>;
  onOpenDatePicker?: (task: Task, triggerElement?: HTMLElement) => void;
  showInsertionLine?: boolean;
  isCategoryDropdownOpen?: boolean;
  onCategoryDropdownToggle?: () => void;
  onCategoryDropdownClose?: () => void;
}
```

### Implementação

#### 1. Componente Principal (`TaskItemV2.tsx`)

- Usar `useSortable` do `@dnd-kit/sortable` para drag and drop
- Estado local apenas para edição inline do título:
  - `editingTitle: boolean`
  - `titleValue: string`
- Handlers simplificados:
  - `handleTitleClick` - inicia edição
  - `handleTitleSave` - salva título (onBlur ou Enter)
  - `handleTitleCancel` - cancela edição (Escape)
- **Chip de data sempre renderizado:**
  - Se `task.due_date` não existe: label "Definir"
  - Se existe: usar `formatTaskDate(task.due_date, task.time)` que retorna "09:00, 7 Jan" ou "7 Jan"

#### 2. Estilos (`TaskItemV2.module.css`)

- Usar design tokens do sistema
- Estados:
  - `.taskItem` - container principal
    - **NÃO usar `overflow: hidden`** - pode esconder drag handle
  - `.taskItem:hover` - background hover
  - `.dragging` - opacidade reduzida durante drag
  - `.actions` - botões de ação (opacity 0, aparece no hover)
  - `.dragHandle` - handle de drag (opacity 0, aparece no hover)
    - Posicionado com `position: absolute`, `left: -24px`
    - Garantir que elementos pais não tenham `overflow: hidden`
- Layout flexbox:
  - Container: `display: flex`, `justify-content: space-between`
  - `taskContent`: `flex: 1`, `min-width: 0` (para truncar título)
  - `taskMeta`: `flex-shrink: 0`
    - **Layout flex para permitir movimento do chip de categoria:**
      - Chip de categoria e botões de ação no mesmo container flex
      - Botões com `opacity: 0` por padrão, `opacity: 1` no hover
      - Chip se move naturalmente quando botões aparecem

#### 3. Edição Inline do Título

- Input sem border/outline quando focado
- Salvar ao perder foco (onBlur) ou pressionar Enter
- Cancelar com Escape
- Sem visual de "focused state" (sem border/outline)

#### 4. Chip de Data

- **Sempre renderizado** (não condicional)
- Se não houver `due_date`: label "Definir"
- Se houver `due_date`: usar `formatTaskDate(task.due_date, task.time)`
  - Função já atualizada para retornar "09:00, 7 Jan" (hora primeiro)
- Ícone Calendar sempre presente
- Clique abre date picker via `onOpenDatePicker`

#### 5. Chip de Categoria e Botões de Ação

- Layout flex no `taskMeta`:
  - Chip de categoria
  - Botões de ação (editar/deletar)
- Botões com `opacity: 0` por padrão
- No hover do `taskItem`:
  - Botões aparecem (`opacity: 1`)
  - Chip de categoria se move naturalmente para esquerda (flexbox)
- Não usar posicionamento absoluto para chip - deixar flexbox gerenciar

#### 6. Drag Handle e Overflow

- Drag handle posicionado com `position: absolute`, `left: -24px`
- Verificar elementos pais que possam ter `overflow: hidden`:
  - `Tasks.module.css` - `.sectionContent` (verificar se tem overflow)
  - Se necessário, ajustar para `overflow: visible` ou usar portal
- Alternativa: usar `position: fixed` se necessário, mas preferir ajustar overflow dos pais

#### 7. Integração

- Reutilizar `TaskCheckbox` existente
- Reutilizar `Chip` e `CategoryDropdown` existentes
- Usar `formatTaskDate` de `lib/utils.ts` (já atualizado para formato "09:00, 7 Jan")

### Arquivos a Modificar/Criar

1. **Criar:**
   - `packages/web/src/components/features/tasks/TaskItemV2/TaskItemV2.tsx`
   - `packages/web/src/components/features/tasks/TaskItemV2/TaskItemV2.module.css`
   - `packages/web/src/components/features/tasks/TaskItemV2/index.ts`

2. **Atualizar:**
   - `packages/web/src/lib/utils.ts` - ✅ Já atualizado `formatTaskDate` para formato "09:00, 7 Jan"

3. **Verificar/Atualizar (se necessário):**
   - `packages/web/src/pages/Tasks.module.css` - verificar `.sectionContent` para overflow
   - `packages/web/src/components/features/tasks/index.ts` - adicionar export
   - `packages/web/src/pages/Tasks.tsx` - substituir `TaskItem` por `TaskItemV2` (opcional, pode testar em paralelo)

### Design Tokens a Usar

- Altura: `--size-target-standard` (48px)
- Padding: `--sizes-4` (16px)
- Gap: `--sizes-2` (8px)
- Border radius: `--radius-radius-sm` (12px)
- Background hover: `--semantic-surface-surface-secondary`
- Typography título: `--typography-body-lg-*`
- Typography chip: `--typography-label-md-*`
- Cores: `--semantic-content-content-*`
- Botões: `--component-button-secondary-*`

### Checklist de Implementação

- [ ] Criar estrutura de pastas `TaskItemV2/`
- [ ] Implementar componente base com drag and drop
- [ ] Adicionar checkbox e título
- [ ] Implementar edição inline do título (sem focused state)
- [ ] Adicionar chip de data **SEMPRE presente** (não opcional)
  - Mostra "Definir" se não houver data
  - Mostra "09:00, 7 Jan" se houver data e hora
- [ ] Adicionar chip de categoria com dropdown
- [ ] Adicionar botões de ação (editar/deletar) com hover
  - Chip de categoria se move para esquerda quando botões aparecem
- [ ] Adicionar drag handle com hover
  - Resolver problema de overflow se necessário
- [ ] Adicionar linha de inserção
- [ ] Estilizar com CSS Modules e design tokens
  - Garantir que drag handle não seja escondido por overflow

