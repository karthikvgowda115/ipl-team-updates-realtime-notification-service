import type { ChangeStreamDocument, Document } from 'mongodb';
import { TEAM_FIELDS, TEAM_FIELD_LABELS as FIELD_LABELS, type TeamField } from '../models/Team';
import type { FieldValue, NotificationChange } from '../models/Notification';

const TRACKED = new Set<string>(TEAM_FIELDS);

function toValue(v: unknown): FieldValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return String(v);
}

/**
 * Turns one change-stream event on `teams` into the list of tracked fields that changed.
 * - update:  uses updateDescription (updatedFields + removedFields). Dotted paths
 *            (e.g. "stats.wins") map to their top-level field. updatedAt/_id etc. are ignored.
 * - replace: compares the pre-image with the new document (needs pre-images); without a
 *            pre-image every tracked field of the new document is reported.
 * If a pre-image is available, `from` is filled in and fields whose value didn't actually
 * change are dropped. Other operation types (insert/delete/...) produce no changes.
 */
export function diffTeamChange(event: ChangeStreamDocument<Document>): NotificationChange[] {
  if (event.operationType !== 'update' && event.operationType !== 'replace') return [];

  const after = event.fullDocument ?? undefined;
  const before = event.fullDocumentBeforeChange ?? undefined;

  let fields: TeamField[];
  if (event.operationType === 'update') {
    const { updatedFields = {}, removedFields = [] } = event.updateDescription ?? {};
    const touched = [...Object.keys(updatedFields), ...removedFields].map((p) => p.split('.')[0]);
    fields = TEAM_FIELDS.filter((f) => touched.includes(f)); // keeps a stable, schema order
  } else {
    fields = TEAM_FIELDS.filter((f) => after && (f in after || (before && f in before)));
  }

  const changes: NotificationChange[] = [];
  for (const field of fields) {
    if (!TRACKED.has(field)) continue;
    // For updates, the event's own updatedFields is the exact new value at the time of THIS
    // change. fullDocument (updateLookup) is read later and may already include newer updates,
    // so it's only used for dotted-path updates (e.g. "stats.wins") or as a last resort.
    let to: FieldValue;
    const upd = event.operationType === 'update' ? event.updateDescription : undefined;
    if (upd?.updatedFields && field in upd.updatedFields) to = toValue(upd.updatedFields[field]);
    else if (upd?.removedFields?.includes(field)) to = null;
    else if (after) to = toValue(after[field]);
    else continue;

    const change: NotificationChange = { field, label: FIELD_LABELS[field], to };
    if (before) {
      const from = toValue(before[field]);
      if (from === to) continue; // value set but not actually changed
      change.from = from;
    }
    changes.push(change);
  }
  return changes;
}
