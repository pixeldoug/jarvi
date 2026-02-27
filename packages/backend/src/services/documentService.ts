import { PDFParse } from 'pdf-parse';

const DEFAULT_PDF_TEXT_MAX_CHARS = Number(process.env.WHATSAPP_PDF_TEXT_MAX_CHARS || 6000);

const sanitizeText = (value: string): string =>
  value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const truncateText = (value: string, maxChars: number): string =>
  value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;

export const extractTextFromPdfBuffer = async (
  pdfBuffer: Buffer,
  maxChars = DEFAULT_PDF_TEXT_MAX_CHARS
): Promise<string | null> => {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });

  try {
    const result = await parser.getText();
    const normalized = sanitizeText(result.text || '');
    if (!normalized) return null;
    return truncateText(normalized, maxChars);
  } catch (error) {
    console.warn('Failed to parse PDF document:', error);
    return null;
  } finally {
    try {
      await parser.destroy();
    } catch {
      // no-op
    }
  }
};
