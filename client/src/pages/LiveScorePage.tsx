import { useEffect, useState } from 'react';
import { toApiError } from '../api/auth';
import { startMatch } from '../api/matches';
import { fetchTeams, type Team } from '../api/teams';
import { useAuth } from '../auth/AuthContext';
import Scorecard from '../live/Scorecard';
import { useLiveMatch } from '../live/useLiveMatch';
import { useRealtimeStatus } from '../realtime/RealtimeContext';

function AdminControls() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [overs, setOvers] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTeams()
      .then(setTeams)
      .catch(() => undefined);
  }, []);

  const start = async (random: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await startMatch(random ? undefined : [a, b], overs); // new state arrives over the WebSocket
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="card admin-controls">
      <summary>Admin: start a new match</summary>
      <div className="admin-row">
        <select value={a} onChange={(e) => setA(e.target.value)} aria-label="Home team">
          <option value="">Home team…</option>
          {teams.map((t) => (
            <option key={t.short} value={t.short}>
              {t.short}
            </option>
          ))}
        </select>
        <span>vs</span>
        <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Away team">
          <option value="">Away team…</option>
          {teams.map((t) => (
            <option key={t.short} value={t.short} disabled={t.short === a}>
              {t.short}
            </option>
          ))}
        </select>
        <label className="small">
          Overs{' '}
          <input
            type="number"
            min={1}
            max={20}
            value={overs}
            onChange={(e) => setOvers(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <button type="button" onClick={() => start(false)} disabled={busy || !a || !b || a === b}>
          Start
        </button>
        <button type="button" className="secondary" onClick={() => start(true)} disabled={busy}>
          Random teams
        </button>
      </div>
      <p className="muted small">Starting a match abandons the one in progress.</p>
      {error && <p className="field-error">{error}</p>}
    </details>
  );
}

export default function LiveScorePage() {
  const { user } = useAuth();
  const { score, error } = useLiveMatch(); // joins the "score" channel while this page is open
  const match = score === undefined ? undefined : score.match; // undefined = loading
  const status = useRealtimeStatus();

  return (
    <section className="wide">
      <div className="page-head">
        <div>
          <h2>Live score</h2>
          <p className="muted">Simulated IPL match, updated ball by ball over WebSocket.</p>
        </div>
        <span className={`conn ${status === 'open' ? 'on' : 'off'}`}>
          <span className={`live-dot ${status === 'open' ? 'on' : 'off'}`} />
          {status === 'open' ? 'Connected' : status === 'idle' ? 'Offline' : 'Reconnecting…'}
        </span>
      </div>

      {user?.role === 'admin' && <AdminControls />}

      {error && match === undefined && (
        <div className="alert" role="alert">
          Could not load the match: {error}
        </div>
      )}
      {match === undefined && !error && <p className="muted center">Loading match…</p>}
      {match === null && <p className="card muted center">No match yet. The next one starts shortly.</p>}
      {match && <Scorecard match={match} />}
    </section>
  );
}
