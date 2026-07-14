import { normalizeDescriptionVoice } from './normalizeDescriptionVoice';
import { resolveRelativeDatesInText } from './resolveRelativeDatesInText';

/** Deterministic cleanup applied to agent-written description markdown before save. */
export function prepareDescriptionForStorage(text: string, timezone: string): string {
  return normalizeDescriptionVoice(resolveRelativeDatesInText(text, timezone));
}
