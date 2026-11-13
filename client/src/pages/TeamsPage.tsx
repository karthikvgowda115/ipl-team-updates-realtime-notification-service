import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import TeamCard from '../teams/TeamCard';
import { useTeams } from '../teams/useTeams';

type Filter = 'all' | 'following';

export default function TeamsPage() {
  const { user } = useAuth();
  const { teams, error, actionError, busy, changed, load, toggleFollow, saveFields } = useTeams();
  const [filter, setFilter] = useState<Filter>('all');

  if (error) {
    return (
      <section className="card">
        <p className="bad">Could not load teams: {error}</p>
        <button onClick={load}>Try again</button>
      </section>
    );
  }
  if (!teams) return <p className="muted center">Loading teams…</p>;

  const followingCount = teams.filter((t) => t.following).length;
  const shown = filter === 'following' ? teams.filter((t) => t.following) : teams;

  return (
    <section className="wide">
      <div className="page-head">
        <div>
          <h2>IPL Teams</h2>
          <p className="muted">
            Follow teams to get notified when their details change, then choose exactly which fields you care about.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Filter teams">
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            All ({teams.length})
          </button>
          <button
            type="button"
            className={filter === 'following' ? 'active' : ''}
            onClick={() => setFilter('following')}
          >
            Following ({followingCount})
          </button>
        </div>
      </div>

      {actionError && (
        <div className="alert" role="alert">
          {actionError}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="muted center">You're not following any teams yet.</p>
      ) : (
        <div className="team-grid">
          {shown.map((t) => (
            <TeamCard
              key={t.id}
              team={t}
              busy={busy.has(t.short)}
              isAdmin={user?.role === 'admin'}
              justChanged={changed[t.short] ?? []}
              onToggleFollow={toggleFollow}
              onSaveFields={saveFields}
            />
          ))}
        </div>
      )}
    </section>
  );
}
