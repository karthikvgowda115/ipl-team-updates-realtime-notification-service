import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '../api/notifications';
import TeamBadge from '../teams/TeamBadge';
import { useRealtimeEvent } from './RealtimeContext';

const TOAST_MS = 6000;
const MAX_TOASTS = 3;

/** Pop-up for notifications pushed over the WebSocket, shown on any page. */
export default function NotificationToasts() {
  const [toasts, setToasts] = useState<Notification[]>([]);
  const navigate = useNavigate();

  const dismiss = (id: string) => setToasts((ts) => ts.filter((t) => t.id !== id));

  useRealtimeEvent('notification:new', (msg) => {
    const n = msg.notification as Notification;
    setToasts((ts) => [n, ...ts.filter((t) => t.id !== n.id)].slice(0, MAX_TOASTS));
    window.setTimeout(() => dismiss(n.id), TOAST_MS);
  });

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((n) => (
        <div key={n.id} className="toast">
          <TeamBadge short={n.teamShort} size={32} />
          <button
            type="button"
            className="toast-body"
            onClick={() => {
              dismiss(n.id);
              navigate('/dashboard');
            }}
          >
            <strong>{n.title}</strong>
            {n.changes.map((c) => (
              <span key={c.field}>
                {c.label} → {c.to === null ? '(removed)' : String(c.to)}
              </span>
            ))}
          </button>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
