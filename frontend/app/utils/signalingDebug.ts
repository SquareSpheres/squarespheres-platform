import { BrowserInfo } from './browserUtils';

export interface SignalingDebugLogger {
  logConnection: (url: string, browserInfo: BrowserInfo, retryAttempt: number) => void;
  logConnected: (url: string) => void;
  logTimeout: (url: string, timeout: number) => void;
  logClosed: (url: string, code: number, reason: string, wasClean: boolean) => void;
  logError: (url: string, browserInfo: BrowserInfo, retryAttempt: number, maxRetries: number, error: any) => void;
  logRetry: (retryAttempt: number, maxRetries: number) => void;
}

export function createSignalingLogger(enabled: boolean = true): SignalingDebugLogger {
  return {
    logConnection: (url, browserInfo, retryAttempt) => {
      if (enabled) {
        console.log(`[SignalingClient] Connecting to WebSocket URL: ${url}`, {
          browser: browserInfo.name,
          isSafari: browserInfo.isSafari,
          isIOS: browserInfo.isIOS,
          retryAttempt
        });
      }
    },
    
    logConnected: (url) => {
      if (enabled) {
        console.log(`[SignalingClient] Successfully connected to: ${url}`);
      }
    },
    
    logTimeout: (url, timeout) => {
      if (enabled) {
        console.error(`[SignalingClient] Connection timeout after ${timeout}ms`);
      }
    },
    
    logClosed: (url, code, reason, wasClean) => {
      if (enabled) {
        console.log(`[SignalingClient] Connection closed to: ${url}`, {
          code,
          reason,
          wasClean
        });
      }
    },
    
    logError: (url, browserInfo, retryAttempt, maxRetries, error) => {
      if (enabled) {
        console.error(`[SignalingClient] Connection error to: ${url}`, {
          error,
          browser: browserInfo.name,
          isSafari: browserInfo.isSafari,
          isIOS: browserInfo.isIOS,
          retryAttempt,
          maxRetries
        });
      }
    },
    
    logRetry: (retryAttempt, maxRetries) => {
      if (enabled) {
        console.log(`[SignalingClient] Retry attempt ${retryAttempt}/${maxRetries}`);
      }
    }
  };
}

/**
 * Test WebSocket connection for Safari iOS
 * This is a diagnostic utility for debugging connection issues
 */
export async function testWebSocketConnection(testUrl: string, browserInfo: BrowserInfo): Promise<boolean> {
  if (!browserInfo.isSafari || !browserInfo.isIOS) {
    return true;
  }

  console.log(`[SignalingClient] Testing Safari iOS WebSocket connection to: ${testUrl}`);
  
  return new Promise((resolve) => {
    const testWs = new WebSocket(testUrl);
    
    const timeout = setTimeout(() => {
      testWs.close();
      console.log(`[SignalingClient] Safari iOS connection test timeout`);
      resolve(false);
    }, 5000);

    testWs.onopen = () => {
      clearTimeout(timeout);
      testWs.close();
      console.log(`[SignalingClient] Safari iOS connection test successful`);
      resolve(true);
    };

    testWs.onerror = (error) => {
      clearTimeout(timeout);
      console.error(`[SignalingClient] Safari iOS connection test failed:`, error);
      resolve(false);
    };
  });
}

