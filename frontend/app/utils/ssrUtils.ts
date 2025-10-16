import { detectBrowser } from './browserUtils';

/**
 * SSR-safe browser detection utilities
 */

export interface BrowserInfo {
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isEdge: boolean;
  isOpera: boolean;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  name: string;
  version: string;
  userAgent: string;
}

/**
 * Default browser info for SSR environment
 */
export const SSR_BROWSER_INFO: BrowserInfo = {
  isSafari: false,
  isChrome: false,
  isFirefox: false,
  isEdge: false,
  isOpera: false,
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  name: 'unknown',
  version: 'unknown',
  userAgent: 'unknown'
};

/**
 * Safely detect browser, returning fallback during SSR
 */
export function safeDetectBrowser(): BrowserInfo {
  if (typeof window === 'undefined') {
    return SSR_BROWSER_INFO;
  }
  return detectBrowser();
}

/**
 * Check if code is running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Check if code is running in SSR environment
 */
export function isSSR(): boolean {
  return typeof window === 'undefined';
}

/**
 * Execute a function only in browser environment
 */
export function onlyInBrowser<T>(fn: () => T, fallback?: T): T | undefined {
  if (isBrowser()) {
    return fn();
  }
  return fallback;
}

/**
 * Hook to safely use browser API with SSR support
 */
export function useSafeBrowserAPI<T>(
  browserFn: () => T,
  ssrFallback: T
): T {
  return isBrowser() ? browserFn() : ssrFallback;
}

