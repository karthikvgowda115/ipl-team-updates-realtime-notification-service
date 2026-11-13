import type { Server } from 'http';
import { countUnread } from '../services/notification.service';
import { notificationEvents } from '../services/notification.events';
import { scoreEvents } from '../services/score.events';
import { getCurrentScore } from '../simulator/matchSimulator';
import { teamEvents } from '../services/team.events';
import {
  attachWebSocketServer,
  broadcast,
  broadcastAuthenticated,
  isUserConnected,
  onChannelSubscribe,
  sendToUser,
} from './wsServer';

/**
 * Connects the app's event buses to the WebSocket server:
 *   notification saved   → push to that user's sockets       (notification:new)
 *   notifications read   → sync that user's other tabs        (notification:read)
 *   simulator ball       → broadcast to "score" subscribers   (score:update { live, match })
 *   team changed         → all logged-in users               (team:update)
 */
export function initWebSocket(server: Server) {
  const wss = attachWebSocketServer(server);

  notificationEvents.onCreated((n) => {
    const userId = String(n.user);
    if (!isUserConnected(userId)) return; // offline users see it from the REST API on next login
    countUnread(n.user)
      .then((unreadCount) => sendToUser(userId, { type: 'notification:new', notification: n.toJSON(), unreadCount }))
      .catch((err: Error) => console.error('[ws] push failed:', err.message));
  });

  notificationEvents.onRead(({ userId, ids }) => {
    const id = String(userId);
    if (!isUserConnected(id)) return;
    countUnread(userId)
      .then((unreadCount) => sendToUser(id, { type: 'notification:read', ids, unreadCount }))
      .catch((err: Error) => console.error('[ws] read sync failed:', err.message));
  });

  scoreEvents.onUpdate((payload) => broadcast('score', { type: 'score:update', ...(payload as { live: unknown; match: unknown }) }));

  // Live team values for open Teams/Dashboard pages (all logged-in users).
  teamEvents.onUpdated((team) => broadcastAuthenticated({ type: 'team:update', team }));

  // A new "score" subscriber immediately gets the current state instead of waiting for the next ball.
  onChannelSubscribe((channel, send) => {
    if (channel !== 'score') return;
    getCurrentScore()
      .then((payload) => send({ type: 'score:update', ...payload }))
      .catch((err: Error) => console.error('[ws] score snapshot failed:', err.message));
  });

  return wss;
}
