import { useState } from 'react';
import { toApiError } from '../api/auth';
import { FIELD_LABELS, TEAM_FIELDS, describeFields, type TeamField } from '../api/teams';

interface Props {
  teamShort: string;
  fields: TeamField[];
  onSave: (fields: TeamField[]) => Promise<void>;
}

/** "Notify me about" summary + inline editor with one checkbox per team field. */
export default function FieldPicker({ teamShort, fields, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Set<TeamField>>(new Set(fields));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setDraft(new Set(fields));
    setError(null);
    setEditing(true);
  };

  const toggle = (f: TeamField) =>
    setDraft((d) => {
      const copy = new Set(d);
      if (copy.has(f)) copy.delete(f);
      else copy.add(f);
      return copy;
    });

  const unchanged = draft.size === fields.length && fields.every((f) => draft.has(f));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(TEAM_FIELDS.filter((f) => draft.has(f)));
      setEditing(false);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="field-summary">
        <span className="muted small">
          🔔 Notify me about: <strong>{describeFields(fields)}</strong>
        </span>
        <button type="button" className="text-btn" onClick={open} aria-label={`Choose ${teamShort} notification fields`}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <fieldset className="field-picker">
      <legend className="small">Notify me when these change</legend>
      <div className="field-grid">
        {TEAM_FIELDS.map((f) => (
          <label key={f} className="check">
            <input type="checkbox" checked={draft.has(f)} onChange={() => toggle(f)} disabled={saving} />
            {FIELD_LABELS[f]}
          </label>
        ))}
      </div>
      <div className="picker-actions">
        <button type="button" className="text-btn" onClick={() => setDraft(new Set(TEAM_FIELDS))} disabled={saving}>
          Select all
        </button>
        <span className="spacer" />
        <button type="button" className="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving || draft.size === 0 || unchanged}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {draft.size === 0 && <p className="field-error">Pick at least one field (or unfollow the team).</p>}
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}
