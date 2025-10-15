import { SignalingMessage, SignalError } from '../types/signalingTypes';

export interface RequestWaiter {
  match: (message: SignalingMessage) => boolean;
  resolve: (message: SignalingMessage) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class SignalingRequestManager {
  private pendingWaiters = new Set<RequestWaiter>();
  private defaultTimeoutMs = 10000;

  clearAllWaiters(reason: Error): void {
    Array.from(this.pendingWaiters).forEach((waiter) => {
      clearTimeout(waiter.timeoutId);
      try {
        waiter.reject(reason);
      } catch (error) {
        console.warn('[SignalingRequestManager] Error rejecting waiter:', error);
      }
      this.pendingWaiters.delete(waiter);
    });
  }

  handleIncomingMessage(message: SignalingMessage): boolean {
    return Array.from(this.pendingWaiters).some((waiter) => {
      if (!waiter.match(message)) return false;
      this.pendingWaiters.delete(waiter);
      clearTimeout(waiter.timeoutId);
      waiter.resolve(message);
      return true;
    });
  }

  async createRequest<T extends SignalingMessage>(
    send: () => void,
    match: (message: SignalingMessage) => message is T,
    opts?: { timeoutMs?: number }
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
      const waiter: RequestWaiter = {
        match,
        resolve: resolve as (m: SignalingMessage) => void,
        reject,
        timeoutId: setTimeout(() => {
          this.pendingWaiters.delete(waiter);
          reject(new SignalError('Request timed out', { code: 'TIMEOUT' }));
        }, timeoutMs)
      };
      
      this.pendingWaiters.add(waiter);
      
      try {
        send();
      } catch (err) {
        this.pendingWaiters.delete(waiter);
        clearTimeout(waiter.timeoutId);
        reject(err instanceof Error ? err : new SignalError('Send failed', { code: 'SEND_FAILED', details: err }));
      }
    });
  }
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

