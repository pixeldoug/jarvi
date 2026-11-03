/**
 * Attachment previews are stored inside note/task JSON (`_attachments[].previewData`)
 * that other users can write (shared notes), then used as `<iframe src>` and as
 * a download link. Only accept what the editor itself produces: base64 `data:`
 * URLs of non-scriptable types, or local `blob:` URLs. Anything else
 * (`javascript:`, `data:text/html`, remote URLs) is rejected.
 * Keep in sync with packages/backend/src/utils/attachmentUrl.ts.
 */
const DATA_URL = /^data:([a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*)?(;[a-z0-9_.+-]+=[a-z0-9_.+-]+)*;base64,/i;
// data: documents get an opaque origin, so only page-like types are refused (no
// in-app phishing pages); images, SVG included, stay previewable.
const SCRIPTABLE_TYPE = /html|javascript|ecmascript/i;

export function isSafeAttachmentUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (url.startsWith('blob:')) return true;
  const match = DATA_URL.exec(url);
  return match !== null && !SCRIPTABLE_TYPE.test(match[1] ?? '');
}
