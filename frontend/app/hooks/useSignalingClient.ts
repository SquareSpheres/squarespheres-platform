import { useCallback, useEffect, useRef, useState } from 'react';
import { getWebSocketTimeout, detectBrowser } from '../utils/browserUtils';

export interface SignalingMessage {
  type: string;
  hostId?: string;
  clientId?: string;
  payload?: string;
  requestId?: string;
}

export interface HostRequest {
  type: 'host';
  maxClients?: number;
}

export interface HostResponse {
  type: 'host';
  hostId: string;
}

export interface JoinHostRequest {
  type: 'join-host';
  hostId: string;
}

export interface JoinHostResponse {
  type: 'join-host';
  hostId: string;
  clientId: string;
}

export interface MessageToHostRequest {
  type: 'msg-to-host';
  payload: string;
}

export interface MessageToClientRequest {
  type: 'msg-to-client';
  clientId: string;
  payload: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export interface ClientJoinedNotification {
  type: 'client-joined';
  hostId: string;
  clientId: string;
}

export interface ClientDisconnectedNotification {
  type: 'client-disconnected';
  hostId: string;
  clientId: string;
}

export interface HostDisconnectedNotification {
  type: 'host-disconnected';
  hostId: string;
}

export type SignalingResponse = HostResponse | JoinHostResponse | ErrorMessage | ClientJoinedNotification | ClientDisconnectedNotification | HostDisconnectedNotification;

export interface SignalingClientConfig {
  url?: string;
  onMessage?: (message: SignalingMessage) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}

class SignalError extends Error {
  code?: string;
  details?: unknown;
  action?: string;
  constructor(message: string, opts?: { code?: string; details?: unknown; action?: string }) {
    super(message);
    this.name = 'SignalError';
    this.code = opts?.code;
    this.details = opts?.details;
    this.action = opts?.action;
  }
}

function useWebSocketConnection(config: SignalingClientConfig) {
  const {
    url = process.env.NEXT_PUBLIC_SIGNAL_SERVER || 'ws://localhost:5052/ws',
    onMessage,
    onError,
    onOpen,
    onClose
  } = config;


  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const pendingWaitersRef = useRef<Set<{
    match: (message: SignalingMessage) => boolean;
    resolve: (message: SignalingMessage) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>>(new Set());

  const clearAllWaiters = useCallback((reason: Error) => {
    const waiters = pendingWaitersRef.current;
    Array.from(waiters).forEach((waiter) => {
      clearTimeout(waiter.timeoutId);
      try { waiter.reject(reason); } catch (error) {
        console.warn('Error rejecting waiter:', error);
      }
      waiters.delete(waiter);
    });
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      let wsUrl: string;
      try {
        wsUrl = new URL(url).toString();
        const browser = detectBrowser();
        console.log(`[SignalingClient] Connecting to WebSocket URL: ${wsUrl}`, {
          browser: browser.name,
          isSafari: browser.isSafari,
          isIOS: browser.isIOS,
          retryAttempt: retryCountRef.current
        });
      } catch {
        reject(new SignalError('Invalid signaling URL', { code: 'URL_INVALID', details: { url } }));
        return;
      }

      // Safari iOS workaround: Add small delay before connection
      const browser = detectBrowser();
      const connectionDelay = browser.isSafari && browser.isIOS ? 100 : 0;
      
      setTimeout(() => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(`[SignalingClient] Successfully connected to: ${wsUrl}`);
          setIsConnected(true);
          retryCountRef.current = 0; // Reset retry count on successful connection
          onOpen?.();
          resolve();
        };

      // Browser-specific connection timeout
      const connectionTimeout = getWebSocketTimeout();
      
      const timeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.error(`[SignalingClient] Connection timeout after ${connectionTimeout}ms`);
          ws.close();
          reject(new SignalError('WebSocket connection timeout', { code: 'WS_TIMEOUT' }));
        }
      }, connectionTimeout);

      // Clear timeout on successful connection
      ws.addEventListener('open', () => {
        clearTimeout(timeoutId);
      });


      ws.onclose = (event) => {
        console.log(`[SignalingClient] Connection closed to: ${wsUrl}`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        
        setIsConnected(false);
        clearAllWaiters(new SignalError('WebSocket closed', { code: 'WS_CLOSED' }));
        onClose?.();
      };

        ws.onerror = (error) => {
          const browser = detectBrowser();
          console.error(`[SignalingClient] Connection error to: ${wsUrl}`, {
            error,
            browser: browser.name,
            isSafari: browser.isSafari,
            isIOS: browser.isIOS,
            retryAttempt: retryCountRef.current,
            maxRetries
          });
          
          // Safari iOS retry logic
          if (browser.isSafari && browser.isIOS && retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            console.log(`[SignalingClient] Safari iOS retry attempt ${retryCountRef.current}/${maxRetries}`);
            
            // Close current connection and retry after delay
            ws.close();
            setTimeout(() => {
              connect().then(resolve).catch(reject);
            }, 1000 * retryCountRef.current); // Exponential backoff
            return;
          }
          
          const err = new SignalError('WebSocket error', { code: 'WS_ERROR', details: error });
          onError?.(err);
          reject(new SignalError('WebSocket connection failed', { code: 'WS_CONNECT_FAILED', details: error }));
        };

        ws.onmessage = (event) => {
          try {
            const raw: SignalingMessage = JSON.parse(event.data);
            const message: SignalingMessage = { ...raw, type: String(raw.type || '').toLowerCase() };

            Array.from(pendingWaitersRef.current).some((waiter) => {
              if (!waiter.match(message)) return false;
              pendingWaitersRef.current.delete(waiter);
              clearTimeout(waiter.timeoutId);
              waiter.resolve(message);
              return true;
            });

            onMessage?.(message);
          } catch (error) {
            onError?.(new SignalError('Failed to parse message', { code: 'PARSE_ERROR', details: { data: event.data } }));
          }
        };
      }, connectionDelay);
    });
  }, [url, onMessage, onError, onOpen, onClose, clearAllWaiters]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const normalized = { ...message, type: String(message.type || '').toLowerCase() };
      wsRef.current.send(JSON.stringify(normalized));
    } else {
      throw new SignalError('WebSocket not connected', { code: 'WS_NOT_OPEN', details: { message } });
    }
  }, []);

  const request = useCallback(async <T extends SignalingMessage>(
    send: () => void,
    match: (message: SignalingMessage) => message is T,
    opts?: { timeoutMs?: number }
  ): Promise<T> => {
    await connect();
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = opts?.timeoutMs ?? 10000;
      const waiter = {
        match,
        resolve: resolve as (m: SignalingMessage) => void,
        reject,
        timeoutId: setTimeout(() => {
          pendingWaitersRef.current.delete(waiter);
          reject(new SignalError('Request timed out', { code: 'TIMEOUT' }));
        }, timeoutMs)
      };
      pendingWaitersRef.current.add(waiter);
      try {
        send();
      } catch (err) {
        pendingWaitersRef.current.delete(waiter);
        clearTimeout(waiter.timeoutId);
        reject(err instanceof Error ? err : new SignalError('Send failed', { code: 'SEND_FAILED', details: err }));
      }
    });
  }, [connect]);

  const generateRequestId = useCallback((): string => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return (crypto as any).randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  // Safari iOS connection test utility
  const testWebSocketConnection = useCallback(async (testUrl: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const browser = detectBrowser();
      if (!browser.isSafari || !browser.isIOS) {
        resolve(true);
        return;
      }

      console.log(`[SignalingClient] Testing Safari iOS WebSocket connection to: ${testUrl}`);
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
  }, []);

  const sendRequest = useCallback(async <T extends SignalingMessage>(
    message: SignalingMessage,
    opts?: { timeoutMs?: number }
  ): Promise<T> => {
    const requestId = generateRequestId();
    const withId = { ...message, requestId };
    const res = await request<SignalingMessage>(
      () => sendMessage(withId),
      (m): m is SignalingMessage => (m as any).requestId === requestId,
      opts
    );
    if ((res as any).type === 'error') {
      const serverMsg = (res as any).payload ?? (res as any).message ?? 'Server error';
      throw new SignalError(serverMsg, { code: 'SERVER_ERROR', details: res });
    }
    return res as T;
  }, [generateRequestId, request, sendMessage]);

  useEffect(() => {
    return () => {
      clearAllWaiters(new SignalError('Unmounted', { code: 'UNMOUNT' }));
      disconnect();
    };
  }, [disconnect, clearAllWaiters]);

  return {
    connect,
    disconnect,
    sendMessage,
    sendRequest,
    request,
    isConnected,
    wsRef,
    testWebSocketConnection
  };
}

export interface SignalHost {
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
  hostId?: string;
  registerHost: (maxClients?: number) => Promise<string>;
  sendMessageToClient: (clientId: string, payload: string) => void;
  connectedClient?: string;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}

export function useSignalHost(config: SignalingClientConfig = {}): SignalHost {
  const [hostId, setHostId] = useState<string>();
  const [connectedClient, setConnectedClient] = useState<string>();

  const handleMessage = useCallback((message: SignalingMessage) => {
    if (message.type === 'client-joined' && message.clientId) {
      // Only allow one client at a time
      if (!connectedClient) {
        setConnectedClient(message.clientId);
        config.onClientJoined?.(message.clientId);
      } else {
        // Log that we're ignoring additional clients
        console.warn(`[SignalHost] Ignoring additional client ${message.clientId} - already connected to ${connectedClient}`);
      }
    } else if (message.type === 'client-disconnected' && message.clientId) {
      console.log(`[SignalHost] Received client-disconnected for ${message.clientId}, current connectedClient: ${connectedClient}`);
      // Always clear and notify, even if already cleared by WebRTC layer
      // The server notification is authoritative
      setConnectedClient(undefined);
      config.onClientDisconnected?.(message.clientId);
      console.log(`[SignalHost] Called onClientDisconnected for ${message.clientId}`);
    }
    config.onMessage?.(message);
  }, [config, connectedClient]);

  const enhancedConfig = { ...config, onMessage: handleMessage };
  const { connect, disconnect: baseDisconnect, sendMessage, request, sendRequest, isConnected } = useWebSocketConnection(enhancedConfig);

  const disconnect = useCallback(() => {
    baseDisconnect();
    setHostId(undefined);
    setConnectedClient(undefined);
  }, [baseDisconnect]);

  const registerHost = useCallback(async (maxClients: number = 1): Promise<string> => {
    const msg: HostRequest = { type: 'host', maxClients };
    const res = await sendRequest<HostResponse>(msg);
    setHostId(res.hostId);
    return res.hostId;
  }, [sendRequest]);

  const sendMessageToClient = useCallback((clientId: string, payload: string) => {
    const message: MessageToClientRequest = { type: 'msg-to-client', clientId, payload };
    sendMessage(message);
  }, [sendMessage]);

  return {
    connect,
    disconnect,
    isConnected,
    hostId,
    registerHost,
    sendMessageToClient,
    connectedClient,
    onClientJoined: config.onClientJoined,
    onClientDisconnected: config.onClientDisconnected
  };
}

export interface SignalClient {
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
  clientId?: string;
  joinHost: (hostId: string) => Promise<string>;
  sendMessageToHost: (payload: string) => void;
}

export function useSignalClient(config: SignalingClientConfig = {}): SignalClient {
  const { connect, disconnect: baseDisconnect, sendMessage, request, sendRequest, isConnected } = useWebSocketConnection(config);
  const [clientId, setClientId] = useState<string>();

  const disconnect = useCallback(() => {
    baseDisconnect();
    setClientId(undefined);
  }, [baseDisconnect]);

  const joinHost = useCallback(async (hostId: string): Promise<string> => {
    const message: JoinHostRequest = { type: 'join-host', hostId };
    const res = await sendRequest<JoinHostResponse>(message);
    setClientId(res.clientId);
    return res.clientId;
  }, [sendRequest]);

  const sendMessageToHost = useCallback((payload: string) => {
    const message: MessageToHostRequest = { type: 'msg-to-host', payload };
    sendMessage(message);
  }, [sendMessage]);

  return {
    connect,
    disconnect,
    isConnected,
    clientId,
    joinHost,
    sendMessageToHost
  };
}
