import { Fragment, useCallback, useEffect, useState } from 'react';
import { toApiError } from '../api/auth';
import { fetchAdminTeams, type Team, type TeamSnapshot } from '../api/teams';
import { useAuth } from '../auth/AuthContext';
import { useRealtimeEvent } from '../realtime/RealtimeContext';
import TeamBadge from '../teams/TeamBadge';
import TeamEditor from '../teams/TeamEditor';

/**
 * /admin/dashboard — team management. Edits go to PATCH /api/admin/teams/:id; the table
 * then refreshes from the team:update WebSocket push, which also covers changes made by
 * scripts, mongosh or another admin.
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // team short
  const [notice, setNotice] = useState<string | null>(null);
  const [changed, setChanged] = useState<Record<string, string[]>>({});

  const load = useCallback(() => {
    setError(null);
    fetchAdminTeams()
      .then(setTeams)
      .catch((err) => setError(toApiError(err).message));
  }, []);
  useEffect(load, [load]);

  useRealtimeEvent('team:update', (msg) => {
    const { changed: fields, ...values } = msg.team as TeamSnapshot;
    setTeams((ts) => ts?.map((t) => (t.short === values.short ? { ...t, ...values } : t)) ?? ts);
    setChanged((c) => ({ ...c, [values.short]: fields }));
    window.setTimeout(() => setChanged((c) => ({ ...c, [values.short]: [] })), 4000);
  });

  const hl = (short: string, field: string) => ((changed[short] ?? []).includes(field) ? 'changed' : undefined);

  return (
    <section className="wide">
      <div className="page-head">
        <div>
          <h2>Admin dashboard</h2>
          <p className="muted">
            Signed in as <strong>{user?.username ?? user?.email}</strong>. Changes made here — or via the API,
            scripts or mongosh — notify each team's followers in real time.
          </p>
        </div>
        <button type="button" className="secondary" onClick={load}>
          Refresh
        </button>
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          Could not load teams: {error}
        </div>
      )}
      {!teams && !error && <p className="muted center">Loading teams…</p>}

      {teams && (
        <div className="card table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Captain</th>
                <th>Head coach</th>
                <th>Home ground</th>
                <th>Titles</th>
                <th>W</th>
                <th>L</th>
                <th>Pts</th>
                <th>Followers</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <Fragment key={t.id}>
                  <tr className={editing === t.short ? 'editing' : undefined}>
                    <td>
                      <div className="team-cell">
                        <TeamBadge short={t.short} size={30} />
                        <span className={hl(t.short, 'name')}>{t.name}</span>
                      </div>
                    </td>
                    <td className={hl(t.short, 'captain')}>{t.captain}</td>
                    <td className={hl(t.short, 'headCoach')}>{t.headCoach}</td>
                    <td className={`ground ${hl(t.short, 'homeGround') ?? ''}`}>{t.homeGround}</td>
                    <td className={`num ${hl(t.short, 'titles') ?? ''}`}>{t.titles}</td>
                    <td className={`num ${hl(t.short, 'wins') ?? ''}`}>{t.wins}</td>
                    <td className={`num ${hl(t.short, 'losses') ?? ''}`}>{t.losses}</td>
                    <td className={`num ${hl(t.short, 'points') ?? ''}`}>
                      <strong>{t.points}</strong>
                    </td>
                    <td className="num">{t.followers}</td>
                    <td>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => setEditing(editing === t.short ? null : t.short)}
                        aria-expanded={editing === t.short}
                        aria-label={`Edit ${t.name}`}
                      >
                        {editing === t.short ? 'Close' : '✎ Edit'}
                      </button>
                    </td>
                  </tr>
                  {editing === t.short && (
                    <tr className="editor-row-wrap">
                      <td colSpan={10}>
                        <TeamEditor
                          team={t}
                          onClose={() => setEditing(null)}
                          onSaved={(message) => setNotice(message)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
