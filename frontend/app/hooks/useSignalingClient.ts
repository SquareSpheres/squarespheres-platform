import { useCallback, useEffect, useRef, useState } from 'react';
import { detectBrowser } from '../utils/browserUtils';
import {
  SignalingMessage,
  SignalingClientConfig,
  SignalError,
  normalizeMessageType,
  HostRequest,
  HostResponse,
  JoinHostRequest,
  JoinHostResponse,
  MessageToHostRequest,
  MessageToClientRequest,
} from '../types/signalingTypes';
import {
  getConnectionDelay,
  getConnectionTimeout,
  getMaxRetries,
  getRetryDelay,
  shouldRetryOnError,
} from '../utils/signalingConfig';
import { createSignalingLogger, testWebSocketConnection } from '../utils/signalingDebug';
import { SignalingRequestManager, generateRequestId } from '../utils/signalingRequestManager';

// Re-export types for backward compatibility
export type {
  SignalingMessage,
  HostRequest,
  HostResponse,
  JoinHostRequest,
  JoinHostResponse,
  MessageToHostRequest,
  MessageToClientRequest,
  SignalingClientConfig,
} from '../types/signalingTypes';

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
  const requestManager = useRef(new SignalingRequestManager());

  const clearAllWaiters = useCallback((reason: Error) => {
    requestManager.current.clearAllWaiters(reason);
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const browser = detectBrowser();
      const logger = createSignalingLogger(true);
      const maxRetriesForBrowser = getMaxRetries(browser);

      let wsUrl: string;
      try {
        wsUrl = new URL(url).toString();
        logger.logConnection(wsUrl, browser, retryCountRef.current);
      } catch {
        reject(new SignalError('Invalid signaling URL', { code: 'URL_INVALID', details: { url } }));
        return;
      }

      const connectionDelay = getConnectionDelay(browser);
      
      setTimeout(() => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const connectionTimeout = getConnectionTimeout(browser);
      
        const timeoutId = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            logger.logTimeout(wsUrl, connectionTimeout);
            ws.close();
            reject(new SignalError('WebSocket connection timeout', { code: 'WS_TIMEOUT' }));
          }
        }, connectionTimeout);

        ws.onopen = () => {
          clearTimeout(timeoutId);
          logger.logConnected(wsUrl);
          setIsConnected(true);
          retryCountRef.current = 0;
          onOpen?.();
          resolve();
        };

        ws.onclose = (event) => {
          clearTimeout(timeoutId);
          logger.logClosed(wsUrl, event.code, event.reason, event.wasClean);
          setIsConnected(false);
          clearAllWaiters(new SignalError('WebSocket closed', { code: 'WS_CLOSED' }));
          onClose?.();
        };

        ws.onerror = (error) => {
          clearTimeout(timeoutId);
          logger.logError(wsUrl, browser, retryCountRef.current, maxRetriesForBrowser, error);
          
          // Browser-specific retry logic
          if (shouldRetryOnError(browser) && retryCountRef.current < maxRetriesForBrowser) {
            retryCountRef.current++;
            logger.logRetry(retryCountRef.current, maxRetriesForBrowser);
            
            ws.close();
            const retryDelay = getRetryDelay(browser, retryCountRef.current);
            setTimeout(() => {
              connect().then(resolve).catch(reject);
            }, retryDelay);
            return;
          }
          
          const err = new SignalError('WebSocket error', { code: 'WS_ERROR', details: error });
          onError?.(err);
          reject(new SignalError('WebSocket connection failed', { code: 'WS_CONNECT_FAILED', details: error }));
        };

        ws.onmessage = (event) => {
          try {
            const raw: SignalingMessage = JSON.parse(event.data);
            const message = normalizeMessageType(raw);

            // Check if this message matches any pending request
            const wasHandled = requestManager.current.handleIncomingMessage(message);
            
            // If not handled by request manager, pass to general message handler
            if (!wasHandled && onMessage) {
              onMessage(message);
            }
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
      const normalized = normalizeMessageType(message);
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
    return requestManager.current.createRequest<T>(send, match, opts);
  }, [connect]);

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
  }, [request, sendMessage]);

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
    testWebSocketConnection: (testUrl: string) => testWebSocketConnection(testUrl, detectBrowser())
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
