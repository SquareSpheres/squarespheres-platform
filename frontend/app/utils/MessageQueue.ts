/**
 * Message queue for non-blocking message processing
 * 
 * Handles sequential processing of incoming messages (string, ArrayBuffer, or Blob)
 * while preventing blocking of the main thread. Ensures messages are processed
 * in order and handles errors gracefully.
 */
export class MessageQueue {
  private queue: (string | ArrayBuffer | Blob)[] = [];
  private processing = false;
  private handler: ((data: string | ArrayBuffer | Blob) => Promise<void>) | null = null;

  /**
   * Sets the message handler function
   */
  setHandler(handler: (data: string | ArrayBuffer | Blob) => Promise<void>) {
    this.handler = handler;
  }

  /**
   * Adds a message to the queue and starts processing if not already running
   */
  enqueue(data: string | ArrayBuffer | Blob) {
    this.queue.push(data);
    if (!this.processing) {
      this.process();
    }
  }

  /**
   * Processes messages sequentially from the queue
   */
  private async process() {
    if (this.processing || !this.handler) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const data = this.queue.shift()!;
      try {
        await this.handler(data);
      } catch (error) {
        console.error('[MessageQueue] Message processing error:', error);
      }
    }
    
    this.processing = false;
  }

  /**
   * Clears all pending messages from the queue
   */
  clear() {
    this.queue = [];
  }

  /**
   * Returns the current queue length
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Returns whether the queue is currently processing
   */
  get isProcessing(): boolean {
    return this.processing;
  }
}

