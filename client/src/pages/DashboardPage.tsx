import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import MiniScorecard from '../live/MiniScorecard';
import { useLiveMatch } from '../live/useLiveMatch';
import NotificationsPanel from '../notifications/NotificationsPanel';
import FieldPicker from '../teams/FieldPicker';
import TeamBadge from '../teams/TeamBadge';
import { useTeams } from '../teams/useTeams';

/**
 * User dashboard: welcome + stats, live scorecard, notifications, followed teams (with
 * "Notify me about" field selection and team stats) and discover teams — all live over
 * the WebSocket (notifications, team values, score), no refresh needed.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { teams, error, actionError, busy, changed, load, toggleFollow, saveFields } = useTeams();
  const { score } = useLiveMatch();
  const [unread, setUnread] = useState(0);

  if (!user) return null;

  const followed = teams?.filter((t) => t.following) ?? [];
  const discover = teams?.filter((t) => !t.following) ?? [];
  const live = score === undefined ? undefined : score.live;
  const hl = (short: string, field: string) => ((changed[short] ?? []).includes(field) ? 'changed' : undefined);

  return (
    <section className="wide dashboard">
      <div className="card welcome">
        <div>
          <h2>Welcome, {user.name} 👋</h2>
          <p className="muted">
            Signed in as <strong>{user.username ?? user.email}</strong> · member since{' '}
            {new Date(user.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="stat-tiles">
          <div className="stat-tile">
            <span className="stat-value">{teams ? followed.length : '–'}</span>
            <span className="stat-label">Teams followed</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{unread}</span>
            <span className="stat-label">Unread</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{live ? `${live.runs}/${live.wickets}` : '–'}</span>
            <span className="stat-label">{live ? `${live.battingTeam.short} · ${live.overs} ov` : 'Live match'}</span>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <NotificationsPanel onUnreadChange={setUnread} />

        <section className="card">
          <h2>Live scorecard</h2>
          <MiniScorecard live={live} />
        </section>
      </div>

      {error && (
        <div className="alert" role="alert">
          Could not load teams: {error}{' '}
          <button type="button" className="text-btn" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {actionError && (
        <div className="alert" role="alert">
          {actionError}
        </div>
      )}

      <section className="card">
        <div className="page-head">
          <h2>Teams you follow</h2>
          <Link to="/teams" className="btn-link">
            All teams →
          </Link>
        </div>
        {!teams && !error && <p className="muted">Loading…</p>}
        {teams && followed.length === 0 && (
          <p className="muted">You're not following any teams yet. Pick some from Discover teams below.</p>
        )}
        {followed.length > 0 && (
          <ul className="follow-list">
            {followed.map((t) => (
              <li key={t.id} className="followed">
                <TeamBadge short={t.short} size={40} />
                <div className="followed-main">
                  <strong className={hl(t.short, 'name')}>{t.name}</strong>
                  <span className="muted small">
                    Captain <span className={hl(t.short, 'captain')}>{t.captain}</span> · Coach{' '}
                    <span className={hl(t.short, 'headCoach')}>{t.headCoach}</span>
                  </span>
                  <div className="mini-stats" aria-label={`${t.short} stats`}>
                    <span className={hl(t.short, 'wins')}>
                      <strong>{t.wins}</strong> W
                    </span>
                    <span className={hl(t.short, 'losses')}>
                      <strong>{t.losses}</strong> L
                    </span>
                    <span className={hl(t.short, 'points')}>
                      <strong>{t.points}</strong> pts
                    </span>
                    <span className={hl(t.short, 'titles')}>
                      🏆 <strong>{t.titles}</strong>
                    </span>
                  </div>
                  {t.fields && (
                    <FieldPicker teamShort={t.short} fields={t.fields} onSave={(fields) => saveFields(t, fields)} />
                  )}
                </div>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => toggleFollow(t)}
                  disabled={busy.has(t.short)}
                  aria-label={`Unfollow ${t.name}`}
                >
                  {busy.has(t.short) ? '…' : 'Unfollow'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Discover teams</h2>
        {teams && discover.length === 0 && <p className="muted">You follow every team. 🎉</p>}
        {discover.length > 0 && (
          <ul className="discover-grid">
            {discover.map((t) => (
              <li key={t.id}>
                <TeamBadge short={t.short} size={36} />
                <div>
                  <strong>{t.name}</strong>
                  <span className="muted small">
                    {t.wins}W {t.losses}L · {t.points} pts · {t.followers} follower{t.followers === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => toggleFollow(t)}
                  disabled={busy.has(t.short)}
                  aria-label={`Follow ${t.name}`}
                >
                  {busy.has(t.short) ? '…' : '+ Follow'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          A new follow notifies you about every field — use “Notify me about” to pick only the ones you care about.
        </p>
      </section>
    </section>
  );
}
