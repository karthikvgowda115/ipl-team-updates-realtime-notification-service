import { useState, type FormEvent } from 'react';
import { toApiError } from '../api/auth';
import { adminUpdateTeam, type Team, type TeamPatch } from '../api/teams';

const TEXT: { key: 'name' | 'captain' | 'headCoach' | 'homeGround'; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'captain', label: 'Captain' },
  { key: 'headCoach', label: 'Head coach' },
  { key: 'homeGround', label: 'Home ground' },
];
const COUNTS: { key: 'titles' | 'wins' | 'losses' | 'points'; label: string }[] = [
  { key: 'titles', label: 'Titles' },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
  { key: 'points', label: 'Points' },
];

/**
 * Admin-only inline form. Sends only the fields that were changed, in one request →
 * one MongoDB update → one grouped notification for followers.
 */
export default function TeamEditor({
  team,
  onClose,
  onSaved,
}: {
  team: Team;
  onClose: () => void;
  onSaved?: (message: string) => void; // server's confirmation, e.g. "RCB updated (captain, wins)…"
}) {
  const [form, setForm] = useState(() => ({
    name: team.name,
    captain: team.captain,
    headCoach: team.headCoach,
    homeGround: team.homeGround,
    titles: String(team.titles),
    wins: String(team.wins),
    losses: String(team.losses),
    points: String(team.points),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const patch: TeamPatch = {};
  for (const { key } of TEXT) if (form[key].trim() !== team[key]) patch[key] = form[key].trim();
  for (const { key } of COUNTS) if (Number(form[key]) !== team[key]) patch[key] = Number(form[key]);
  const dirty = Object.keys(patch).length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      // One request with every changed field → one MongoDB update → one grouped notification.
      // The displayed values refresh from the team:update WebSocket push.
      const res = await adminUpdateTeam(team.id, patch);
      onSaved?.(res.message);
      onClose();
    } catch (err) {
      const apiErr = toApiError(err);
      setError(apiErr.message);
      setFieldErrors(apiErr.errors ?? {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="team-editor" onSubmit={submit}>
      <p className="small muted">Admin: edit {team.short}. Followers get one notification listing every changed field.</p>
      {TEXT.map(({ key, label }) => (
        <label key={key} className="editor-row">
          <span>{label}</span>
          <input
            value={form[key]}
            maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            aria-invalid={!!fieldErrors[key]}
          />
        </label>
      ))}
      <div className="editor-counts">
        {COUNTS.map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              aria-invalid={!!fieldErrors[key]}
            />
          </label>
        ))}
      </div>
      {Object.entries(fieldErrors).map(([k, v]) => (
        <p key={k} className="field-error">
          {k}: {v}
        </p>
      ))}
      {error && Object.keys(fieldErrors).length === 0 && <p className="field-error">{error}</p>}
      <div className="picker-actions">
        <span className="muted small">{dirty ? `Changing: ${Object.keys(patch).join(', ')}` : 'No changes yet'}</span>
        <span className="spacer" />
        <button type="button" className="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
