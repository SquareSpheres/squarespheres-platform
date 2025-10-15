import { BrowserInfo } from './browserUtils';

export interface SignalingBrowserConfig {
  connectionDelay: number;
  connectionTimeout: number;
  maxRetries: number;
  retryBackoff: (attempt: number) => number;
  shouldRetryOnError: boolean;
}

const safariIOSConfig: SignalingBrowserConfig = {
  connectionDelay: 100,
  connectionTimeout: 20000,
  maxRetries: 3,
  retryBackoff: (attempt: number) => 1000 * attempt,
  shouldRetryOnError: true,
};

const safariConfig: SignalingBrowserConfig = {
  connectionDelay: 0,
  connectionTimeout: 20000,
  maxRetries: 2,
  retryBackoff: (attempt: number) => 1000 * attempt,
  shouldRetryOnError: false,
};

const defaultConfig: SignalingBrowserConfig = {
  connectionDelay: 0,
  connectionTimeout: 10000,
  maxRetries: 2,
  retryBackoff: (attempt: number) => 1000 * attempt,
  shouldRetryOnError: false,
};

export function getSignalingBrowserConfig(browserInfo: BrowserInfo): SignalingBrowserConfig {
  if (browserInfo.isSafari && browserInfo.isIOS) {
    return safariIOSConfig;
  }
  
  if (browserInfo.isSafari) {
    return safariConfig;
  }
  
  return defaultConfig;
}

export function getConnectionDelay(browserInfo: BrowserInfo): number {
  return getSignalingBrowserConfig(browserInfo).connectionDelay;
}

export function getConnectionTimeout(browserInfo: BrowserInfo): number {
  return getSignalingBrowserConfig(browserInfo).connectionTimeout;
}

export function getMaxRetries(browserInfo: BrowserInfo): number {
  return getSignalingBrowserConfig(browserInfo).maxRetries;
}

export function getRetryDelay(browserInfo: BrowserInfo, attempt: number): number {
  return getSignalingBrowserConfig(browserInfo).retryBackoff(attempt);
}

export function shouldRetryOnError(browserInfo: BrowserInfo): boolean {
  return getSignalingBrowserConfig(browserInfo).shouldRetryOnError;
}

