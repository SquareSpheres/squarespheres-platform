"use client";

import { WebRTCSignalPayload } from "./webrtcTypes";
import { SignalingMessage } from "./useSignalingClient";
import { detectBrowser } from "../utils/browserUtils";
import { Logger, consoleLogger } from "../types/logger";
import { WebRTCDebugLogger, createDebugLogger } from "../utils/webrtcDebug";
import {
  ConnectionStats,
  isConnectionReady,
  getStatsWithRetry,
  getCandidatesFromPair,
  determineConnectionType,
  extractJitterFromStats,
  createConnectionStats,
  createUnknownStats,
} from "../utils/webrtcStats";
import {
  getMaxRetries,
  getRetryDelay,
  getIceRestartDelay,
  supportsAutoIceRestart,
  getDataChannelConfig,
  shouldIgnoreDuplicateIceErrors,
} from "../utils/webrtcBrowserConfig";

// Re-export for backward compatibility
export type { ConnectionStats } from "../utils/webrtcStats";
export { getIceCandidateStats } from "../utils/webrtcDebug";
export type { IceCandidateStats } from "../utils/webrtcDebug";


export interface PeerConnectionConfig {
  iceServers: RTCIceServer[];
  browserInfo: ReturnType<typeof detectBrowser>;
  debug?: boolean;
}

export class ConnectionWatchdog {
  private connectionTimeoutRef: NodeJS.Timeout | null = null;
  private iceGatheringTimeoutRef: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private retryInProgress = false;
  private config: WatchdogConfig;

  constructor(config: WatchdogConfig) {
    this.config = config;
  }

  startConnectionTimeout(): void {
    this.clearConnectionTimeout();
    this.connectionTimeoutRef = setTimeout(() => {
      this.log("Connection timeout reached");
      this.config.onConnectionTimeout?.();
    }, this.config.connectionTimeoutMs);
  }

  startIceGatheringTimeout(): void {
    this.clearIceGatheringTimeout();
    this.iceGatheringTimeoutRef = setTimeout(() => {
      this.log("ICE gathering timeout reached");
    }, this.config.iceGatheringTimeoutMs);
  }

  clearTimeouts(): void {
    this.clearConnectionTimeout();
    this.clearIceGatheringTimeout();
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutRef) {
      clearTimeout(this.connectionTimeoutRef);
      this.connectionTimeoutRef = null;
    }
  }

  private clearIceGatheringTimeout(): void {
    if (this.iceGatheringTimeoutRef) {
      clearTimeout(this.iceGatheringTimeoutRef);
      this.iceGatheringTimeoutRef = null;
    }
  }

  canRetry(): boolean {
    const { browserInfo } = this.config;
    const maxRetries = getMaxRetries(browserInfo);
    return this.retryCount < maxRetries && !this.retryInProgress;
  }

  startRetry(): void {
    this.retryCount++;
    this.retryInProgress = true;
  }

  endRetry(): void {
    this.retryInProgress = false;
  }

  resetRetryCount(): void {
    this.retryCount = 0;
    this.retryInProgress = false;
  }

  getRetryDelay(): number {
    const { browserInfo } = this.config;
    return getRetryDelay(browserInfo);
  }

  handleConnectionStateChange(state: RTCPeerConnectionState): void {
    if (state === "connected" || state === "failed" || state === "closed") {
      this.clearTimeouts();
    }

    if (state === "connected") {
      this.resetRetryCount();
      this.log("Connection established successfully");
    }

    if (state === "failed") {
      this.log("Connection failed");
      this.config.onConnectionFailed?.(new Error("WebRTC connection failed"));
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      const logger = this.config.logger || consoleLogger;
      logger.log(`[ConnectionWatchdog] ${message}`);
    }
  }
}

export function createPeerConnection(
  config: PeerConnectionConfig
): RTCPeerConnection {
  const { browserInfo } = config;

  const pcConfig: RTCConfiguration = {
    iceServers: config.iceServers,
    iceCandidatePoolSize: 0,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: "all",
  };

  const pc = new RTCPeerConnection(pcConfig);

  const debugLogger = createDebugLogger(config.debug || false, '[WebRTC Utils]');
  
  debugLogger.logPeerConnectionCreation({
    iceServers: pcConfig.iceServers || [],
    iceCandidatePoolSize: pcConfig.iceCandidatePoolSize || 0,
    bundlePolicy: pcConfig.bundlePolicy || "max-bundle",
    rtcpMuxPolicy: pcConfig.rtcpMuxPolicy || "require",
    iceTransportPolicy: pcConfig.iceTransportPolicy || "all",
    browser: browserInfo.name,
    isSafari: browserInfo.isSafari,
    isChrome: browserInfo.isChrome,
  });

  return pc;
}

export interface WebRTCEventHandlers {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelStateChange?: (state: RTCDataChannelState) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onChannelMessage?: (data: any) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit | null) => void;
  onIceGatheringStateChange?: (state: RTCIceGatheringState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}

export function attachEventHandlers(
  pc: RTCPeerConnection,
  handlers: WebRTCEventHandlers,
  debug = false
): void {
  const debugLogger = createDebugLogger(debug, '[WebRTC]');

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    debugLogger.logConnectionStateChange(state);
    handlers.onConnectionStateChange?.(state);
  };

  pc.onicecandidate = (evt) => {
    if (evt.candidate) {
      debugLogger.logIceCandidate(evt.candidate.candidate);
    }
    handlers.onIceCandidate?.(evt.candidate?.toJSON() || null);
  };

  pc.onicegatheringstatechange = () => {
    handlers.onIceGatheringStateChange?.(pc.iceGatheringState);
  };

  pc.oniceconnectionstatechange = () => {
    debugLogger.logIceConnectionState(pc.iceConnectionState);
    handlers.onIceConnectionStateChange?.(pc.iceConnectionState);
  };
}

export function createDataChannel(
  pc: RTCPeerConnection,
  label: string,
  browserInfo: ReturnType<typeof detectBrowser>,
  debug = false
): RTCDataChannel {
  const dcConfig = getDataChannelConfig(browserInfo);
  const dc = pc.createDataChannel(label, dcConfig);

  const debugLogger = createDebugLogger(debug, '[WebRTC Utils]');
  debugLogger.logDataChannelCreation(label, dcConfig);

  return dc;
}

// Detect the maximum message size for a WebRTC data channel
export function getDataChannelMaxMessageSize(
  dataChannel: RTCDataChannel
): number {
  // Try to get the maxMessageSize property if available
  if (
    "maxMessageSize" in dataChannel &&
    typeof dataChannel.maxMessageSize === "number"
  ) {
    return dataChannel.maxMessageSize;
  }

  // Fallback to conservative estimates based on browser
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

  if (userAgent.includes("Chrome") || userAgent.includes("Chromium")) {
    return 256 * 1024; // 256KB for Chrome
  } else if (userAgent.includes("Firefox")) {
    return 256 * 1024; // 256KB for Firefox
  } else if (userAgent.includes("Safari")) {
    return 64 * 1024; // 64KB for Safari (more conservative)
  }

  // Conservative fallback for unknown browsers
  return 64 * 1024; // 64KB
}

export function isChrome(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    /Chrome/.test(navigator.userAgent) &&
    !/Edge|Edg/.test(navigator.userAgent)
  );
}

export function isLocalhost(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  );
}

/**
 * @deprecated Use useWebRTCConfig hook instead for dynamic TURN server integration
 * Legacy fallback STUN servers - kept for backward compatibility
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // Reliable STUN servers for NAT traversal
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.services.mozilla.com:3478" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },

  // TURN servers are now dynamically loaded via useWebRTCConfig hook
  // This provides better reliability and works in restrictive networks
];

export function createEnhancedIceServers(
  customServers?: RTCIceServer[]
): RTCIceServer[] {
  const baseServers = customServers || DEFAULT_ICE_SERVERS;

  if (!isLocalhost()) {
    // TURN servers can be added here for production use
  }

  return baseServers;
}


export interface SignalingHandlers {
  onOffer: (
    sdp: RTCSessionDescriptionInit,
    message: SignalingMessage
  ) => Promise<void>;
  onAnswer: (
    sdp: RTCSessionDescriptionInit,
    message: SignalingMessage
  ) => Promise<void>;
  onIceCandidate: (
    candidate: RTCIceCandidateInit | null,
    message: SignalingMessage
  ) => Promise<void>;
}

export interface WebRTCEventHandlerConfig {
  role: "client" | "host";
  clientId?: string; // For host role, the client ID this connection is for
  pc: RTCPeerConnection; // Add peer connection reference
  watchdog: ConnectionWatchdog;
  sendSignal: (
    payload: WebRTCSignalPayload,
    targetClientId?: string
  ) => Promise<void>;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onIceCandidate?: (
    candidate: RTCIceCandidateInit | null,
    connectionType: string
  ) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onChannelMessage?: (data: any) => void;
  browserInfo: ReturnType<typeof detectBrowser>;
  debug?: boolean;
  logger?: Logger;
}

export function createWebRTCEventHandlers(
  config: WebRTCEventHandlerConfig
): WebRTCEventHandlers {
  const {
    role,
    clientId,
    pc,
    watchdog,
    sendSignal,
    onConnectionStateChange,
    onIceConnectionStateChange,
    onIceCandidate,
    onChannelOpen,
    onChannelClose,
    onChannelMessage,
    browserInfo,
    debug,
    logger = consoleLogger,
  } = config;
  
  const prefix =
    role === "host"
      ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ""}`
      : "[WebRTC Client]";

  const debugLogger = createDebugLogger(debug || false, prefix, logger);

  return {
    onConnectionStateChange: (state: RTCPeerConnectionState) => {
      watchdog.handleConnectionStateChange(state);
      onConnectionStateChange?.(state);

      if (state === "connected") {
        debugLogger.log("Connection established!");
      } else if (state === "failed") {
        debugLogger.error("Connection failed");
      }
    },

    onDataChannelStateChange: (state: RTCDataChannelState) => {
      // This will be handled by individual data channel setup
    },

    onChannelOpen,

    onChannelClose,

    onChannelMessage,

    onIceCandidate: (candidate: RTCIceCandidateInit | null) => {
      if (candidate) {
        const candidateType = candidate.candidate?.split(" ")[7] || "unknown";
        const isHost = candidateType === "host";
        const isSrflx = candidateType === "srflx";
        const isPrflx = candidateType === "prflx";
        const isRelay = candidateType === "relay";

        let connectionType = "🔗 DIRECT";
        if (isRelay) {
          connectionType = "🔄 RELAY (TURN)";
        } else if (isHost) {
          connectionType = "🏠 HOST (Local)";
        } else if (isSrflx) {
          connectionType = "🌐 SRFLX (STUN)";
        } else if (isPrflx) {
          connectionType = "🔍 PRFLX (Peer Reflexive)";
        }

        onIceCandidate?.(candidate, connectionType);
        debugLogger.logIceCandidateType(candidateType, isRelay, isSrflx, isPrflx, isHost);
        sendSignal({ kind: "webrtc-ice", candidate }, clientId);
      } else {
        onIceCandidate?.(null, "End of candidates");
        debugLogger.logIceGatheringComplete();
        sendSignal({ kind: "webrtc-ice", candidate: null as any }, clientId);
      }
    },

    onIceGatheringStateChange: (state: RTCIceGatheringState) => {
      debugLogger.logIceGatheringState(state);
    },

    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      debugLogger.logIceConnectionState(state);

      if (state === "failed") {
        debugLogger.logIceConnectionFailed();
        debugLogger.logIceConnectionDiagnostics(pc);
        
        if (supportsAutoIceRestart(browserInfo) && pc.remoteDescription) {
          debugLogger.logIceRestart(browserInfo.name, 'failed');
          try {
            pc.restartIce();
            debugLogger.logIceRestartSuccess();
          } catch (error) {
            debugLogger.logIceRestartFailed(error);
          }
        }
      } else if (state === "disconnected") {
        debugLogger.logIceConnectionDisconnected();
        debugLogger.logIceConnectionDiagnostics(pc);
        
        if (supportsAutoIceRestart(browserInfo) && pc.remoteDescription) {
          const delay = getIceRestartDelay(browserInfo);
          setTimeout(() => {
            if (pc.iceConnectionState === "disconnected") {
              debugLogger.logIceRestart(browserInfo.name, 'disconnected');
              try {
                pc.restartIce();
                debugLogger.logIceRestartSuccess();
              } catch (error) {
                debugLogger.logIceRestartFailed(error);
              }
            } else {
              debugLogger.logIceConnectionRecovered();
            }
          }, delay);
        }
      } else if (state === "connected") {
        debugLogger.logIceConnectionEstablished();
        debugLogger.logIceConnectionDiagnostics(pc);
        
        getConnectionStats(pc, debug)
          .then((stats) => {
            debugLogger.logConnectionStats({
              type: stats.connectionType,
              local: stats.localCandidate,
              remote: stats.remoteCandidate,
              rtt: stats.rtt,
              bytesReceived: stats.bytesReceived,
              bytesSent: stats.bytesSent,
            });
            onIceCandidate?.(null, `✅ ${stats.connectionType}`);
          })
          .catch((error) => {
            debugLogger.logConnectionStatsError(error);
          });
      }

      onIceConnectionStateChange?.(state);
    },
  };
}

export interface DataChannelConfig {
  onOpen?: (readyState: RTCDataChannelState) => void;
  onClose?: (readyState: RTCDataChannelState) => void;
  onMessage?: (data: any) => void;
  onDataChannelReady?: (maxMessageSize: number) => void;
  debug?: boolean;
  role?: "client" | "host";
  clientId?: string; // For host role
}

export function setupDataChannel(
  dc: RTCDataChannel,
  config: DataChannelConfig
): void {
  const {
    onOpen,
    onClose,
    onMessage,
    onDataChannelReady,
    debug,
    role = "client",
    clientId,
  } = config;
  
  const prefix =
    role === "host"
      ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ""}`
      : "[WebRTC Client]";

  const debugLogger = createDebugLogger(debug || false, prefix);

  dc.binaryType = "arraybuffer";

  dc.onopen = () => {
    debugLogger.logDataChannelOpen(dc.binaryType);
    
    const maxMessageSize = getDataChannelMaxMessageSize(dc);
    debugLogger.logDataChannelMaxMessageSize(maxMessageSize);
    onDataChannelReady?.(maxMessageSize);

    onOpen?.(dc.readyState);
  };

  dc.onclose = () => {
    debugLogger.logDataChannelClosed();
    onClose?.(dc.readyState);
  };

  dc.onmessage = (e) => {
    onMessage?.(e.data);
  };
}

export class ICECandidateManager {
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private browserInfo: ReturnType<typeof detectBrowser>;
  private debugLogger: WebRTCDebugLogger;
  private role: "client" | "host";

  constructor(
    browserInfo: ReturnType<typeof detectBrowser>,
    debug = false,
    role: "client" | "host" = "client",
    clientId?: string
  ) {
    this.browserInfo = browserInfo;
    this.role = role;
    
    const prefix = role === "host"
      ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ""}`
      : "[WebRTC Client]";
    
    this.debugLogger = createDebugLogger(debug, prefix);
  }

  storePendingCandidate(
    candidate: RTCIceCandidateInit,
    clientId?: string
  ): void {
    const key = clientId || "default";
    if (!this.pendingCandidates.has(key)) {
      this.pendingCandidates.set(key, []);
    }
    this.pendingCandidates.get(key)!.push(candidate);
    this.debugLogger.log(`Storing ICE candidate as pending for ${key}`);
  }

  async addPendingCandidates(
    pc: RTCPeerConnection,
    clientId?: string
  ): Promise<void> {
    const key = clientId || "default";
    const candidates = this.pendingCandidates.get(key) || [];

    for (const candidate of candidates) {
      try {
        this.debugLogger.log(`Adding pending ICE candidate for ${key}:`, candidate.candidate);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        this.debugLogger.log('Successfully added pending ICE candidate');
      } catch (error) {
        this.debugLogger.warn('Failed to add pending ICE candidate:', error);
      }
    }

    this.pendingCandidates.delete(key);
  }

  async addCandidate(
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit | null,
    clientId?: string
  ): Promise<void> {
    if (!candidate) {
      this.debugLogger.log(`Received end-of-candidates${clientId ? ` from ${clientId}` : ""}`);
      return;
    }

    try {
      this.debugLogger.log(`Adding ICE candidate${clientId ? ` from ${clientId}` : ""}:`, candidate.candidate);
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      if (pc.remoteDescription === null) {
        this.storePendingCandidate(candidate, clientId);
      } else if (shouldIgnoreDuplicateIceErrors(this.browserInfo) && (error as Error).name === "OperationError") {
        this.debugLogger.log('Browser-specific ICE candidate error (likely duplicate), ignoring');
      } else {
        this.debugLogger.warn('ICE candidate addition failed but remote description is set - this might be normal');
      }
    }
  }

  clear(clientId?: string): void {
    if (clientId) {
      this.pendingCandidates.delete(clientId);
    } else {
      this.pendingCandidates.clear();
    }
  }
}

export interface WatchdogConfig {
  connectionTimeoutMs: number;
  iceGatheringTimeoutMs: number;
  browserInfo: ReturnType<typeof detectBrowser>;
  onConnectionTimeout?: () => void;
  onConnectionFailed?: (error: Error) => void;
  debug?: boolean;
  logger?: Logger;
}

export function createConnectionWatchdog(
  config: WatchdogConfig
): ConnectionWatchdog {
  return new ConnectionWatchdog(config);
}

export function createSignalingMessageHandler(
  handlers: SignalingHandlers,
  debug = false
) {
  return async (message: SignalingMessage) => {
    if (!message.payload) return;

    let parsed: WebRTCSignalPayload | undefined;
    try {
      parsed = JSON.parse(message.payload);
    } catch (error) {
      if (debug) {
        console.warn(
          "[WebRTC Utils] Failed to parse signaling message:",
          error
        );
      }
      return;
    }

    if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) return;

    try {
      if (parsed.kind === "webrtc-offer") {
        await handlers.onOffer(parsed.sdp, message);
      } else if (parsed.kind === "webrtc-answer") {
        await handlers.onAnswer(parsed.sdp, message);
      } else if (parsed.kind === "webrtc-ice") {
        await handlers.onIceCandidate(parsed.candidate, message);
      }
    } catch (error) {
      if (debug) {
        console.error(`[WebRTC Utils] Error handling ${parsed.kind}:`, error);
      }
    }
  };
}

/**
 * Waits for a data channel's buffer to fully drain (bufferedAmount === 0)
 * This ensures all data is transmitted before marking a transfer as complete
 */
export async function waitForBufferDrain(
  dataChannel: RTCDataChannel,
  timeoutMs: number = 5000,
  debug = false
): Promise<void> {
  const debugLogger = createDebugLogger(debug, '[WebRTC Utils]');

  if (dataChannel.bufferedAmount === 0) {
    debugLogger.logBufferAlreadyDrained();
    return;
  }

  debugLogger.logBufferDrainWaiting(dataChannel.bufferedAmount);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      debugLogger.logBufferDrainTimeout(timeoutMs, dataChannel.bufferedAmount);
      reject(
        new Error(
          `Buffer drain timeout: ${dataChannel.bufferedAmount} bytes still pending`
        )
      );
    }, timeoutMs);

    const checkBuffer = () => {
      if (dataChannel.bufferedAmount === 0) {
        clearTimeout(timeout);
        debugLogger.logBufferDrained();
        resolve();
      } else {
        debugLogger.logBufferDrainProgress(dataChannel.bufferedAmount);
        setTimeout(checkBuffer, 100);
      }
    };

    checkBuffer();
  });
}

/**
 * Gets the actual connection statistics using RTCPeerConnection.getStats()
 * This provides the selected candidate pair and real connection metrics
 */
export async function getConnectionStats(
  pc: RTCPeerConnection,
  debug = false
): Promise<ConnectionStats> {
  const debugLogger = createDebugLogger(debug, '[WebRTC Stats]');

  try {
    if (!isConnectionReady(pc)) {
      debugLogger.logConnectionNotReady(pc.connectionState, pc.iceConnectionState);
      return createUnknownStats("Connecting...");
    }

    const { stats, candidatePair } = await getStatsWithRetry(
      pc,
      () => debugLogger.logNoTrafficYetWaiting(),
      (maxBytes, nominated, selected) => {
        debugLogger.logAfterWait(maxBytes, nominated, selected);
        if (candidatePair) {
          debugLogger.logSelectedPairMethod(maxBytes, nominated);
        }
      }
    );

    const { localCandidate, remoteCandidate } = getCandidatesFromPair(stats, candidatePair);

    if (!candidatePair || !localCandidate || !remoteCandidate) {
      return createUnknownStats("Negotiating...");
    }

    const connectionType = determineConnectionType(localCandidate, remoteCandidate);
    const jitter = extractJitterFromStats(stats);

    debugLogger.logConnectionType(
      connectionType,
      localCandidate.candidateType,
      remoteCandidate.candidateType
    );

    return createConnectionStats(connectionType, localCandidate, remoteCandidate, candidatePair, jitter);
  } catch (error) {
    console.error("Failed to get connection stats:", error);
    return createUnknownStats("Error");
  }
}

