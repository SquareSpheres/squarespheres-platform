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

export type SignalingResponse = 
  | HostResponse 
  | JoinHostResponse 
  | ErrorMessage 
  | ClientJoinedNotification 
  | ClientDisconnectedNotification 
  | HostDisconnectedNotification;

export interface SignalingClientConfig {
  url?: string;
  onMessage?: (message: SignalingMessage) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}

export class SignalError extends Error {
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

export function normalizeMessageType(message: SignalingMessage): SignalingMessage {
  return { ...message, type: String(message.type || '').toLowerCase() };
}

export function isErrorMessage(message: SignalingMessage): message is ErrorMessage {
  return message.type === 'error';
}

