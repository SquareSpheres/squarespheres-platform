import { BrowserInfo } from './browserUtils';

export interface BrowserWebRTCConfig {
  connection: {
    maxRetries: number;
    retryDelay: number;
    iceRestartDelay: number;
    supportsAutoIceRestart: boolean;
  };
  dataChannel: {
    config: RTCDataChannelInit;
  };
  iceCandidate: {
    ignoreDuplicateErrors: boolean;
  };
}

const chromeConfig: BrowserWebRTCConfig = {
  connection: {
    maxRetries: 0,
    retryDelay: 15000,
    iceRestartDelay: 2000,
    supportsAutoIceRestart: true,
  },
  dataChannel: {
    config: {
      ordered: true,
      protocol: 'sctp',
    },
  },
  iceCandidate: {
    ignoreDuplicateErrors: true,
  },
};

const safariConfig: BrowserWebRTCConfig = {
  connection: {
    maxRetries: 3,
    retryDelay: 5000,
    iceRestartDelay: 3000,
    supportsAutoIceRestart: true,
  },
  dataChannel: {
    config: {
      ordered: true,
    },
  },
  iceCandidate: {
    ignoreDuplicateErrors: false,
  },
};

const firefoxConfig: BrowserWebRTCConfig = {
  connection: {
    maxRetries: 2,
    retryDelay: 3000,
    iceRestartDelay: 2000,
    supportsAutoIceRestart: false,
  },
  dataChannel: {
    config: {
      ordered: true,
    },
  },
  iceCandidate: {
    ignoreDuplicateErrors: false,
  },
};

const defaultConfig: BrowserWebRTCConfig = {
  connection: {
    maxRetries: 2,
    retryDelay: 3000,
    iceRestartDelay: 2000,
    supportsAutoIceRestart: false,
  },
  dataChannel: {
    config: {
      ordered: true,
    },
  },
  iceCandidate: {
    ignoreDuplicateErrors: false,
  },
};

export function getBrowserWebRTCConfig(browserInfo: BrowserInfo): BrowserWebRTCConfig {
  if (browserInfo.isChrome) {
    return chromeConfig;
  }
  
  if (browserInfo.isSafari) {
    return safariConfig;
  }
  
  if (browserInfo.isFirefox) {
    return firefoxConfig;
  }
  
  return defaultConfig;
}

export function getMaxRetries(browserInfo: BrowserInfo): number {
  return getBrowserWebRTCConfig(browserInfo).connection.maxRetries;
}

export function getRetryDelay(browserInfo: BrowserInfo): number {
  return getBrowserWebRTCConfig(browserInfo).connection.retryDelay;
}

export function getIceRestartDelay(browserInfo: BrowserInfo): number {
  return getBrowserWebRTCConfig(browserInfo).connection.iceRestartDelay;
}

export function supportsAutoIceRestart(browserInfo: BrowserInfo): boolean {
  return getBrowserWebRTCConfig(browserInfo).connection.supportsAutoIceRestart;
}

export function getDataChannelConfig(browserInfo: BrowserInfo): RTCDataChannelInit {
  return getBrowserWebRTCConfig(browserInfo).dataChannel.config;
}

export function shouldIgnoreDuplicateIceErrors(browserInfo: BrowserInfo): boolean {
  return getBrowserWebRTCConfig(browserInfo).iceCandidate.ignoreDuplicateErrors;
}

