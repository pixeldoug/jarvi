/**
 * Web chat attachment processing.
 *
 * Turns user-uploaded files (images, PDFs, audio, plain text/docs) into a
 * textual representation that the text-only agent can reason about. Reuses the
 * same primitives already battle-tested on the WhatsApp channel
 * (`analyzeImageForChat`, `transcribeAudio`, `extractTextFromPdfBuffer`).
 */

import { analyzeImageForChat, transcribeAudio } from './openaiService';
import { extractTextFromPdfBuffer } from './documentService';

export interface IncomingChatAttachment {
  /** Original file name (used for labelling and the user-facing context). */
  name?: string;
  /** MIME type reported by the browser. */
  mimeType?: string;
  /** Base64-encoded file contents (no `data:` prefix). */
  data?: string;
}

/** Hard caps to protect the backend from oversized payloads. */
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB per file
const MAX_TEXT_DOC_CHARS = 6000;

const isPdfMimeType = (mimeType: string): boolean =>
  mimeType === 'application/pdf' || mimeType.endsWith('/pdf');

const isTextLikeMimeType = (mimeType: string): boolean =>
  mimeType.startsWith('text/') ||
  mimeType === 'application/json' ||
  mimeType === 'application/xml' ||
  mimeType === 'application/x-yaml' ||
  mimeType === 'application/yaml';

const truncate = (value: string, maxChars: number): string =>
  value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;

/**
 * Converts a single attachment into a text fragment, or `null` when the file
 * type is not processable / fails to parse.
 */
const describeAttachment = async (
  attachment: IncomingChatAttachment,
): Promise<string | null> => {
  const mimeType = (attachment.mimeType || '').toLowerCase();
  const name = attachment.name?.trim() || 'arquivo';

  if (!attachment.data) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(attachment.data, 'base64');
  } catch {
    return null;
  }

  if (buffer.length === 0) return null;
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return `[Arquivo "${name}" ignorado: excede o tamanho máximo permitido]`;
  }

  try {
    if (mimeType.startsWith('image/')) {
      const description = await analyzeImageForChat(buffer, mimeType);
      return `[Imagem recebida — "${name}"]: ${description}`;
    }

    if (isPdfMimeType(mimeType)) {
      const pdfText = await extractTextFromPdfBuffer(buffer);
      if (!pdfText) {
        return `[Documento PDF "${name}" recebido, mas não foi possível extrair texto]`;
      }
      return `[Documento PDF — "${name}"]: ${pdfText}`;
    }

    if (mimeType.startsWith('audio/')) {
      const transcription = await transcribeAudio(buffer, mimeType);
      return `[Áudio transcrito — "${name}"]: ${transcription}`;
    }

    if (isTextLikeMimeType(mimeType)) {
      const text = truncate(buffer.toString('utf8').trim(), MAX_TEXT_DOC_CHARS);
      if (!text) return null;
      return `[Documento — "${name}"]: ${text}`;
    }

    return `[Arquivo "${name}" (${mimeType || 'tipo desconhecido'}) recebido — conteúdo não processável automaticamente]`;
  } catch (error) {
    console.error('Failed to process chat attachment:', {
      name,
      mimeType,
      error: error instanceof Error ? error.message : String(error),
    });
    return `[Arquivo "${name}" recebido, mas houve um erro ao processá-lo]`;
  }
};

/**
 * Processes all attachments and returns a single text block (or empty string)
 * to be appended to the user's message before it reaches the agent.
 */
export const buildAttachmentContext = async (
  attachments: IncomingChatAttachment[],
): Promise<string> => {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';

  const limited = attachments.slice(0, MAX_ATTACHMENTS);
  const parts = await Promise.all(limited.map((a) => describeAttachment(a)));
  const textParts = parts.filter((p): p is string => Boolean(p));

  if (textParts.length === 0) return '';

  return ['[Arquivos enviados pelo usuário]', ...textParts].join('\n\n');
};
