"use client";

import { WebRTCSignalPayload } from "./webrtcTypes";
import { SignalingMessage } from "./useSignalingClient";
import { detectBrowser } from "../utils/browserUtils";
import { Logger, consoleLogger } from "../types/logger";


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
    // Safari needs more retries, Chrome needs fewer to avoid interference
    const maxRetries = browserInfo.isChrome ? 0 : browserInfo.isSafari ? 3 : 2;
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
    // Safari needs longer delays, Chrome needs very long delays
    if (browserInfo.isChrome) return 15000;
    if (browserInfo.isSafari) return 5000; // Safari needs more time but not as much as Chrome
    return 3000; // Default for other browsers
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
    iceCandidatePoolSize: 0, // Set to 0 for all browsers to prevent overwhelming signaling
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    // Always use 'all' to ensure TURN servers are used when available
    // TODO: When TURN servers are added, this will automatically use them for restrictive networks
    iceTransportPolicy: "all",
  };

  const pc = new RTCPeerConnection(pcConfig);

  if (config.debug) {
    console.log("[WebRTC Utils] Created peer connection with config:", {
      iceServers: pcConfig.iceServers,
      iceCandidatePoolSize: pcConfig.iceCandidatePoolSize,
      bundlePolicy: pcConfig.bundlePolicy,
      rtcpMuxPolicy: pcConfig.rtcpMuxPolicy,
      iceTransportPolicy: pcConfig.iceTransportPolicy,
      browser: browserInfo.name,
      isSafari: browserInfo.isSafari,
      isChrome: browserInfo.isChrome,
    });

    // Log ICE server configuration
    const stunServers =
      pcConfig.iceServers?.filter(
        (server) =>
          server.urls &&
          typeof server.urls === "string" &&
          server.urls.startsWith("stun:")
      ) || [];
    const turnServers =
      pcConfig.iceServers?.filter(
        (server) =>
          server.urls &&
          typeof server.urls === "string" &&
          (server.urls.startsWith("turn:") || server.urls.startsWith("turns:"))
      ) || [];

    console.log(
      `[WebRTC Utils] STUN servers configured: ${stunServers.length} server(s)`
    );
    if (turnServers.length > 0) {
      console.log(
        `[WebRTC Utils] TURN servers configured: ${turnServers.length} server(s)`
      );
    } else {
      console.log(
        "[WebRTC Utils] ℹ️ Using STUN-only configuration - TURN servers can be added for restrictive networks"
      );
    }
  }

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
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (debug) {
      console.log(`[WebRTC] Connection state changed to: ${state}`);
    }
    handlers.onConnectionStateChange?.(state);
  };

  pc.onicecandidate = (evt) => {
    if (debug && evt.candidate) {
      console.log(`[WebRTC] ICE candidate:`, evt.candidate.candidate);
    }
    handlers.onIceCandidate?.(evt.candidate?.toJSON() || null);
  };

  pc.onicegatheringstatechange = () => {
    handlers.onIceGatheringStateChange?.(pc.iceGatheringState);
  };

  pc.oniceconnectionstatechange = () => {
    if (debug) {
      console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
    }
    handlers.onIceConnectionStateChange?.(pc.iceConnectionState);
  };

  // Note: Data channel handling is done specifically in each hook
  // to avoid conflicts between host and client implementations
}

export function createDataChannel(
  pc: RTCPeerConnection,
  label: string,
  browserInfo: ReturnType<typeof detectBrowser>,
  debug = false
): RTCDataChannel {
  const dcConfig: RTCDataChannelInit = {
    ordered: true,
    // Use fully reliable channels for file transfers
    // Remove maxRetransmits and maxPacketLifeTime to ensure unlimited retransmits
    ...(browserInfo.isChrome
      ? {
          protocol: "sctp",
        }
      : browserInfo.isSafari
      ? {
          // Safari-specific configuration - fully reliable
          ordered: true,
        }
      : {
          // Default to fully reliable for other browsers
          ordered: true,
        }),
  };

  const dc = pc.createDataChannel(label, dcConfig);

  if (debug) {
    console.log(
      `[WebRTC Utils] Created data channel: ${label} with config:`,
      dcConfig
    );
  }

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

  // TODO: Add TURN servers for production use when needed
  // TURN servers are required for connections in restrictive networks (corporate firewalls, etc.)
  // Consider using commercial TURN services like Twilio, Xirsys, or self-hosted CoTURN
  if (!isLocalhost()) {
    // Example: baseServers.push({ urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' });
  }

  return baseServers;
}

// TODO: Add TURN server validation function when TURN servers are needed
// This function would test TURN server connectivity and relay candidate generation
// For now, we're using STUN-only configuration for simplicity

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

  return {
    onConnectionStateChange: (state: RTCPeerConnectionState) => {
      watchdog.handleConnectionStateChange(state);
      onConnectionStateChange?.(state);

      if (state === "connected") {
        if (debug) logger.log(`${prefix} Connection established!`);
      } else if (state === "failed") {
        if (debug) logger.error(`${prefix} Connection failed`);
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

        // Call the callback with connection type information
        onIceCandidate?.(candidate, connectionType);

        if (debug) {
          // Only log the connection type, not the full candidate details
          if (isRelay) {
            logger.log(
              `${prefix} ✅ TURN relay candidate - works in restrictive networks`
            );
          } else if (isSrflx) {
            logger.log(
              `${prefix} 📡 STUN reflexive candidate - direct connection through NAT`
            );
          } else if (isPrflx) {
            logger.log(
              `${prefix} 🔍 Peer reflexive candidate - discovered during connectivity checks`
            );
          } else if (isHost) {
            logger.log(
              `${prefix} 🏠 Host candidate - local network connection`
            );
          }
        }
        sendSignal({ kind: "webrtc-ice", candidate }, clientId);
      } else {
        // Call callback with null candidate to indicate end of candidates
        onIceCandidate?.(null, "End of candidates");

        if (debug) {
          logger.log(`${prefix} ICE gathering completed`);
        }
        sendSignal({ kind: "webrtc-ice", candidate: null as any }, clientId);
      }
    },

    onIceGatheringStateChange: (state: RTCIceGatheringState) => {
      if (debug) console.log(`${prefix} ICE gathering state: ${state}`);
    },

    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      if (debug) console.log(`${prefix} ICE connection state: ${state}`);

      if (state === "failed") {
        if (debug) {
          console.warn(`${prefix} ICE connection failed`);
          logIceConnectionDiagnostics(pc, prefix, debug);
        }
        // For Chrome and Safari, attempt ICE restart on failure
        if (
          (browserInfo.isChrome || browserInfo.isSafari) &&
          pc.remoteDescription
        ) {
          if (debug)
            console.log(
              `${prefix} ${browserInfo.name} ICE failed - attempting immediate restart`
            );
          try {
            pc.restartIce();
            if (debug)
              console.log(`${prefix} ICE restart initiated successfully`);
          } catch (error) {
            if (debug) console.error(`${prefix} ICE restart failed:`, error);
          }
        }
      } else if (state === "disconnected") {
        if (debug) {
          console.warn(
            `${prefix} ICE connection disconnected, waiting for reconnection...`
          );
          logIceConnectionDiagnostics(pc, prefix, debug);
        }
        // For Chrome and Safari, attempt ICE restart after a short delay on disconnect
        if (
          (browserInfo.isChrome || browserInfo.isSafari) &&
          pc.remoteDescription
        ) {
          const delay = browserInfo.isSafari ? 3000 : 2000; // Safari needs a bit more time
          setTimeout(() => {
            if (pc.iceConnectionState === "disconnected") {
              if (debug)
                console.log(
                  `${prefix} ${browserInfo.name} ICE still disconnected after ${delay}ms, attempting restart`
                );
              try {
                pc.restartIce();
                if (debug)
                  console.log(`${prefix} ICE restart initiated successfully`);
              } catch (error) {
                if (debug)
                  console.error(`${prefix} ICE restart failed:`, error);
              }
            } else {
              if (debug)
                console.log(
                  `${prefix} ICE connection recovered, no restart needed`
                );
            }
          }, delay);
        }
      } else if (state === "connected") {
        if (debug) {
          console.log(`${prefix} ICE connection established!`);
          logIceConnectionDiagnostics(pc, prefix, debug);

          // Get actual connection stats when connected
          getConnectionStats(pc, debug)
            .then((stats) => {
              console.log(`${prefix} Actual connection method:`, {
                type: stats.connectionType,
                local: stats.localCandidate,
                remote: stats.remoteCandidate,
                rtt: stats.rtt,
                bytesReceived: stats.bytesReceived,
                bytesSent: stats.bytesSent,
              });

              // Call callback with actual connection type
              onIceCandidate?.(null, `✅ ${stats.connectionType}`);
            })
            .catch((error) => {
              if (debug)
                console.warn(
                  `${prefix} Failed to get connection stats:`,
                  error
                );
            });
        }
      }

      // Call the user-provided callback
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

  // Set binary type to ArrayBuffer for consistent binary data handling
  dc.binaryType = "arraybuffer";

  dc.onopen = () => {
    if (debug)
      console.log(
        `${prefix} Data channel opened (binaryType: ${dc.binaryType})`
      );

    // Detect and report maxMessageSize when channel is ready
    const maxMessageSize = getDataChannelMaxMessageSize(dc);
    if (debug) {
      console.log(
        `${prefix} Data channel maxMessageSize: ${maxMessageSize} bytes`
      );
    }
    onDataChannelReady?.(maxMessageSize);

    onOpen?.(dc.readyState);
  };

  dc.onclose = () => {
    if (debug) console.log(`${prefix} Data channel closed`);
    onClose?.(dc.readyState);
  };

  dc.onmessage = (e) => {
    onMessage?.(e.data);
  };
}

export class ICECandidateManager {
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private browserInfo: ReturnType<typeof detectBrowser>;
  private debug: boolean;
  private role: "client" | "host";
  private prefix: string;

  constructor(
    browserInfo: ReturnType<typeof detectBrowser>,
    debug = false,
    role: "client" | "host" = "client",
    clientId?: string
  ) {
    this.browserInfo = browserInfo;
    this.debug = debug;
    this.role = role;
    this.prefix =
      role === "host"
        ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ""}`
        : "[WebRTC Client]";
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
    if (this.debug)
      console.log(`${this.prefix} Storing ICE candidate as pending for ${key}`);
  }

  async addPendingCandidates(
    pc: RTCPeerConnection,
    clientId?: string
  ): Promise<void> {
    const key = clientId || "default";
    const candidates = this.pendingCandidates.get(key) || [];

    for (const candidate of candidates) {
      try {
        if (this.debug)
          console.log(
            `${this.prefix} Adding pending ICE candidate for ${key}:`,
            candidate.candidate
          );
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        if (this.debug)
          console.log(
            `${this.prefix} Successfully added pending ICE candidate`
          );
      } catch (error) {
        if (this.debug)
          console.warn(
            `${this.prefix} Failed to add pending ICE candidate:`,
            error
          );
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
      if (this.debug)
        console.log(
          `${this.prefix} Received end-of-candidates${
            clientId ? ` from ${clientId}` : ""
          }`
        );
      return;
    }

    try {
      if (this.debug)
        console.log(
          `${this.prefix} Adding ICE candidate${
            clientId ? ` from ${clientId}` : ""
          }:`,
          candidate.candidate
        );
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      if (pc.remoteDescription === null) {
        this.storePendingCandidate(candidate, clientId);
      } else if (
        this.browserInfo.isChrome &&
        (error as Error).name === "OperationError"
      ) {
        if (this.debug)
          console.log(
            `${this.prefix} Chrome ICE candidate error (likely duplicate), ignoring`
          );
      } else {
        if (this.debug)
          console.warn(
            `${this.prefix} ICE candidate addition failed but remote description is set - this might be normal`
          );
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

export function logIceConnectionDiagnostics(
  pc: RTCPeerConnection,
  prefix: string,
  debug = false
): void {
  if (!debug) return;

  console.log(`${prefix} ICE Connection Diagnostics:`, {
    iceConnectionState: pc.iceConnectionState,
    iceGatheringState: pc.iceGatheringState,
    connectionState: pc.connectionState,
    signalingState: pc.signalingState,
    hasLocalDescription: !!pc.localDescription,
    hasRemoteDescription: !!pc.remoteDescription,
    localDescriptionType: pc.localDescription?.type,
    remoteDescriptionType: pc.remoteDescription?.type,
  });

  // Check ICE candidate types
  if (pc.localDescription) {
    const sdp = pc.localDescription.sdp;
    const relayCandidates = sdp.match(/candidate:.*typ relay/g) || [];
    const hostCandidates = sdp.match(/candidate:.*typ host/g) || [];
    const srflxCandidates = sdp.match(/candidate:.*typ srflx/g) || [];

    console.log(`${prefix} ICE Candidate Summary:`, {
      relay: relayCandidates.length,
      host: hostCandidates.length,
      srflx: srflxCandidates.length,
      total:
        relayCandidates.length + hostCandidates.length + srflxCandidates.length,
    });

    if (relayCandidates.length === 0) {
      console.log(
        `${prefix} ℹ️ Connected without TURN relay - using direct/STUN connection (faster)`
      );
    } else {
      console.log(
        `${prefix} ✅ Using ${relayCandidates.length} TURN relay candidate(s) - works in restrictive networks`
      );
    }
  }
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
  if (dataChannel.bufferedAmount === 0) {
    if (debug) console.log("[WebRTC Utils] Buffer already drained");
    return;
  }

  if (debug)
    console.log(
      `[WebRTC Utils] Waiting for buffer to drain (${dataChannel.bufferedAmount} bytes remaining)`
    );

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (debug)
        console.warn(
          `[WebRTC Utils] Buffer drain timeout after ${timeoutMs}ms, ${dataChannel.bufferedAmount} bytes still pending`
        );
      reject(
        new Error(
          `Buffer drain timeout: ${dataChannel.bufferedAmount} bytes still pending`
        )
      );
    }, timeoutMs);

    const checkBuffer = () => {
      if (dataChannel.bufferedAmount === 0) {
        clearTimeout(timeout);
        if (debug) console.log("[WebRTC Utils] Buffer fully drained");
        resolve();
      } else {
        if (debug)
          console.log(
            `[WebRTC Utils] Buffer drain progress: ${dataChannel.bufferedAmount} bytes remaining`
          );
        setTimeout(checkBuffer, 100);
      }
    };

    checkBuffer();
  });
}

export interface ConnectionStats {
  connectionType: "DIRECT" | "TURN" | "LOCAL" | "UNKNOWN";
  localCandidate: string;
  remoteCandidate: string;
  candidatePair: any;
  rtt?: number;
  bytesReceived?: number;
  bytesSent?: number;
  packetsReceived?: number;
  packetsSent?: number;
  packetsLost?: number;
  jitter?: number;
}

function isLocalAddress(address: string): boolean {
  if (!address) return false;

  // mDNS .local addresses (Firefox/WebRTC privacy)
  if (address.endsWith(".local")) return true;

  // IPv4 private ranges
  if (address.startsWith("192.168.")) return true;
  if (address.startsWith("10.")) return true;
  if (address.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true;

  // Localhost
  if (address.startsWith("127.")) return true;
  if (address === "::1" || address === "localhost") return true;

  // Link-local
  if (address.startsWith("169.254.")) return true;
  if (address.startsWith("fe80:")) return true;

  return false;
}

interface CandidatePairs {
  nominated: any;
  selected: any;
  active: any;
  maxBytes: number;
}

function findCandidatePairs(stats: RTCStatsReport): CandidatePairs {
  const pairs: any[] = [];

  stats.forEach((stat: any) => {
    if (stat.type === "candidate-pair" && stat.state === "succeeded") {
      const totalBytes = (stat.bytesReceived || 0) + (stat.bytesSent || 0);
      pairs.push({
        pair: stat,
        bytes: totalBytes,
        nominated: stat.nominated || false,
        selected: stat.selected || false,
      });
    }
  });

  // Sort by priority: bytes first (most traffic), then nominated, then selected
  pairs.sort((a, b) => {
    // Pairs with traffic always win
    if (a.bytes > 0 && b.bytes === 0) return -1;
    if (b.bytes > 0 && a.bytes === 0) return 1;
    
    // Both have traffic: prefer most bytes
    if (a.bytes !== b.bytes) return b.bytes - a.bytes;
    
    // Same bytes: prefer nominated
    if (a.nominated !== b.nominated) return a.nominated ? -1 : 1;
    
    // Fall back to selected
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    
    return 0;
  });

  const best = pairs[0];
  const nominated = pairs.find(p => p.nominated);
  const selected = pairs.find(p => p.selected);

  return {
    nominated: nominated?.pair || null,
    selected: selected?.pair || null,
    active: best?.pair || null,
    maxBytes: best?.bytes || 0,
  };
}

/**
 * Gets the actual connection statistics using RTCPeerConnection.getStats()
 * This provides the selected candidate pair and real connection metrics
 */
export async function getConnectionStats(
  pc: RTCPeerConnection,
  debug = false
): Promise<ConnectionStats> {
  try {
    // Guard: Don't check stats until connection is stable
    const isConnectionReady =
      pc.connectionState === "connected" ||
      pc.iceConnectionState === "connected" ||
      pc.iceConnectionState === "completed";

    if (!isConnectionReady) {
      if (debug) {
        console.log("[WebRTC Stats] Connection not ready:", pc.connectionState, pc.iceConnectionState);
      }
      return {
        connectionType: "UNKNOWN",
        localCandidate: "Connecting...",
        remoteCandidate: "Connecting...",
        candidatePair: null,
      };
    }

    // Find candidate pairs with retry logic if no traffic yet
    let stats = await pc.getStats();
    let pairs = findCandidatePairs(stats);

    // If no definitive pair found, wait briefly for traffic to flow
    if (!pairs.nominated && !pairs.selected && pairs.maxBytes === 0) {
      if (debug) console.log("[WebRTC Stats] No traffic yet, waiting 200ms...");
      await new Promise(resolve => setTimeout(resolve, 200));
      stats = await pc.getStats();
      pairs = findCandidatePairs(stats);
      if (debug) {
        console.log(`[WebRTC Stats] After wait: bytes=${pairs.maxBytes}, nominated=${!!pairs.nominated}, selected=${!!pairs.selected}`);
      }
    }

    // Select best pair: ALWAYS use the one with most traffic
    // Nomination can differ between peers due to timing, traffic is the ground truth
    const selectedCandidatePair = pairs.active;

    if (debug && selectedCandidatePair) {
      const isNominated = pairs.nominated === pairs.active;
      const method = `bytes (${pairs.maxBytes})${isNominated ? ' [nominated]' : ''}`;
      console.log(`[WebRTC Stats] Selected pair by: ${method}`);
    }

    // Get candidates from the selected pair
    const localCandidate = selectedCandidatePair ? stats.get(selectedCandidatePair.localCandidateId) : null;
    const remoteCandidate = selectedCandidatePair ? stats.get(selectedCandidatePair.remoteCandidateId) : null;

    if (!selectedCandidatePair || !localCandidate || !remoteCandidate) {
      return {
        connectionType: "UNKNOWN",
        localCandidate: "Negotiating...",
        remoteCandidate: "Negotiating...",
        candidatePair: null,
      };
    }

    // Determine connection type
    const localType = localCandidate.candidateType;
    const remoteType = remoteCandidate.candidateType;
    const localIP = localCandidate.address || localCandidate.ip;
    const remoteIP = remoteCandidate.address || remoteCandidate.ip;

    let connectionType: "DIRECT" | "TURN" | "LOCAL" | "UNKNOWN" = "UNKNOWN";

    if (localType === "relay" || remoteType === "relay") {
      connectionType = "TURN";
    } else if (isLocalAddress(localIP) && isLocalAddress(remoteIP)) {
      connectionType = "LOCAL";
    } else if (localType === "srflx" || remoteType === "srflx" || localType === "prflx" || remoteType === "prflx") {
      connectionType = "DIRECT";
    } else if (localType === "host" && remoteType === "host") {
      connectionType = "DIRECT";
    }

    // Get jitter from RTP stats
    let jitter: number | undefined;
    stats.forEach((stat: any) => {
      if (stat.type === "inbound-rtp" && stat.jitter !== undefined) {
        jitter = stat.jitter;
      }
    });

    if (debug) {
      console.log(`[WebRTC Stats] ${connectionType}: ${localType} ↔ ${remoteType}`);
    }

    return {
      connectionType,
      localCandidate: `${localType}:${localIP}:${localCandidate.port}`,
      remoteCandidate: `${remoteType}:${remoteIP}:${remoteCandidate.port}`,
      candidatePair: selectedCandidatePair,
      rtt: selectedCandidatePair.currentRoundTripTime,
      bytesReceived: selectedCandidatePair.bytesReceived,
      bytesSent: selectedCandidatePair.bytesSent,
      packetsReceived: selectedCandidatePair.packetsReceived,
      packetsSent: selectedCandidatePair.packetsSent,
      packetsLost: selectedCandidatePair.packetsLost,
      jitter,
    };
  } catch (error) {
    console.error("Failed to get connection stats:", error);
    return {
      connectionType: "UNKNOWN",
      localCandidate: "Error",
      remoteCandidate: "Error",
      candidatePair: null,
    };
  }
}

/**
 * Gets detailed ICE candidate statistics for debugging
 */
export async function getIceCandidateStats(pc: RTCPeerConnection): Promise<{
  localCandidates: any[];
  remoteCandidates: any[];
  candidatePairs: any[];
}> {
  try {
    const stats = await pc.getStats();
    const localCandidates: any[] = [];
    const remoteCandidates: any[] = [];
    const candidatePairs: any[] = [];

    stats.forEach((stat: any, id: string) => {
      if (stat.type === "local-candidate") {
        localCandidates.push(stat);
      } else if (stat.type === "remote-candidate") {
        remoteCandidates.push(stat);
      } else if (stat.type === "candidate-pair") {
        candidatePairs.push(stat);
      }
    });

    return { localCandidates, remoteCandidates, candidatePairs };
  } catch (error) {
    console.error("Failed to get ICE candidate stats:", error);
    return { localCandidates: [], remoteCandidates: [], candidatePairs: [] };
  }
}
