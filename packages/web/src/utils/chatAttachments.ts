import type { ChatAttachment } from '../hooks/useChatStream';

/** Max number of files that can ride along with a single chat message. */
export const MAX_CHAT_ATTACHMENTS = 6;
/** Max size per file (kept in sync with the backend cap). */
export const MAX_CHAT_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

/** Attachment held in component state before being sent (carries UI metadata). */
export interface PendingAttachment extends ChatAttachment {
  id: string;
  size: number;
}

/** Reads a File into base64, stripping the `data:<mime>;base64,` prefix. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Converts dropped/pasted/picked files into `PendingAttachment`s, skipping any
 * that exceed the per-file size cap.
 */
export async function filesToPendingAttachments(
  files: File[],
): Promise<PendingAttachment[]> {
  const accepted = files.filter((f) => f.size <= MAX_CHAT_FILE_BYTES);
  if (!accepted.length) return [];

  return Promise.all(
    accepted.map(async (file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      data: await readFileAsBase64(file),
    })),
  );
}

/** Strips the UI-only fields, leaving the payload the backend expects. */
export function toChatAttachmentPayload(
  attachments: PendingAttachment[],
): ChatAttachment[] {
  return attachments.map(({ name, mimeType, data }) => ({ name, mimeType, data }));
}
