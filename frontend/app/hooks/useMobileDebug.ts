'use client';

import { useState, useEffect } from 'react';
import { detectBrowser, isMobile, isSafari } from '../utils/browserUtils';

interface MobileDebugConfig {
  enabled?: boolean;
  showAlerts?: boolean;
  logLevel?: 'all' | 'errors' | 'warnings' | 'none';
}

export function useMobileDebug(config: MobileDebugConfig = {}) {
  const { enabled = true, showAlerts = true, logLevel = 'all' } = config;
  const [isMobile, setIsMobile] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDevice = () => {
      const browserInfo = detectBrowser();
      setIsMobile(browserInfo.isMobile);
      setIsSafari(browserInfo.isSafari);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  const mobileLog = (message: string, data?: any, level: 'log' | 'error' | 'warn' | 'info' = 'log') => {
    if (!enabled) return;

    // Always log to console
    console[level](message, data);

    // Show alert for critical errors on mobile Safari
    if (isMobile && isSafari && showAlerts && level === 'error') {
      const alertMessage = `${message}\n${data ? JSON.stringify(data, null, 2) : ''}`;
      alert(alertMessage);
    }
  };

  const safariLog = (message: string, data?: any, level: 'log' | 'error' | 'warn' | 'info' = 'log') => {
    if (!isSafari) return;
    mobileLog(`[Safari] ${message}`, data, level);
  };

  return {
    isMobile,
    isSafari,
    mobileLog,
    safariLog,
    shouldShowDebugUI: enabled && isMobile
  };
}
