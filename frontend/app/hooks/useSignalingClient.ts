import { useCallback, useEffect, useRef, useState } from 'react';

// Types based on the API spec
export interface SignalingMessage {
  type: string;
  hostId?: string;
  clientId?: string;
  payload?: string;
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
}

// Base WebSocket connection manager
function useWebSocketConnection(config: SignalingClientConfig) {
  const {
    url = 'ws://localhost:5052/ws',
    onMessage,
    onError,
    onOpen,
    onClose
  } = config;

  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        onOpen?.();
        resolve();
      };

      ws.onclose = () => {
        setIsConnected(false);
        onClose?.();
      };

      ws.onerror = (error) => {
        onError?.(new Error('WebSocket error'));
        reject(new Error('WebSocket connection failed'));
      };

      ws.onmessage = (event) => {
        try {
          const message: SignalingMessage = JSON.parse(event.data);
          onMessage?.(message);
        } catch (error) {
          onError?.(new Error('Failed to parse message'));
        }
      };
    });
  }, [url, onMessage, onError, onOpen, onClose]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not connected');
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendMessage,
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
}

export function useSignalHost(config: SignalingClientConfig = {}): SignalHost {
  const { connect, disconnect, sendMessage, isConnected, wsRef } = useWebSocketConnection(config);
  const [hostId, setHostId] = useState<string>();

  const registerHost = useCallback(async (): Promise<string> => {
    await connect();
    
    return new Promise((resolve, reject) => {
      const message: SignalingMessage = { type: 'Host' };
      
      const handleMessage = (event: MessageEvent) => {
        try {
          const response: SignalingResponse = JSON.parse(event.data);
          if (response.type === 'host' && 'hostId' in response) {
            wsRef.current?.removeEventListener('message', handleMessage);
            setHostId(response.hostId);
            resolve(response.hostId);
          } else if (response.type === 'error') {
            wsRef.current?.removeEventListener('message', handleMessage);
            reject(new Error(response.message));
          }
        } catch (error) {
          wsRef.current?.removeEventListener('message', handleMessage);
          reject(new Error('Invalid response format'));
        }
      };
      
      wsRef.current?.addEventListener('message', handleMessage);
      sendMessage(message);
    });
  }, [connect, sendMessage, wsRef]);

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
    sendMessageToClient
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
  const { connect, disconnect, sendMessage, isConnected, wsRef } = useWebSocketConnection(config);
  const [clientId, setClientId] = useState<string>();

  const joinHost = useCallback(async (hostId: string): Promise<string> => {
    await connect();
    
    return new Promise((resolve, reject) => {
      const message: JoinHostRequest = { type: 'join-host', hostId };
      
      const handleMessage = (event: MessageEvent) => {
        try {
          const response: SignalingResponse = JSON.parse(event.data);
          if (response.type === 'join-host' && 'clientId' in response) {
            wsRef.current?.removeEventListener('message', handleMessage);
            setClientId(response.clientId);
            resolve(response.clientId);
          } else if (response.type === 'error') {
            wsRef.current?.removeEventListener('message', handleMessage);
            reject(new Error(response.message));
          }
        } catch (error) {
          wsRef.current?.removeEventListener('message', handleMessage);
          reject(new Error('Invalid response format'));
        }
      };
      
      wsRef.current?.addEventListener('message', handleMessage);
      sendMessage(message);
    });
  }, [connect, sendMessage, wsRef]);

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
