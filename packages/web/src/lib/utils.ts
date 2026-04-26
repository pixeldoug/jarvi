/**
 * Parse a date string into a Date object in local timezone
 * Avoids UTC interpretation issues with new Date("YYYY-MM-DD")
 * @param dateString - ISO date string (e.g., "2024-01-03" or "2024-01-03T10:00:00")
 * @returns Date object in local timezone, or null if invalid
 */
export function parseDateString(dateString?: string): Date | null {
  if (!dateString) return null;
  
  try {
    const dateOnly = dateString.split('T')[0];
    const [year, month, day] = dateOnly.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Format task date for display
 * @param dueDate - ISO date string (e.g., "2024-01-03" or "2024-01-03T10:00:00")
 * @param time - Optional time string (e.g., "10:00")
 * @returns Formatted string like "7 Jan, 09:00" (with time) or "7 Jan" (without time), or null if invalid
 */
function normalizeTime(time?: string | null): string | undefined {
  if (!time) return undefined;
  const trimmed = time.trim();
  if (trimmed === '') return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return undefined;
  return trimmed;
}

export function formatTaskDate(dueDate?: string, time?: string): string | null {
  const date = parseDateString(dueDate);
  if (!date) return null;
  
  try {
    const t = normalizeTime(time);
    const dayNum = date.getDate();
    const monthStr = date.toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '')
      .replace(/^./, str => str.toUpperCase());
    
    // Format: "7 Jan, 09:00" when time exists, otherwise "7 Jan"
    return t ? `${dayNum} ${monthStr}, ${t}` : `${dayNum} ${monthStr}`;
  } catch {
    return null;
  }
}

/**
 * Returns true if the given due date string represents today (local time).
 */
export function isToday(dueDate?: string): boolean {
  const date = parseDateString(dueDate);
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

const WEEKDAY_NAMES_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * Format task date as weekday name (for "esta semana" section)
 * @param dueDate - ISO date string
 * @param time - Optional time string (e.g., "10:00")
 * @returns Formatted string like "Sexta" or "Sexta, 09:00", or null if invalid
 */
export function formatTaskDateWeekday(dueDate?: string, time?: string): string | null {
  const date = parseDateString(dueDate);
  if (!date) return null;

  try {
    const t = normalizeTime(time);
    const weekday = WEEKDAY_NAMES_PT[date.getDay()];
    return t ? `${weekday}, ${t}` : weekday;
  } catch {
    return null;
  }
}

/**
 * Detect if the user is on macOS or iOS
 * @returns true if running on macOS or iOS, false otherwise
 */
export function isMac(): boolean {
  if (typeof window === 'undefined') return false;
  
  const platform = navigator.platform.toUpperCase();
  const userAgent = navigator.userAgent.toUpperCase();
  
  return (
    platform.indexOf('MAC') >= 0 ||
    platform.indexOf('IPHONE') >= 0 ||
    platform.indexOf('IPAD') >= 0 ||
    userAgent.indexOf('MAC') >= 0 ||
    userAgent.indexOf('IPHONE') >= 0 ||
    userAgent.indexOf('IPAD') >= 0
  );
}

/**
 * Format keyboard shortcut for display based on the user's operating system
 * Converts "Ctrl" to "⌘" on Mac, keeps "Ctrl" on Windows/Linux
 * 
 * @param shortcut - Keyboard shortcut string (e.g., "Ctrl+K", "Ctrl+Shift+S", "Esc")
 * @returns Formatted shortcut string (e.g., "⌘K" on Mac, "Ctrl+K" on Windows)
 * 
 * @example
 * formatKeyboardShortcut("Ctrl+K") // "⌘K" on Mac, "Ctrl+K" on Windows
 * formatKeyboardShortcut("Ctrl+Shift+S") // "⌘⇧S" on Mac, "Ctrl+Shift+S" on Windows
 * formatKeyboardShortcut("Esc") // "Esc" (unchanged)
 */
export function formatKeyboardShortcut(shortcut: string): string {
  if (!shortcut) return shortcut;
  
  const isMacOS = isMac();
  
  // If already using Mac symbols, return as is
  if (shortcut.includes('⌘') || shortcut.includes('⇧') || shortcut.includes('⌥') || shortcut.includes('⌃')) {
    return shortcut;
  }
  
  // Convert Ctrl to Command (⌘) on Mac
  if (isMacOS) {
    return shortcut
      .replace(/\bCtrl\b/gi, '⌘')
      .replace(/\bControl\b/gi, '⌃')
      .replace(/\bShift\b/gi, '⇧')
      .replace(/\bAlt\b/gi, '⌥')
      .replace(/\bOption\b/gi, '⌥')
      .replace(/\bMeta\b/gi, '⌘')
      .replace(/\bCmd\b/gi, '⌘')
      .replace(/\bCommand\b/gi, '⌘');
  }
  
  // On Windows/Linux, keep Ctrl but normalize common variations
  return shortcut
    .replace(/\bCmd\b/gi, 'Ctrl')
    .replace(/\bCommand\b/gi, 'Ctrl')
    .replace(/\bMeta\b/gi, 'Ctrl');
}
