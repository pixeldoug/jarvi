/**
 * Instagram / Facebook in-app browsers inject a native bridge that throws
 * `Error invoking postMessage` when the WebView is tearing down. Those
 * frames are not Jarvi code — drop them before they reach PostHog.
 */
const NOISE = [
  'error invoking postmessage',
  'java object is gone',
  'java exception was raised during method invocation',
  '_handlebrowserpreparingtoclose',
  'sendbeforeunloadmessage',
  'senddatatonative',
];

type CaptureLike = {
  event?: string;
  properties?: Record<string, unknown>;
};

function exceptionHaystack(event: CaptureLike): string {
  const props = event.properties ?? {};
  const parts: string[] = [];

  const push = (value: unknown) => {
    if (typeof value === 'string' && value) parts.push(value);
  };

  push(props.$exception_message);
  push(props.$exception_type);

  const list = props.$exception_list;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      push(rec.value);
      push(rec.type);
      const frames = (rec.stacktrace as { frames?: Array<{ function?: string; filename?: string }> } | undefined)
        ?.frames;
      if (!Array.isArray(frames)) continue;
      for (const frame of frames) {
        push(frame.function);
        push(frame.filename);
      }
    }
  }

  return parts.join(' ').toLowerCase();
}

function dropOne(event: CaptureLike | null): CaptureLike | null {
  if (!event || event.event !== '$exception') return event;
  const text = exceptionHaystack(event);
  if (NOISE.some((needle) => text.includes(needle))) return null;
  return event;
}

export function dropInAppBrowserExceptions<T>(eventOrEvents: T): T | null {
  if (Array.isArray(eventOrEvents)) {
    return eventOrEvents.filter((event) => dropOne(event as CaptureLike) !== null) as T;
  }
  return dropOne(eventOrEvents as CaptureLike) as T | null;
}
