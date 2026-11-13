import { api } from './client';

export type FieldValue = string | number | null;

export interface NotificationChange {
  field: string;
  label: string;
  from?: FieldValue;
  to: FieldValue;
}

export interface Notification {
  id: string;
  team: string;
  teamShort: string;
  teamName: string;
  title: string;
  changes: NotificationChange[];
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  notifications: Notification[];
  unreadCount: number;
  nextCursor: string | null;
}

export async function fetchNotifications(params: { before?: string; limit?: number; unread?: boolean } = {}) {
  const { data } = await api.get<NotificationPage>('/notifications', {
    params: { limit: params.limit ?? 20, before: params.before, unread: params.unread ? 'true' : undefined },
  });
  return data;
}

export async function markNotificationRead(id: string): Promise<{ notification: Notification; unreadCount: number }> {
  const { data } = await api.patch(`/notifications/${encodeURIComponent(id)}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<{ updated: number; unreadCount: number }> {
  const { data } = await api.patch('/notifications/read-all');
  return data;
}
