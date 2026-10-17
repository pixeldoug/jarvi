/**
 * Maps a request User-Agent to the same web-platform buckets Meta Ads uses
 * (Desktop web / Android web / iOS web). Native app clients are labeled so
 * product analytics can ignore them.
 */

export type ClientPlatform =
  | 'Desktop web'
  | 'Android web'
  | 'iOS web'
  | 'Android app'
  | 'iOS app'
  | 'Unknown';

export type ClientPlatformProperties = {
  $raw_user_agent?: string;
  $os?: string;
  $device_type?: 'Desktop' | 'Mobile' | 'Tablet';
  $browser?: string;
  platform: ClientPlatform;
};

const headerValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const browserFromUa = (ua: string): string | undefined => {
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/CriOS/i.test(ua)) return 'Chrome iOS';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Mobile\/.*Safari/i.test(ua) || /iPhone|iPad|iPod/i.test(ua)) return 'Mobile Safari';
  if (/Safari/i.test(ua)) return 'Safari';
  return undefined;
};

export const clientPlatformProperties = (
  userAgent: string | string[] | undefined,
): ClientPlatformProperties => {
  const ua = headerValue(userAgent).trim();
  if (!ua) return { platform: 'Unknown' };

  const isMozilla = /Mozilla\//i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isIos = /iPhone|iPad|iPod|iOS/i.test(ua);
  const isIpadOsDesktop = /Macintosh/i.test(ua) && /Mobile\//i.test(ua);

  if (!isMozilla) {
    if (isAndroid) {
      return {
        $raw_user_agent: ua,
        $os: 'Android',
        $device_type: 'Mobile',
        platform: 'Android app',
      };
    }
    if (isIos || /Darwin|CFNetwork|iPhone OS/i.test(ua)) {
      return {
        $raw_user_agent: ua,
        $os: 'iOS',
        $device_type: 'Mobile',
        platform: 'iOS app',
      };
    }
    return { $raw_user_agent: ua, platform: 'Unknown' };
  }

  const browser = browserFromUa(ua);

  if (isIos || isIpadOsDesktop) {
    return {
      $raw_user_agent: ua,
      $os: 'iOS',
      $device_type: /iPad/i.test(ua) || isIpadOsDesktop ? 'Tablet' : 'Mobile',
      $browser: browser,
      platform: 'iOS web',
    };
  }

  if (isAndroid) {
    const tablet = /Tablet|SM-T/i.test(ua) || !/Mobile/i.test(ua);
    return {
      $raw_user_agent: ua,
      $os: 'Android',
      $device_type: tablet ? 'Tablet' : 'Mobile',
      $browser: browser,
      platform: 'Android web',
    };
  }

  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /CrOS/i.test(ua)
      ? 'Chrome OS'
      : /Mac OS X|Macintosh/i.test(ua)
        ? 'Mac OS X'
        : /Linux/i.test(ua)
          ? 'Linux'
          : undefined;

  return {
    $raw_user_agent: ua,
    $os: os,
    $device_type: 'Desktop',
    $browser: browser,
    platform: 'Desktop web',
  };
};
