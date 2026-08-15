import type { CaptureResult } from 'posthog-js';

// In-app browsers (Instagram, Facebook, and similar) inject their own scripts
// into every page they open. Those scripts throw errors that are not Jarvi
// bugs — for example a native bridge that fails on unload. Exception
// autocapture forwards any window error, so these third-party crashes reach
// our error tracking and hide the real defects.
//
// This filter drops an `$exception` event when it carries no stack frame from
// our own origin, and also on the known in-app browser bridge messages. Our
// own bundles load from `window.location.origin`, so a real Jarvi error always
// has at least one frame whose file starts with that origin.

const THIRD_PARTY_MESSAGES = [
  'Error invoking postMessage',
  'Java exception was raised during method invocation',
];

interface ExceptionFrame {
  filename?: string;
  abs_path?: string;
}

interface ExceptionItem {
  value?: string;
  stacktrace?: { frames?: ExceptionFrame[] };
}

function hasFrameFromOrigin(list: ExceptionItem[], origin: string): boolean {
  return list.some((item) =>
    (item.stacktrace?.frames ?? []).some((frame) => {
      const source = frame.filename ?? frame.abs_path ?? '';
      return source.startsWith(origin);
    })
  );
}

export function filterThirdPartyExceptions(
  event: CaptureResult | null
): CaptureResult | null {
  if (!event || event.event !== '$exception') {
    return event;
  }

  const list = (event.properties?.$exception_list ?? []) as ExceptionItem[];
  const message = list.map((item) => item.value ?? '').join(' ');

  if (THIRD_PARTY_MESSAGES.some((needle) => message.includes(needle))) {
    return null;
  }

  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  if (origin && !hasFrameFromOrigin(list, origin)) {
    return null;
  }

  return event;
}
