/**
 * NoteNotesTab — the user's own notes (rich text with slash commands).
 */

import { RichTextEditor } from '../../ui/RichTextEditor/RichTextEditor';

export interface NoteNotesTabProps {
  noteId: string;
  /** Latest doc JSON — must echo back exactly what onChange emitted */
  content: string;
  readOnly: boolean;
  autoFocus: boolean;
  onChange: (json: string) => void;
  onBlur: () => void;
}

export function NoteNotesTab({ noteId, content, readOnly, autoFocus, onChange, onBlur }: NoteNotesTabProps) {
  return (
    <RichTextEditor
      key={noteId}
      content={content}
      onChange={onChange}
      onBlur={onBlur}
      readOnly={readOnly}
      placeholder="Escreva suas notas… Digite / para ver os comandos"
      variant="document"
      ariaLabel="Notas"
      autoFocus={autoFocus && !readOnly}
    />
  );
}
