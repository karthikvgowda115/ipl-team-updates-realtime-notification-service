import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { TEAM_FIELDS, type TeamField } from './Team';

/** A user following a team. One document per (user, team). */
export interface ISubscription {
  user: Types.ObjectId;
  team: Types.ObjectId;
  /**
   * Team fields this user wants notifications for (at least one). Defaults to all fields.
   * A team update only notifies this user about the changed fields listed here.
   */
  fields: TeamField[];
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionDocument = HydratedDocument<ISubscription>;

const subscriptionSchema = new Schema<ISubscription>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    fields: {
      type: [{ type: String, enum: TEAM_FIELDS }],
      default: () => [...TEAM_FIELDS],
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'Choose at least one field',
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// A user can follow a team only once (also makes follow idempotent under races).
subscriptionSchema.index({ user: 1, team: 1 }, { unique: true });
// "Who follows this team?" — used by the notification service later.
subscriptionSchema.index({ team: 1 });

export const Subscription = model<ISubscription>('Subscription', subscriptionSchema);
