/**
 * Browser detection utilities
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

export function detectBrowser(): BrowserInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
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
  }

  const userAgent = navigator.userAgent;
  
  // Detect browsers
  const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
  const isChrome = /Chrome/.test(userAgent) && !/Edge|Edg/.test(userAgent);
  const isFirefox = /Firefox/.test(userAgent);
  const isEdge = /Edge|Edg/.test(userAgent);
  const isOpera = /Opera|OPR/.test(userAgent);
  
  // Detect mobile platforms
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
                   (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
                   window.innerWidth <= 768;
  
  const isIOS = /iPhone|iPad|iPod/.test(userAgent);
  const isAndroid = /Android/.test(userAgent);
  
  // Extract version numbers
  const safariVersion = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || '';
  const chromeVersion = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || '';
  const firefoxVersion = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || '';
  const edgeVersion = userAgent.match(/Edg\/(\d+\.\d+)/)?.[1] || '';
  
  // Determine browser name and version
  let name = 'unknown';
  let version = '';
  
  if (isChrome) {
    name = 'Chrome';
    version = chromeVersion;
  } else if (isFirefox) {
    name = 'Firefox';
    version = firefoxVersion;
  } else if (isEdge) {
    name = 'Edge';
    version = edgeVersion;
  } else if (isOpera) {
    name = 'Opera';
    version = chromeVersion; // Opera uses Chromium
  } else if (isSafari) {
    name = 'Safari';
    version = safariVersion;
  }

  return {
    isSafari,
    isChrome,
    isFirefox,
    isEdge,
    isOpera,
    isMobile,
    isIOS,
    isAndroid,
    name,
    version,
    userAgent
  };
}

// Convenience functions for common checks
export const isSafari = (): boolean => detectBrowser().isSafari;
export const isChrome = (): boolean => detectBrowser().isChrome;
export const isFirefox = (): boolean => detectBrowser().isFirefox;
export const isMobile = (): boolean => detectBrowser().isMobile;
export const isIOS = (): boolean => detectBrowser().isIOS;
export const isAndroid = (): boolean => detectBrowser().isAndroid;

// Safari-specific utilities
export const isSafariIOS = (): boolean => {
  const browser = detectBrowser();
  return browser.isSafari && browser.isIOS;
};

// WebSocket-specific utilities
export const requiresSecureWebSocket = (): boolean => {
  const browser = detectBrowser();
  return browser.isSafari && typeof window !== 'undefined' && window.location.protocol === 'https:';
};

export const getWebSocketTimeout = (): number => {
  const browser = detectBrowser();
  return browser.isSafari ? 20000 : 10000; // Safari needs longer timeout
};

// OS detection utilities
export function detectOS(): 'mac' | 'windows' | 'linux' | 'unknown' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unknown';
  }

  const userAgent = navigator.userAgent;
  const platform = navigator.platform;

  if (/Mac|iPhone|iPad|iPod/.test(userAgent) || platform === 'MacIntel') {
    return 'mac';
  } else if (/Win/.test(userAgent) || platform === 'Win32' || platform === 'Win64') {
    return 'windows';
  } else if (/Linux/.test(userAgent) || platform === 'Linux x86_64') {
    return 'linux';
  }

  return 'unknown';
}

// Keyboard shortcut utilities
export function getKeyboardShortcutText(): string {
  const os = detectOS();
  
  switch (os) {
    case 'mac':
      return '⌘⌥9';
    case 'windows':
    case 'linux':
      return 'Ctrl+Alt+9';
    default:
      return 'Cmd+Alt+9 / Ctrl+Alt+9';
  }
}
