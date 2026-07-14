/** Max longest side for resized images (screenshots stay readable for vision). */
export const MAX_IMAGE_DIMENSION = 1600;
export const IMAGE_COMPRESSION_QUALITY = 0.9;

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error(`Cannot read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cannot decode image'));
    img.src = src;
  });
}

/**
 * Resize/re-encode an image file into a (smaller) data URL. Falls back to the
 * raw data URL on any failure, and never re-encodes animated GIFs (canvas would
 * flatten them to a single frame).
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);

  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return rawDataUrl;
  }

  try {
    const img = await loadImage(rawDataUrl);
    const largestSide = Math.max(img.width, img.height);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / largestSide);
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP (best ratio for screenshots); browsers without WebP export
    // return a PNG data URL, which we still accept (resize alone already helps).
    let encoded = canvas.toDataURL('image/webp', IMAGE_COMPRESSION_QUALITY);
    if (!encoded.startsWith('data:image/webp')) {
      encoded = canvas.toDataURL('image/png');
    }

    // Keep whichever is smaller — never grow the payload.
    return encoded.length < rawDataUrl.length ? encoded : rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}

/** Strips the `data:<mime>;base64,` prefix from a data URL. */
export function dataUrlToBase64(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

/** Derive the MIME type and approximate byte size from a base64 data URL. */
export function dataUrlInfo(dataUrl: string): { mimeType: string; size: number } {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  const mimeType = match?.[1] ?? 'application/octet-stream';
  const base64 = dataUrlToBase64(dataUrl);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const size = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return { mimeType, size };
}
