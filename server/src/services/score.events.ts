import { EventEmitter } from 'events';

/**
 * In-process bus between the match simulator (producer) and the WebSocket layer
 * (consumer). The payload is the public match view sent to browsers as-is.
 */
class ScoreEvents extends EventEmitter {
  emitUpdate(match: unknown): void {
    this.emit('update', match);
  }
  onUpdate(listener: (match: unknown) => void): () => void {
    this.on('update', listener);
    return () => this.off('update', listener);
  }
}

export const scoreEvents = new ScoreEvents();
