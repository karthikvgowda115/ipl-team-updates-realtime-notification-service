import { useState } from 'react';
import type { Team, TeamField } from '../api/teams';
import FieldPicker from './FieldPicker';
import TeamBadge from './TeamBadge';
import TeamEditor from './TeamEditor';
import { teamColors } from './teamColors';

interface Props {
  team: Team;
  busy: boolean;
  isAdmin: boolean;
  justChanged: string[]; // fields changed by a live update → highlighted briefly
  onToggleFollow: (team: Team) => void;
  onSaveFields: (team: Team, fields: TeamField[]) => Promise<void>;
}

export default function TeamCard({ team, busy, isAdmin, justChanged, onToggleFollow, onSaveFields }: Props) {
  const { bg } = teamColors(team.short);
  const [editing, setEditing] = useState(false);
  const hl = (f: string) => (justChanged.includes(f) ? 'changed' : undefined);

  return (
    <article className={`team-card${justChanged.length ? ' live-changed' : ''}`} style={{ borderTopColor: bg }}>
      <header className="team-card-head">
        <TeamBadge short={team.short} />
        <div className="team-card-title">
          <h3 className={hl('name')}>{team.name}</h3>
          <p className="muted small">
            <span className={hl('titles')}>
              {team.titles} {team.titles === 1 ? 'title' : 'titles'}
            </span>{' '}
            · {team.followers} {team.followers === 1 ? 'follower' : 'followers'}
          </p>
        </div>
        {isAdmin && !editing && (
          <button type="button" className="text-btn edit-team" onClick={() => setEditing(true)} aria-label={`Edit ${team.name}`}>
            ✎ Edit
          </button>
        )}
      </header>

      {editing ? (
        <TeamEditor team={team} onClose={() => setEditing(false)} />
      ) : (
        <>
          <dl className="team-facts">
            <dt>Captain</dt>
            <dd className={hl('captain')}>{team.captain}</dd>
            <dt>Head coach</dt>
            <dd className={hl('headCoach')}>{team.headCoach}</dd>
            <dt>Home ground</dt>
            <dd className={hl('homeGround')}>{team.homeGround}</dd>
          </dl>

          <div className="team-stats">
            <div className={hl('wins')}>
              <span className="stat-value">{team.wins}</span>
              <span className="stat-label">Wins</span>
            </div>
            <div className={hl('losses')}>
              <span className="stat-value">{team.losses}</span>
              <span className="stat-label">Losses</span>
            </div>
            <div className={hl('points')}>
              <span className="stat-value">{team.points}</span>
              <span className="stat-label">Points</span>
            </div>
          </div>
        </>
      )}

      {team.following && team.fields && (
        <FieldPicker teamShort={team.short} fields={team.fields} onSave={(fields) => onSaveFields(team, fields)} />
      )}

      <button
        type="button"
        className={team.following ? 'follow-btn following' : 'follow-btn'}
        onClick={() => onToggleFollow(team)}
        disabled={busy}
        aria-pressed={team.following}
        aria-label={`${team.following ? 'Unfollow' : 'Follow'} ${team.name}`}
      >
        {busy ? '…' : team.following ? '✓ Following' : '+ Follow'}
      </button>
    </article>
  );
}
