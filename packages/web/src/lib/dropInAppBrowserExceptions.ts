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

/**
 * Vite dev-server frames only appear on a developer's own machine. Fast
 * Refresh can desync a React context from its mounted provider during an
 * edit, which throws guard errors like `useTasks must be used within a
 * TaskProvider`. A production build serves bundled assets and never a
 * localhost origin, so these frames mark noise no real user can hit.
 */
const DEV_FRAME_MARKERS = [
  '/node_modules/.vite/deps/',
  '://localhost',
  '://127.0.0.1',
];

type Frame = { function?: string; filename?: string };

type CaptureLike = {
  event?: string;
  properties?: Record<string, unknown>;
};

function exceptionFrames(event: CaptureLike): Frame[] {
  const list = event.properties?.$exception_list;
  if (!Array.isArray(list)) return [];
  const frames: Frame[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const stacktrace = (item as Record<string, unknown>).stacktrace as { frames?: Frame[] } | undefined;
    const itemFrames = stacktrace?.frames;
    if (Array.isArray(itemFrames)) frames.push(...itemFrames);
  }
  return frames;
}

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
    }
  }

  for (const frame of exceptionFrames(event)) {
    push(frame.function);
    push(frame.filename);
  }

  return parts.join(' ').toLowerCase();
}

function isDevServerException(event: CaptureLike): boolean {
  return exceptionFrames(event).some((frame) => {
    const filename = frame.filename?.toLowerCase() ?? '';
    return DEV_FRAME_MARKERS.some((marker) => filename.includes(marker));
  });
}

function dropOne(event: CaptureLike | null): CaptureLike | null {
  if (!event || event.event !== '$exception') return event;
  if (isDevServerException(event)) return null;
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
