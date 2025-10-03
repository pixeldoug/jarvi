import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../../../contexts/NoteContext';
import { Button } from '../../ui';
import { TrashSimple, Check, Eye, EyeSlash } from 'phosphor-react';
import '@uiw/react-md-editor/markdown-editor.css';

interface MarkdownEditorProps {
  note: Note;
  onUpdate: (noteId: string, noteData: { title?: string; content?: string }) => Promise<void>;
  onDelete: (noteId: string) => Promise<Note | null>;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  note,
  onUpdate,
  onDelete,
}) => {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const titleRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update local state when note prop changes
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setHasUnsavedChanges(false);
  }, [note.id, note.title, note.content]);

  // Auto-save functionality
  useEffect(() => {
    if (hasUnsavedChanges) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      // Set new timeout for auto-save (2 seconds after last change)
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleSave();
      }, 2000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [title, content, hasUnsavedChanges]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasUnsavedChanges(true);
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      await onUpdate(note.id, { title, content });
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Tem certeza que deseja deletar esta nota? Esta ação não pode ser desfeita.')) {
      try {
        await onDelete(note.id);
      } catch (error) {
        console.error('Failed to delete note:', error);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Simple markdown renderer for preview
  const renderMarkdown = (text: string) => {
    if (!text) return '';
    
    return text
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>')
      // Bold
      .replace(/\*\*(.*)\*\*/gim, '<strong class="font-bold">$1</strong>')
      // Italic
      .replace(/\*(.*)\*/gim, '<em class="italic">$1</em>')
      // Code
      .replace(/`(.*)`/gim, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" class="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
      // Lists
      .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
      // Line breaks
      .replace(/\n/gim, '<br>');
  };

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Título da nota..."
              className="w-full text-2xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            {hasUnsavedChanges && (
              <span className="text-xs text-orange-500 dark:text-orange-400">
                Não salvo
              </span>
            )}
            {isSaving && (
              <span className="text-xs text-blue-500 dark:text-blue-400">
                Salvando...
              </span>
            )}
            <Button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center space-x-1"
              variant="secondary"
              size="sm"
            >
              {showPreview ? (
                <>
                  <EyeSlash className="w-4 h-4" />
                  <span>Editor</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span>Preview</span>
                </>
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="flex items-center space-x-1"
              variant="secondary"
              size="sm"
            >
              <Check className="w-4 h-4" />
              <span>Salvar</span>
            </Button>
            <Button
              onClick={handleDelete}
              className="flex items-center space-x-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              variant="ghost"
              size="sm"
            >
              <TrashSimple className="w-4 h-4" />
              <span>Deletar</span>
            </Button>
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Criado em {formatDate(note.created_at)} • 
          Última atualização {formatDate(note.updated_at)}
        </div>
      </div>

      {/* Content Editor */}
      <div className="flex-1 flex">
        {showPreview ? (
          // Preview Mode
          <div className="flex-1 p-4">
            <div 
              className="prose prose-gray dark:prose-invert max-w-none h-full overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          </div>
        ) : (
          // Editor Mode
          <div className="flex-1 p-4">
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Comece a escrever sua nota em Markdown...

# Exemplo de Título
## Subtítulo
### Sub-subtítulo

**Texto em negrito**
*Texto em itálico*
`código inline`

- Lista item 1
- Lista item 2
- Lista item 3

[Link para exemplo](https://example.com)

```javascript
// Bloco de código
function exemplo() {
  return 'Hello World!';
}
```"
              className="w-full h-full resize-none bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 leading-relaxed font-mono text-sm"
              style={{ minHeight: 'calc(100vh - 200px)' }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Dica: Use Ctrl+S para salvar manualmente • 
          {showPreview ? 'Modo Preview' : 'Modo Editor'} • 
          Markdown suportado
        </div>
      </div>
    </div>
  );
};
