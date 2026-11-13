import { Link } from 'react-router-dom';
import type { LiveScore } from '../api/matches';
import TeamBadge from '../teams/TeamBadge';

const ballClass = (b: string) =>
  b === 'W' ? 'ball wicket' : b === '4' ? 'ball four' : b === '6' ? 'ball six' : /^(wd|nb)/.test(b) ? 'ball extra' : 'ball';

/**
 * Dashboard live scorecard: batting/bowling team, runs/wickets, overs of total overs,
 * the two batters (runs, balls, * = on strike), the bowler (overs, runs, wickets) and
 * the balls of the current over. Updated by the parent via the WebSocket "score" channel.
 */
export default function MiniScorecard({ live }: { live: LiveScore | null | undefined }) {
  if (live === undefined) return <p className="muted">Loading match…</p>;
  if (live === null) return <p className="muted">No match yet — the next one starts shortly.</p>;

  const status =
    live.status === 'live' ? (
      <span className="pill live">● LIVE</span>
    ) : live.status === 'innings_break' ? (
      <span className="pill break">Innings break</span>
    ) : (
      <span className="pill done">{live.status === 'abandoned' ? 'Abandoned' : 'Result'}</span>
    );

  return (
    <div className="mini-score">
      <div className="mini-head">
        {status}
        <span className="muted small">
          {live.title} · innings {live.innings}
        </span>
      </div>

      <div className="mini-main">
        <TeamBadge short={live.battingTeam.short} size={40} />
        <div>
          <div className="mini-runs">
            {live.battingTeam.short} <strong>{live.runs}/{live.wickets}</strong>
          </div>
          <div className="muted small">
            {live.overs} / {live.totalOvers} overs · bowling: {live.bowlingTeam.short}
          </div>
        </div>
      </div>

      <p className="score-line small">
        {live.result ??
          (live.required
            ? `Need ${live.required.runs} from ${live.required.balls} ball${live.required.balls === 1 ? '' : 's'}`
            : live.target
              ? `Target ${live.target}`
              : live.lastBall)}
      </p>

      {live.status === 'live' && (
        <>
          <ul className="mini-players">
            {live.batters.map((b) => (
              <li key={b.name}>
                <span>
                  {b.name}
                  {b.onStrike && <span className="on-strike" title="On strike"> *</span>}
                </span>
                <span>
                  <strong>{b.runs}</strong> ({b.balls})
                </span>
              </li>
            ))}
            {live.bowler && (
              <li className="bowler">
                <span>🎯 {live.bowler.name}</span>
                <span>
                  {live.bowler.overs}-{live.bowler.runs}-{live.bowler.wickets}
                </span>
              </li>
            )}
          </ul>
          <div className="this-over" aria-label="Balls in the current over">
            <span className="muted small">This over</span>
            {live.thisOver.length === 0 ? (
              <span className="muted small">—</span>
            ) : (
              live.thisOver.map((b, i) => (
                <span key={i} className={ballClass(b)}>
                  {b}
                </span>
              ))
            )}
          </div>
        </>
      )}

      <Link to="/live" className="btn-link small">
        Full scorecard →
      </Link>
    </div>
  );
}
