import { Transform, TransformCallback } from 'stream';

export class Throttle extends Transform {
  private rate: number; // bytes per second
  private lastChunkTime: number;
  private bytesSent: number;

  constructor(rate: number) {
    super();
    this.rate = rate;
    this.lastChunkTime = Date.now();
    this.bytesSent = 0;
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
    const now = Date.now();
    const chunkSize = chunk.length;
    
    this.bytesSent += chunkSize;
    
    // Calculate expected time to send these bytes
    // bytes / (bytes/sec) = seconds
    const expectedTime = (chunkSize / this.rate) * 1000;
    
    // Calculate how much time has passed since last chunk
    // We want to smooth this out, so we might track total time vs total bytes
    // But for simple chunk-based throttling:
    
    const delay = Math.max(0, expectedTime - (now - this.lastChunkTime));
    
    this.lastChunkTime = now + delay;

    if (delay > 0) {
      setTimeout(() => {
        if (this.destroyed) return;
        this.push(chunk);
        callback();
      }, delay);
    } else {
      this.push(chunk);
      callback();
    }
  }
}
