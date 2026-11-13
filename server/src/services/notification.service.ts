import { Types } from 'mongoose';
import { Notification, type NotificationChange, type NotificationDocument } from '../models/Notification';
import { Subscription } from '../models/Subscription';
import { HttpError } from '../types/errors';
import { notificationEvents } from './notification.events';

export interface TeamChangeEvent {
  eventId: string; // unique id of the change (change-stream event _id)
  teamId: Types.ObjectId;
  teamShort: string;
  teamName: string;
  changes: NotificationChange[]; // every tracked field that changed in this one update
}

/** Plain-text grouped notification, e.g. "RCB updated\nCaptain → X\nWins → 10". */
export function formatChangeMessage(teamShort: string, changes: NotificationChange[]): string {
  return [`${teamShort} updated`, ...changes.map((c) => `${c.label} → ${c.to ?? '(removed)'}`)].join('\n');
}

/**
 * Fan-out: one team update → one grouped notification per follower, containing only
 * the changed fields that follower subscribed to. Followers with no matching field get nothing.
 * Returns the notifications created (replayed events that already exist are skipped).
 */
export async function createTeamChangeNotifications(event: TeamChangeEvent): Promise<NotificationDocument[]> {
  if (event.changes.length === 0) return [];

  const subs = await Subscription.find({ team: event.teamId }).select('user fields').lean();

  const docs = subs.flatMap((s) => {
    const wanted = new Set(s.fields);
    const changes = event.changes.filter((c) => wanted.has(c.field));
    if (changes.length === 0) return [];
    return [
      {
        user: s.user,
        team: event.teamId,
        teamShort: event.teamShort,
        teamName: event.teamName,
        type: 'team_update' as const,
        title: `${event.teamShort} updated`,
        message: formatChangeMessage(event.teamShort, changes),
        changes,
        eventId: event.eventId,
      },
    ];
  });
  if (docs.length === 0) return [];

  let created: NotificationDocument[];
  try {
    created = (await Notification.insertMany(docs, { ordered: false })) as NotificationDocument[];
  } catch (err) {
    // Duplicate (user, eventId) = event already processed for that user (e.g. replay after
    // a restart). Keep the ones that did insert; rethrow anything else.
    const e = err as { code?: number; writeErrors?: { code?: number; err?: { code?: number } }[]; insertedDocs?: NotificationDocument[] };
    const allDup =
      e.code === 11000 ||
      (Array.isArray(e.writeErrors) && e.writeErrors.every((w) => (w.code ?? w.err?.code) === 11000));
    if (!allDup) throw err;
    created = e.insertedDocs ?? [];
  }

  for (const n of created) notificationEvents.emitCreated(n);
  return created;
}

// ---------------- read side (REST API) ----------------

export interface ListOptions {
  limit: number;
  before?: string; // notification id: return items older than this one
  unreadOnly: boolean;
}

export async function listNotifications(userId: Types.ObjectId, opts: ListOptions) {
  const filter: Record<string, unknown> = { user: userId };
  if (opts.unreadOnly) filter.read = false;
  if (opts.before) {
    if (!Types.ObjectId.isValid(opts.before)) throw new HttpError(400, 'Invalid "before" cursor');
    filter._id = { $lt: new Types.ObjectId(opts.before) };
  }

  // Fetch one extra to know whether there's another page.
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ _id: -1 }).limit(opts.limit + 1),
    countUnread(userId),
  ]);
  const hasMore = items.length > opts.limit;
  const page = hasMore ? items.slice(0, opts.limit) : items;

  return {
    notifications: page.map((n) => n.toJSON()),
    unreadCount,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export function countUnread(userId: Types.ObjectId): Promise<number> {
  return Notification.countDocuments({ user: userId, read: false });
}

/** Marks one of the user's notifications read. 404 if it isn't theirs / doesn't exist. */
export async function markRead(userId: Types.ObjectId, id: string): Promise<NotificationDocument> {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Notification not found');
  const n = await Notification.findOne({ _id: id, user: userId });
  if (!n) throw new HttpError(404, 'Notification not found');
  if (!n.read) {
    n.read = true;
    n.readAt = new Date();
    await n.save();
    notificationEvents.emitRead({ userId, ids: [n.id] });
  }
  return n;
}

export async function markAllRead(userId: Types.ObjectId): Promise<number> {
  const res = await Notification.updateMany({ user: userId, read: false }, { $set: { read: true, readAt: new Date() } });
  if (res.modifiedCount > 0) notificationEvents.emitRead({ userId, ids: 'all' });
  return res.modifiedCount;
}
