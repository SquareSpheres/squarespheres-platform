import { useCallback, useEffect, useRef, useState } from 'react';

export interface SignalingMessage {
  type: string;
  hostId?: string;
  clientId?: string;
  payload?: string;
  requestId?: string;
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
        console.log(`[SignalingClient] Connecting to WebSocket URL: ${wsUrl}`);
      } catch {
        reject(new SignalError('Invalid signaling URL', { code: 'URL_INVALID', details: { url } }));
        return;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[SignalingClient] Successfully connected to: ${wsUrl}`);
        setIsConnected(true);
        onOpen?.();
        resolve();
      };

      ws.onclose = () => {
        console.log(`[SignalingClient] Connection closed to: ${wsUrl}`);
        setIsConnected(false);
        clearAllWaiters(new SignalError('WebSocket closed', { code: 'WS_CLOSED' }));
        onClose?.();
      };

      ws.onerror = (error) => {
        console.error(`[SignalingClient] Connection error to: ${wsUrl}`, error);
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
      const serverMsg = (res as any).message ?? 'Server error';
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
    wsRef
  };
}

// Host-specific hook
export interface SignalHost {
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
  hostId?: string;
  registerHost: () => Promise<string>;
  sendMessageToClient: (clientId: string, payload: string) => void;
  connectedClients: string[];
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}

export function useSignalHost(config: SignalingClientConfig = {}): SignalHost {
  const [hostId, setHostId] = useState<string>();
  const [connectedClients, setConnectedClients] = useState<string[]>([]);

  const handleMessage = useCallback((message: SignalingMessage) => {
    if (message.type === 'client-joined' && message.clientId) {
      setConnectedClients(prev => [...prev, message.clientId!]);
      config.onClientJoined?.(message.clientId);
    } else if (message.type === 'client-disconnected' && message.clientId) {
      setConnectedClients(prev => prev.filter(id => id !== message.clientId));
      config.onClientDisconnected?.(message.clientId);
    }
    config.onMessage?.(message);
  }, [config]);

  const enhancedConfig = { ...config, onMessage: handleMessage };
  const { connect, disconnect: baseDisconnect, sendMessage, request, sendRequest, isConnected } = useWebSocketConnection(enhancedConfig);

  const disconnect = useCallback(() => {
    baseDisconnect();
    setHostId(undefined);
    setConnectedClients([]);
  }, [baseDisconnect]);

  const registerHost = useCallback(async (): Promise<string> => {
    const msg: SignalingMessage = { type: 'host' };
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
    connectedClients,
    onClientJoined: config.onClientJoined,
    onClientDisconnected: config.onClientDisconnected
  };
}

// Client-specific hook
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
