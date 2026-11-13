import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { TEAM_FIELDS, type TeamField } from './Team';

export type FieldValue = string | number | null;
export const NOTIFICATION_TYPES = ['team_update'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** One changed field inside a grouped notification. */
export interface NotificationChange {
  field: TeamField;
  label: string; // human label, e.g. "Head coach"
  from?: FieldValue; // previous value — only when MongoDB pre-images are available
  to: FieldValue; // new value (null if the field was removed)
}

/**
 * One notification = one team update, grouped: all changed fields the user subscribed to.
 * Team name/short are copied in so old notifications still read correctly after renames.
 */
export interface INotification {
  user: Types.ObjectId;
  team: Types.ObjectId;
  teamShort: string;
  teamName: string;
  type: NotificationType; // what happened (currently only team updates)
  title: string; // e.g. "RCB updated"
  message: string; // plain-text body, one line per change: "RCB updated\nCaptain → X\nWins → 10"
  changes: NotificationChange[];
  read: boolean;
  readAt?: Date | null;
  /** Change-stream event id: makes processing idempotent (replayed events don't duplicate). */
  eventId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;

const changeSchema = new Schema<NotificationChange>(
  {
    field: { type: String, enum: TEAM_FIELDS, required: true },
    label: { type: String, required: true },
    from: { type: Schema.Types.Mixed },
    to: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    teamShort: { type: String, required: true },
    teamName: { type: String, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'team_update' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    changes: { type: [changeSchema], required: true },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    eventId: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.eventId;
        // Older notifications (before type/message existed) still get a complete shape.
        ret.type ??= 'team_update';
        ret.message ??= ret.title;
        // `value` = the new value (same as `to`), so each change also reads { field, value }.
        ret.changes = (ret.changes as NotificationChange[]).map((c) => ({ ...c, value: c.to }));
        return ret;
      },
    },
  },
);

// Newest-first listing per user (and paging by _id).
notificationSchema.index({ user: 1, _id: -1 });
// Unread count / unread filter.
notificationSchema.index({ user: 1, read: 1 });
// Idempotency: one notification per user per change event.
notificationSchema.index({ user: 1, eventId: 1 }, { unique: true });

export const Notification = model<INotification>('Notification', notificationSchema);
