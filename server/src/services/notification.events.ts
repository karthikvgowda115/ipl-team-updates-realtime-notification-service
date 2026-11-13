import { EventEmitter } from 'events';
import type { Types } from 'mongoose';
import type { NotificationDocument } from '../models/Notification';

export interface NotificationReadEvent {
  userId: Types.ObjectId;
  ids: string[] | 'all'; // which notifications became read
}

/**
 * In-process event bus between the notification service and the WebSocket layer.
 * - `created`: a notification was saved → push it to that user's open sockets.
 * - `read`: notifications were marked read → sync the user's other tabs/devices.
 * The service doesn't know about sockets; the WebSocket layer doesn't know about MongoDB.
 */
class NotificationEvents extends EventEmitter {
  emitCreated(notification: NotificationDocument): void {
    this.emit('created', notification);
  }
  onCreated(listener: (notification: NotificationDocument) => void): () => void {
    this.on('created', listener);
    return () => this.off('created', listener);
  }

  emitRead(event: NotificationReadEvent): void {
    this.emit('read', event);
  }
  onRead(listener: (event: NotificationReadEvent) => void): () => void {
    this.on('read', listener);
    return () => this.off('read', listener);
  }
}

export const notificationEvents = new NotificationEvents();
